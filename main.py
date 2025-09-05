import os
import asyncio
import itertools
from pathlib import Path
from typing import AsyncGenerator, List, Optional

import openai
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Configuration (IMPROVED FOR MULTI-MODEL) ---
class AppSettings(BaseSettings):
    """Manages application settings using Pydantic for validation."""
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    # Primary (Gemini) settings
    primary_model_name: str = Field(default="gemini-1.5-flash-latest", alias="PRIMARY_AI_MODEL_NAME")
    gemini_api_keys: str = Field(default="", alias="GEMINI_API_KEYS")

    # Fallback (Requesty) settings
    fallback_model_name: str = Field(default="gemini-1.5-pro-latest", alias="AI_MODEL_NAME")
    requesty_api_key: str = Field(..., alias="REQUESTY_API_KEY")
    requesty_site_url: str = Field(default="", alias="REQUESTY_SITE_URL")
    requesty_site_name: str = Field(default="AI Game Gen", alias="REQUESTY_SITE_NAME")
    
    cors_allow_origins: str = Field(default="*", alias="CORS_ALLOW_ORIGINS")
    static_dir: Path = Field(default=Path("static"), alias="STATIC_DIR")

    @property
    def index_file(self) -> Path:
        return self.static_dir / "index.html"
    
    # Custom validator to split comma-separated keys
    def __init__(self, **values):
        super().__init__(**values)
        if isinstance(self.gemini_api_keys, str):
            self.gemini_api_keys = [key.strip() for key in self.gemini_api_keys.split(',') if key.strip()]

# Load settings and handle potential errors at startup
try:
    settings = AppSettings()
except Exception as e:
    raise RuntimeError(f"FATAL: Configuration error. Is your .env file set up correctly? Details: {e}")


# --- Model Managers ---

