import os
import asyncio
from pathlib import Path
from typing import AsyncGenerator, Optional

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# --- Configuration ---
load_dotenv()
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash-latest")  # Allow override via env
STATIC_DIR = Path(os.environ.get("STATIC_DIR", "static"))
INDEX_FILE = STATIC_DIR / "index.html"


# --- Key Management with Round-Robin and Fallback ---
class GeminiKeyManager:
    """Round-robin through multiple Gemini API keys with fallback on failure.

    Thread-safe for asyncio via an internal lock. Starts with the *current* key,
    then advances the pointer for the next request.
    """

    def __init__(self) -> None:
        keys_str = os.environ.get("GEMINI_API_KEYS")
        if not keys_str:
            raise ValueError(
                "GEMINI_API_KEYS not found in .env or environment. Provide a comma-separated list of one or more keys."
            )

        self.keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        if not self.keys:
            raise ValueError("GEMINI_API_KEYS is empty after parsing. Provide at least one valid key.")

        self._idx = 0
        self._lock = asyncio.Lock()
        print(f"KeyManager initialized with {len(self.keys)} API key(s). Starting index: {self._idx}")

    async def _reserve_start_index(self) -> int:
        """Return the current index and advance for the *next* request (round-robin)."""
        async with self._lock:
            start = self._idx
            self._idx = (self._idx + 1) % len(self.keys)
            return start

    async def generate_content_streaming(self, prompt: str) -> AsyncGenerator[str, None]:
        """Stream model output. Tries each key in round-robin order starting at the reserved index.

        Yields plain text chunks as they arrive. If all keys fail, yields a final
        fatal message and raises the last exception to signal upstream.
        """
        start_index = await self._reserve_start_index()
        last_error: Optional[Exception] = None

        for attempt in range(len(self.keys)):
            key_index = (start_index + attempt) % len(self.keys)
            api_key = self.keys[key_index]

            try:
                print(f"[Gemini] Attempting generation with key index: {key_index}")
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(MODEL_NAME)

                # google.generativeai streaming iterator (sync iterable)
                response = model.generate_content(prompt, stream=True)

                for chunk in response:  # type: ignore[assignment]
                    # Be defensive: some chunks may not have text
                    text = getattr(chunk, "text", None)
                    if text:
                        # Important: ensure newlines are forwarded as-is for better UX
                        yield text

                print(f"[Gemini] Successfully generated response with key index: {key_index}")
                return

            except asyncio.CancelledError:
                # Propagate cancellations cleanly for client disconnects
                print("[Gemini] Streaming cancelled by client.")
                raise
            except Exception as e:  # noqa: BLE001 - we want to bubble the last error
                last_error = e
                print(f"[Gemini] Error with key index {key_index}: {e}")
                # Try the next key in the next loop iteration
                continue

        # If we reach here, all keys failed
        msg = f"// FATAL: All API keys failed. Last error: {last_error}"
        # Yield a final human-readable line for logs/clients, then raise
        yield msg
        if last_error:
            raise last_error
        else:
            raise RuntimeError("All API keys failed for an unknown reason.")


# --- Prompt Engineering: Structured for Instructions and Code ---
INSTRUCTIONS_FORMAT = (
    """
**Output Format:**
You MUST follow this structure precisely.
1.  Start with the `[INSTRUCTIONS]` tag.
2.  Write a clear "How to Play" section explaining the game's controls and objective.
3.  End the instructions with the `[END_INSTRUCTIONS]` tag.
4.  Immediately after `[END_INSTRUCTIONS]`, with no extra lines or text, provide the complete HTML code starting with `<!DOCTYPE html>`.

**Example Output Structure:**
[INSTRUCTIONS]
Objective: Don't let the ball hit the floor.
Controls: Use the mouse to move the paddle left and right.
[END_INSTRUCTIONS]
<!DOCTYPE html>
<html>
...
</html>
"""
).strip()

PROMPT_GENERATE = (
    """
You are an expert web game developer. Your task is to create a complete, playable web game in a single HTML file based on the user's request, and provide instructions on how to play it.

**Core Requirements:**
- **Single File:** Generate a single HTML file with all CSS in `<style>` and all JS in `<script>`. No external files.
- **Playable:** The game must be fully functional. Use the HTML Canvas API for 2D games.

{INSTRUCTIONS_FORMAT}

**User's Game Request:** "{user_prompt}"

Generate the response now.
"""
).strip()

