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

# --- Configuration ---
class AppSettings(BaseSettings):
    """Manages application settings using Pydantic for validation."""
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')
    primary_model_name: str = Field(default="gemini-1.5-flash-latest", alias="PRIMARY_AI_MODEL_NAME")
    gemini_api_keys: str = Field(default="", alias="GEMINI_API_KEYS")
    fallback_model_name: str = Field(default="gemini-1.5-pro-latest", alias="AI_MODEL_NAME")
    requesty_api_key: str = Field(..., alias="REQUESTY_API_KEY")
    requesty_site_url: str = Field(default="", alias="REQUESTY_SITE_URL")
    requesty_site_name: str = Field(default="AI Visualization Generator", alias="REQUESTY_SITE_NAME")
    cors_allow_origins: str = Field(default="*", alias="CORS_ALLOW_ORIGINS")
    static_dir: Path = Field(default=Path("static"), alias="STATIC_DIR")

    @property
    def index_file(self) -> Path:
        return self.static_dir / "index.html"
    
    def __init__(self, **values):
        super().__init__(**values)
        if isinstance(self.gemini_api_keys, str):
            self.gemini_api_keys = [key.strip() for key in self.gemini_api_keys.split(',') if key.strip()]

try:
    settings = AppSettings()
except Exception as e:
    raise RuntimeError(f"FATAL: Configuration error. Is your .env file set up correctly? Details: {e}")


# --- Model Managers (Unchanged) ---
# This section is already generic and requires no changes.

class GeminiModelManager:
    def __init__(self, config: AppSettings):
        self.model_name = config.primary_model_name
        self.keys = config.gemini_api_keys
        if not self.keys:
            raise ValueError("GeminiModelManager initialized but no GEMINI_API_KEYS were provided.")
        self.key_cycler = itertools.cycle(self.keys)
        self.generation_config = genai.GenerationConfig(temperature=0.7, top_p=1, top_k=1)
        print(f"Gemini Manager initialized for model: {self.model_name} with {len(self.keys)} API key(s).")
    async def generate_content_streaming_with_key(self, prompt: str, api_key: str) -> AsyncGenerator[str, None]:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(self.model_name)
        print(f"[Gemini] Attempting generation with model {self.model_name} using key ending in ...{api_key[-4:]}")
        stream = await model.generate_content_async(prompt, stream=True, generation_config=self.generation_config)
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
        print(f"[Gemini] Successfully generated response with key ending in ...{api_key[-4:]}")
    async def generate_content_streaming(self, prompt: str) -> AsyncGenerator[str, None]:
        api_key = next(self.key_cycler)
        async for chunk in self.generate_content_streaming_with_key(prompt, api_key):
            yield chunk
    async def try_all_keys_streaming(self, prompt: str) -> AsyncGenerator[str, None]:
        last_exception = None
        for i, api_key in enumerate(self.keys):
            try:
                print(f"[Gemini] Trying key {i+1}/{len(self.keys)} (ending in ...{api_key[-4:]})")
                async for chunk in self.generate_content_streaming_with_key(prompt, api_key):
                    yield chunk
                return
            except Exception as e:
                last_exception = e
                print(f"[Gemini] Key {i+1}/{len(self.keys)} failed: {str(e)}")
                continue
        print(f"[Gemini] All {len(self.keys)} API keys failed. Last error: {last_exception}")
        raise last_exception or Exception("All Gemini API keys failed")

class RequestyModelManager:
    def __init__(self, config: AppSettings):
        self.model_name = config.fallback_model_name
        headers = {"HTTP-Referer": config.requesty_site_url, "X-Title": config.requesty_site_name}
        self.client = openai.AsyncOpenAI(api_key=config.requesty_api_key, base_url="https://router.requesty.ai/v1", default_headers={k: v for k, v in headers.items() if v})
        print(f"Requesty Fallback Manager initialized for model: {self.model_name}")
    async def generate_content_streaming(self, prompt: str, request: Request) -> AsyncGenerator[str, None]:
        print(f"[Requesty] Attempting generation with model {self.model_name}")
        stream = await self.client.chat.completions.create(model=self.model_name, messages=[{"role": "user", "content": prompt}], stream=True)
        async for chunk in stream:
            if await request.is_disconnected():
                print("[Requesty] Client disconnected. Cancelling stream.")
                break
            content = chunk.choices[0].delta.content
            if content:
                yield content
        print("[Requesty] Successfully generated response.")

class MultiModelManager:
    def __init__(self, config: AppSettings):
        self.gemini_manager: Optional[GeminiModelManager] = None
        if config.gemini_api_keys:
            try:
                self.gemini_manager = GeminiModelManager(config)
            except ValueError as e:
                print(f"Warning: Could not initialize Gemini Manager. {e}")
        self.requesty_manager = RequestyModelManager(config)
    async def generate_content_streaming(self, prompt: str, request: Request) -> AsyncGenerator[str, None]:
        if self.gemini_manager:
            try:
                print("[Orchestrator] Attempting generation with all available Gemini keys...")
                async for chunk in self.gemini_manager.try_all_keys_streaming(prompt):
                    yield chunk
                return
            except Exception as e:
                print(f"[Orchestrator] All Gemini keys failed with final error: {e}. Falling back to Requesty.")
                yield f"// INFO: All primary model keys failed. Retrying with fallback model...\n"
        print("[Orchestrator] Using fallback: Requesty.")
        async for chunk in self.requesty_manager.generate_content_streaming(prompt, request):
            yield chunk