class GeminiModelManager:
    """Connects to Google Gemini models and handles round-robin key switching."""
    def __init__(self, config: AppSettings):
        self.model_name = config.primary_model_name
        self.keys = config.gemini_api_keys
        if not self.keys:
            raise ValueError("GeminiModelManager initialized but no GEMINI_API_KEYS were provided.")
        self.key_cycler = itertools.cycle(self.keys)
        self.generation_config = genai.GenerationConfig(
            temperature=0.7,
            top_p=1,
            top_k=1
        )
        print(f"Gemini Manager initialized for model: {self.model_name} with {len(self.keys)} API key(s).")

    async def generate_content_streaming(self, prompt: str) -> AsyncGenerator[str, None]:
        """Stream model output using the Gemini API."""
        api_key = next(self.key_cycler)
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(self.model_name)
        
        print(f"[Gemini] Attempting generation with model {self.model_name}")
        stream = await model.generate_content_async(
            prompt,
            stream=True,
            generation_config=self.generation_config
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
        print("[Gemini] Successfully generated response.")

class RequestyModelManager:
    """Connects to a model via the Requesty.ai router using the OpenAI SDK."""
    def __init__(self, config: AppSettings):
        self.model_name = config.fallback_model_name
        headers = {
            "HTTP-Referer": config.requesty_site_url,
            "X-Title": config.requesty_site_name,
        }
        self.client = openai.AsyncOpenAI(
            api_key=config.requesty_api_key,
            base_url="https://router.requesty.ai/v1",
            default_headers={k: v for k, v in headers.items() if v},
        )
        print(f"Requesty Fallback Manager initialized for model: {self.model_name}")

    async def generate_content_streaming(self, prompt: str, request: Request) -> AsyncGenerator[str, None]:
        """Stream model output using the OpenAI chat completions API."""
        print(f"[Requesty] Attempting generation with model {self.model_name}")
        stream = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        async for chunk in stream:
            if await request.is_disconnected():
                print("[Requesty] Client disconnected. Cancelling stream.")
                break
            content = chunk.choices[0].delta.content
            if content:
                yield content
        print("[Requesty] Successfully generated response.")

class MultiModelManager:
    """Orchestrates model selection, attempting Gemini first and falling back to Requesty."""
    def __init__(self, config: AppSettings):
        self.gemini_manager: Optional[GeminiModelManager] = None
        if config.gemini_api_keys:
            try:
                self.gemini_manager = GeminiModelManager(config)
            except ValueError as e:
                print(f"Warning: Could not initialize Gemini Manager. {e}")
        
        self.requesty_manager = RequestyModelManager(config)

    async def generate_content_streaming(self, prompt: str, request: Request) -> AsyncGenerator[str, None]:
        """Tries Gemini first, then falls back to Requesty on any failure."""
        if self.gemini_manager:
            try:
                async for chunk in self.gemini_manager.generate_content_streaming(prompt):
                    yield chunk
                return # Success, so we exit the generator
            except Exception as e:
                print(f"[Orchestrator] Gemini failed with error: {e}. Falling back to Requesty.")
                yield f"// INFO: Primary model failed. Retrying with fallback...\n"

        # Fallback logic
        print("[Orchestrator] Using fallback: Requesty.")
        async for chunk in self.requesty_manager.generate_content_streaming(prompt, request):
            yield chunk

# --- Prompt Engineering (Unchanged) ---
INSTRUCTIONS_FORMAT = (
    """
**Output Format:**
You MUST follow this structure precisely.
1.  Start with the `[INSTRUCTIONS]` tag.
2.  Write a clear "How to Play" section explaining the game's controls and objective.
3.  End the instructions with the `[END_INSTRUCTIONS]` tag.
4.  Immediately after `[END_INSTRUCTIONS]`, with no extra lines or text, provide the complete HTML code starting with `<!DOCTYPE html>`.
"""
).strip()

PROMPT_GENERATE = (
    """
You are an expert web game developer and designer. Your job is to create a **fun, polished, and fully playable game** in a single HTML file based on the user's request.

**Core Requirements:**
- **Single File & No External Assets:** Provide the complete game in one HTML file. All CSS in `<style>`, all JS in `<script>`. Do NOT use external images, fonts, or libraries. All visuals must be generated with code (Canvas, CSS, SVG). Any sounds must be generated with the Web Audio API.
- **Polished Gameplay:** The game must be engaging, balanced, and bug-free. Add small design touches like smooth animations, clear win/lose states, scoring, and difficulty progression.
- **Clean Code:** Write modular, readable JavaScript with helpful comments. Use `requestAnimationFrame` for the game loop.
- **Responsiveness:** Ensure the game's canvas scales well to different screen sizes.
- **Instructions First:** Provide clear player instructions first (between `[INSTRUCTIONS]` and `[END_INSTRUCTIONS]`), then the full HTML file.

{INSTRUCTIONS_FORMAT}

**User's Game Request:** "{user_prompt}"

Generate the response now.
"""
).strip()


PROMPT_MODIFY = (
    """
You are an expert web game developer. You are helping a user **improve or debug an existing game**.

**Conversation History:**
{prompt_history}

**Current Game Code:**
```html
{current_code}
```

**Browser Console Logs (if any):**
```
{console_logs}
```

**User's New Request:**
"{user_prompt}"

**Your Task:**
1.  **Analyze the Request:** Carefully consider the user's request, the conversation history, the existing code, and any console errors.
2.  **Debug & Implement:** Fix any bugs identified by the console logs or the user's description. Implement the requested features or changes.
3.  **Refine & Polish:** Improve the code quality, visuals, animations, and overall gameplay feel. Ensure the game remains fully functional in a single HTML file.
4.  **Provide Output:** Generate the complete, updated game. Start with the updated instructions between `[INSTRUCTIONS]` and `[END_INSTRUCTIONS]`, followed immediately by the full HTML code.

{INSTRUCTIONS_FORMAT}

Generate the complete and updated response now.
"""
).strip()


# --- FastAPI Application ---
app = FastAPI(title="AI Game Generator", version="2.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins.split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Initialize the main orchestrator
model_manager = MultiModelManager(settings)

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)

class ModifyRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    current_code: str = Field(..., min_length=1)
    console_logs: str = ""
    prompt_history: List[str] = Field(default_factory=list, description="The history of prompts for context.")

if settings.static_dir.exists() and settings.static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    if settings.index_file.exists():
        return HTMLResponse(content=settings.index_file.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>AI Game Generator Backend</h1><p>Static frontend not found.</p>")

@app.get("/healthz", response_class=PlainTextResponse)
async def healthz():
    return PlainTextResponse("ok")

@app.post("/generate")
async def generate_game(req: GenerateRequest, request: Request):
    final_prompt = PROMPT_GENERATE.format(
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT, user_prompt=req.prompt
    )
    return StreamingResponse(
        model_manager.generate_content_streaming(final_prompt, request),
        media_type="text/plain; charset=utf-8"
    )

@app.post("/modify")
async def modify_game(req: ModifyRequest, request: Request):
    if req.prompt_history:
        history_str = "\n".join(f"- {p}" for p in req.prompt_history)
    else:
        history_str = "No history provided."

    final_prompt = PROMPT_MODIFY.format(
        user_prompt=req.prompt,
        current_code=req.current_code,
        console_logs=req.console_logs or "No console logs provided.",
        prompt_history=history_str,
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT,
    )
    return StreamingResponse(
        model_manager.generate_content_streaming(final_prompt, request),
        media_type="text/plain; charset=utf-8"
    )