PROMPT_MODIFY = (
    """
You are an expert web game developer. You are helping a user debug or modify a game you previously created.

Here is the current, complete code of the game:
```html
{current_code}
```

Here are the latest browser console logs (if any) that may indicate errors/warnings:
```
{console_logs}
```

**User's Modification or Bug Report:** "{user_prompt}"

**Your Task:**
1.  Analyze the user's request, the existing code, and any console logs.
2.  Provide the complete, updated HTML file along with updated "How to Play" instructions that reflect the changes.

{INSTRUCTIONS_FORMAT}

Generate the complete and updated response now.
"""
).strip()


# --- FastAPI Application ---
app = FastAPI(title="Gemini Game Generator", version="1.1.0")

# Optional CORS for local dev / simple frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize the Key Manager at import-time so failures are loud and early
try:
    key_manager = GeminiKeyManager()
except ValueError as e:
    # Don't call exit() in import-time code when deployed to ASGI; raise instead.
    raise RuntimeError(f"FATAL: Could not start application. {e}") from e


# Pydantic models for request bodies
class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="User's natural-language game idea")


class ModifyRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Change request or bug report")
    current_code: str = Field(..., min_length=1, description="Full HTML code to modify")
    console_logs: str = Field("", description="Optional console logs captured from the browser")


# Static files mounting (if the directory exists)
if STATIC_DIR.exists() and STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
else:
    print(f"[Warn] Static directory '{STATIC_DIR}' not found. /static will not be served.")


@app.get("/", response_class=HTMLResponse)
async def read_root() -> HTMLResponse:
    if INDEX_FILE.exists():
        return HTMLResponse(content=INDEX_FILE.read_text(encoding="utf-8"), status_code=200)
    # Provide a minimal landing page when static/index.html is missing
    html = (
        """
        <!doctype html>
        <html>
          <head>
            <meta charset='utf-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1'>
            <title>Gemini Game Generator</title>
            <style>
              body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,'Noto Sans','Liberation Sans',sans-serif;padding:2rem;max-width:820px;margin:auto;}
              pre{white-space:pre-wrap;word-wrap:break-word;background:#f6f8fa;border:1px solid #e5e7eb;border-radius:12px;padding:1rem}
              code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace}
              .muted{color:#6b7280}
            </style>
          </head>
          <body>
            <h1>Gemini Game Generator</h1>
            <p class="muted">Place a custom frontend at <code>static/index.html</code> to replace this page.</p>
            <pre><code>POST /generate {"prompt": "Make a Flappy Bird clone set in space"}
POST /modify   {"prompt": "Make pipes move faster", "current_code": "<!DOCTYPE html>..."}</code></pre>
          </body>
        </html>
        """
    ).strip()
    return HTMLResponse(content=html, status_code=200)


@app.get("/healthz", response_class=PlainTextResponse)
async def healthz() -> PlainTextResponse:
    return PlainTextResponse("ok", status_code=200)


@app.post("/generate")
async def generate_game(req: GenerateRequest):
    try:
        final_prompt = PROMPT_GENERATE.format(
            INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT, user_prompt=req.prompt
        )
    except Exception as e:  # Extremely unlikely, but fail fast
        raise HTTPException(status_code=500, detail=f"Prompt assembly failed: {e}") from e

    async def streamer():
        async for chunk in key_manager.generate_content_streaming(final_prompt):
            yield chunk

    return StreamingResponse(streamer(), media_type="text/plain; charset=utf-8")


@app.post("/modify")
async def modify_game(req: ModifyRequest):
    try:
        final_prompt = PROMPT_MODIFY.format(
            user_prompt=req.prompt,
            current_code=req.current_code,
            console_logs=req.console_logs,
            INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prompt assembly failed: {e}") from e

    async def streamer():
        async for chunk in key_manager.generate_content_streaming(final_prompt):
            yield chunk

    return StreamingResponse(streamer(), media_type="text/plain; charset=utf-8")