# --- Prompts (UPDATED FOLLOW-UP PROMPT) ---
INSTRUCTIONS_FORMAT_V2 = (
    """
**Output Format:**
You MUST follow this structure precisely. Each section must be clearly marked with its start and end tag.
1.  **[ANALYSIS]**: Explain your plan. Describe how you will approach the request and what key features or changes you will implement for this visualization or application.
2.  **[END_ANALYSIS]**
3.  **[CHANGES]** (For modifications only): Provide a concise bulleted list of the key changes you made to the code. If this is the first generation, write "Initial generation of the project." inside this block.
4.  **[END_CHANGES]**
5.  **[INSTRUCTIONS]**: Write clear 'Instructions / Notes' explaining how to use or interact with the visualization.
6.  **[END_INSTRUCTIONS]**
7.  **HTML Code**: Immediately after `[END_INSTRUCTIONS]`, provide the complete HTML code starting with `<!DOCTYPE html>`.
"""
).strip()

PROMPT_GENERATE = (
    """
You are an expert web developer and designer specializing in creating interactive data visualizations, educational materials, and simple web applications. Your task is to generate a complete, single-file HTML web page based on the user's request.

**Core Requirements:**
- **Single File & No External Assets:** Provide the complete project in one HTML file. All CSS in `<style>`, all JS in `<script>`.
- **Polished & Functional:** The output must be well-designed, functional, and bug-free. Add small design touches for a better user experience.
- **Clean Code:** Write modular, readable JavaScript with helpful comments.
- **Responsiveness:** Ensure the content scales well to different screen sizes where applicable.

{INSTRUCTIONS_FORMAT}

**User's Request:** "{user_prompt}"

Generate the response now.
"""
).strip()


PROMPT_MODIFY = (
    """
You are an expert web developer. You are helping a user **improve or debug an existing web visualization or application**.

**Conversation History:**
{prompt_history}

**Current Project Code:**
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
1.  **Analyze & Plan:** Carefully consider the user's request, history, code, and logs. Explain your plan in the `[ANALYSIS]` block.
2.  **Debug & Implement:** Fix bugs and implement the requested features.
3.  **Summarize Changes:** Detail your modifications in a bulleted list in the `[CHANGES]` block.
4.  **Update Instructions:** Update the 'Instructions / Notes' in the `[INSTRUCTIONS]` block.
5.  **Provide Full Code:** Generate the complete, updated project as a single HTML file.

{INSTRUCTIONS_FORMAT}

Generate the complete and updated response now.
"""
).strip()

PROMPT_FOLLOW_UP = (
    """
You are a versatile AI assistant and expert web developer. The user has an existing web application/visualization and is asking a follow-up question about it.

**User's Question:** "{user_question}"

**The Current Code for Context:**
```html
{code_to_explain}
```

**Your Task:**
1.  **Analyze the Request:** Understand the user's intent. Are they asking for a code explanation, a conceptual clarification, a design suggestion, or an alternative approach?
2.  **Provide a Comprehensive Answer:** Address the user's question directly and thoroughly.
3.  **Leverage the Code Context:** When relevant, refer to specific parts of the provided code to make your answer more concrete and helpful.
4.  **Use Clear Formatting:** Use Markdown (code snippets using backticks ` `, bullet points, and bold text) to make your answer easy to read.
5.  **Maintain a Helpful, Collaborative Tone:** Act as an expert partner, offering clear explanations and creative insights.

Generate your helpful response now.
"""
).strip()


# --- FastAPI Application ---
app = FastAPI(title="AI Web Visualization Generator", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins.split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

model_manager = MultiModelManager(settings)

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)

class ModifyRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    current_code: str = Field(..., min_length=1)
    console_logs: str = ""
    prompt_history: List[str] = Field(default_factory=list, description="The history of prompts for context.")

class ExplainRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    current_code: str = Field(..., min_length=1)

if settings.static_dir.exists() and settings.static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    if settings.index_file.exists():
        return HTMLResponse(content=settings.index_file.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>AI Visualization Generator Backend</h1><p>Static frontend not found.</p>")

@app.get("/healthz", response_class=PlainTextResponse)
async def healthz():
    return PlainTextResponse("ok")

@app.post("/generate")
async def generate_visualization(req: GenerateRequest, request: Request):
    final_prompt = PROMPT_GENERATE.format(INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT_V2, user_prompt=req.prompt)
    return StreamingResponse(model_manager.generate_content_streaming(final_prompt, request), media_type="text/plain; charset=utf-8")

@app.post("/modify")
async def modify_visualization(req: ModifyRequest, request: Request):
    history_str = "\n".join(f"- {p}" for p in req.prompt_history) if req.prompt_history else "No history provided."
    final_prompt = PROMPT_MODIFY.format(
        user_prompt=req.prompt,
        current_code=req.current_code,
        console_logs=req.console_logs or "No console logs provided.",
        prompt_history=history_str,
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT_V2,
    )
    return StreamingResponse(model_manager.generate_content_streaming(final_prompt, request), media_type="text/plain; charset=utf-8")

# UPDATED: This endpoint now uses the new, more general prompt
@app.post("/explain")
async def explain_code(req: ExplainRequest, request: Request):
    final_prompt = PROMPT_FOLLOW_UP.format(
        user_question=req.question,
        code_to_explain=req.current_code
    )
    return StreamingResponse(
        model_manager.generate_content_streaming(final_prompt, request),
        media_type="text/plain; charset=utf-8"
    )