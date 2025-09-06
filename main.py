import os
import asyncio
import itertools
import io
import uuid
import zipfile
from pathlib import Path
from typing import AsyncGenerator, List, Optional

import openai
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
import pandas as pd
from pypdf import PdfReader

# NOTE: To support text extraction from various file types, additional libraries are required.
# Please ensure you have `pandas`, `openpyxl`, and `pypdf` installed (`pip install pandas openpyxl pypdf`).

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
        # Note: For a true multimodal experience, you'd pass the image data here.
        # For now, we're relying on the text description of the file.
        stream = await model.generate_content_async(prompt, stream=True, generation_config=self.generation_config)
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
        print(f"[Gemini] Successfully generated response with key ending in ...{api_key[-4:]}")
    
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


INSTRUCTIONS_FORMAT = (
    """
**YOU ARE A CODE GENERATOR. YOUR SOLE TASK IS TO GENERATE A COMPLETE HTML FILE IN THE FORMAT SPECIFIED BELOW. DO NOT DEVIATE.**

**CRITICAL: Response Format**
Your entire response MUST strictly follow this structure. Do not add any extra text or explanations outside of these sections.

1.  **[ANALYSIS]...[END_ANALYSIS]**: Explain your plan to generate the code.
2.  **[CHANGES]...[END_CHANGES]**: List changes made. For the first generation, write "Initial generation."
3.  **[INSTRUCTIONS]...[END_INSTRUCTIONS]**: Write user-facing notes about how to *interact with the final webpage*.
4.  **HTML Code**: Immediately after `[END_INSTRUCTIONS]`, the complete HTML code MUST begin, starting with `<!DOCTYPE html>`.

**CRITICAL: Asset Handling**
- If the user provides assets (e.g., `heart.png`), you MUST reference them in your HTML using a relative path like `assets/heart.png`.
- **DO NOT** write instructions on how to save the file or create folders. The user's environment handles this automatically. Assume the `assets` folder exists.

**Here is a short example of a perfect response:**

  

[ANALYSIS]
The user wants a simple red square. I will create a div and style it with CSS inside the HTML file.
[END_ANALYSIS]
[CHANGES]
Initial generation.
[END_CHANGES]
[INSTRUCTIONS]
This is a simple red square. There is no interaction.
[END_INSTRUCTIONS]
<!DOCTYPE html>
<html>
<head><title>Red Square</title><style>div{width:100px;height:100px;background:red;}</style></head>
<body><div></div></body>
</html>
```
"""
).strip()

PROMPT_GENERATE = (
"""
You are an expert web developer tasked with generating a complete, single-file HTML web page.
You must adhere to the formatting rules and instructions provided below.

User's Request: "{user_prompt}"

File Context (assets provided by the user):
{file_context}
{INSTRUCTIONS_FORMAT}

Generate the complete response now.
"""
).strip()

PROMPT_MODIFY = (
"""
You are an expert web developer tasked with modifying an existing HTML file based on the user's new request.
You must adhere to the formatting rules and instructions provided below.

Conversation History:
{prompt_history}

Current Project Code:
code Html
IGNORE_WHEN_COPYING_START
IGNORE_WHEN_COPYING_END

    
{current_code}

  

User's New Request:
"{user_prompt}"

File Context (new or existing assets provided by the user):
{file_context}
{INSTRUCTIONS_FORMAT}

Generate the complete and updated response now.
"""
).strip()

PROMPT_FOLLOW_UP = (
"""
You are a versatile AI assistant and expert web developer. The user has an existing web application/visualization and is asking a follow-up question about it.
User's Question: "{user_question}"
The Current Code for Context:
code Html
IGNORE_WHEN_COPYING_START
IGNORE_WHEN_COPYING_END

    
{code_to_explain}

  

Your Task:

    Analyze the user's question.

    Provide a comprehensive answer, using Markdown for clarity.

    Refer to specific parts of the code to make your answer concrete and helpful.

    Maintain a helpful, collaborative tone.
    Generate your helpful response now.
    """
    ).strip()



async def process_uploaded_files_for_prompt(files: List[UploadFile]) -> str:
    """
    Reads content from uploaded files (txt, pdf, csv, xlsx) and creates a comprehensive
    text description for the LLM prompt.
    """
    if not files:
        return "No files were provided."

    file_contexts = []
    MAX_CONTENT_LENGTH = 4000  # Truncate content to avoid huge prompts

    for file in files:
        file_description = f"--- START OF FILE: {file.filename} ---"
        content_summary = "Content: This is a binary file (e.g., image, audio). It cannot be displayed as text but should be referenced in the code by its filename."
        
        file_extension = Path(file.filename).suffix.lower()
        
        try:
            content_bytes = await file.read()
            
            # Text-based files
            if file_extension in ['.txt', '.md', '.py', '.js', '.html', '.css', '.json']:
                content_summary = content_bytes.decode('utf-8', errors='replace')
            
            # CSV
            elif file_extension == '.csv':
                df = pd.read_csv(io.BytesIO(content_bytes))
                content_summary = "File content represented as CSV:\n" + df.to_csv(index=False)

            # PDF
            elif file_extension == '.pdf':
                reader = PdfReader(io.BytesIO(content_bytes))
                text_parts = [page.extract_text() for page in reader.pages if page.extract_text()]
                content_summary = "Extracted text from PDF:\n" + "\n".join(text_parts)

            # Excel
            elif file_extension in ['.xlsx', '.xls']:
                xls = pd.ExcelFile(io.BytesIO(content_bytes))
                text_parts = []
                for sheet_name in xls.sheet_names:
                    df = pd.read_excel(xls, sheet_name=sheet_name)
                    text_parts.append(f"Sheet: '{sheet_name}'\n{df.to_csv(index=False)}")
                content_summary = "File content represented as CSV for each sheet:\n" + "\n\n".join(text_parts)

            # Truncate if necessary
            if len(content_summary) > MAX_CONTENT_LENGTH:
                content_summary = content_summary[:MAX_CONTENT_LENGTH] + "\n... (content truncated)"

        except Exception as e:
            print(f"Could not process file {file.filename}: {e}")
            pass  # Keep the default binary file message
        
        finally:
            await file.seek(0)
        
        file_contexts.append(f"{file_description}\n{content_summary}\n--- END OF FILE: {file.filename} ---")
    
    return "The user has provided the following files. Use their content as context for your response:\n\n" + "\n\n".join(file_contexts)


# --- FastAPI Application ---
app = FastAPI(title="AI Web Visualization Generator", version="3.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins.split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

model_manager = MultiModelManager(settings)

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
async def generate_visualization(
    request: Request,
    prompt: str = Form(...),
    files: List[UploadFile] = File([])
):
    file_context = await process_uploaded_files_for_prompt(files)
    final_prompt = PROMPT_GENERATE.format(
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT, 
        user_prompt=prompt,
        file_context=file_context
    )
    return StreamingResponse(model_manager.generate_content_streaming(final_prompt, request), media_type="text/plain; charset=utf-8")

@app.post("/modify")
async def modify_visualization(
    request: Request,
    prompt: str = Form(...),
    current_code: str = Form(...),
    console_logs: str = Form(""),
    prompt_history: List[str] = Form([]),
    files: List[UploadFile] = File([])
):
    history_str = "\n".join(f"- {p}" for p in prompt_history) if prompt_history else "No history provided."
    file_context = await process_uploaded_files_for_prompt(files)
    final_prompt = PROMPT_MODIFY.format(
        user_prompt=prompt,
        current_code=current_code,
        console_logs=console_logs or "No console logs provided.",
        prompt_history=history_str,
        file_context=file_context,
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT,
    )
    return StreamingResponse(model_manager.generate_content_streaming(final_prompt, request), media_type="text/plain; charset=utf-8")

@app.post("/explain")
# ... (Unchanged)
async def explain_code(req: ExplainRequest, request: Request):
    final_prompt = PROMPT_FOLLOW_UP.format(
        user_question=req.question,
        code_to_explain=req.current_code
    )
    return StreamingResponse(
        model_manager.generate_content_streaming(final_prompt, request),
        media_type="text/plain; charset=utf-8"
    )

@app.post("/download_zip")
async def download_zip(
    html_content: str = Form(...),
    files: List[UploadFile] = File([])
):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Add HTML file, ensuring it uses relative paths
        zip_file.writestr("index.html", html_content)

        # Add assets to an 'assets' folder within the zip
        if files:
            assets_dir_in_zip = "assets"
            for file in files:
                file_content = await file.read()
                # Use the original filename provided by the client
                zip_file.writestr(f"{assets_dir_in_zip}/{file.filename}", file_content)
    
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=codecanvas-project.zip"}
    )