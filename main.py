"""
Main application entry point for the AI Web Visualization Generator.

This FastAPI application provides endpoints for generating, modifying, and
explaining HTML visualizations using AI models. It supports file uploads,
streaming responses, and automatic fallback between AI providers.
"""

import io
import zipfile
from typing import List

from fastapi import FastAPI, Request, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from config import load_settings
from file_processor import FileProcessor
from model_managers import MultiModelManager
from models import ExplainRequest
from prompts import (
    INSTRUCTIONS_FORMAT,
    PROMPT_GENERATE,
    PROMPT_MODIFY,
    PROMPT_FOLLOW_UP
)


# --- Application Setup ---

# Load configuration
settings = load_settings()

# Initialize FastAPI application
app = FastAPI(
    title="AI Web Visualization Generator",
    version="3.3.0",
    description="Generate and modify HTML visualizations using AI"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
model_manager = MultiModelManager(settings)
file_processor = FileProcessor()

# Mount static files if directory exists
if settings.static_dir.exists() and settings.static_dir.is_dir():
    app.mount(
        "/static",
        StaticFiles(directory=str(settings.static_dir)),
        name="static"
    )


# --- API Endpoints ---

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """
    Serve the main frontend page.
    
    Returns the index.html file if it exists, otherwise returns
    a basic HTML page indicating the static frontend is missing.
    """
    if settings.index_file.exists():
        return HTMLResponse(
            content=settings.index_file.read_text(encoding="utf-8")
        )
    
    return HTMLResponse(
        "<h1>AI Visualization Generator Backend</h1>"
        "<p>Static frontend not found.</p>"
    )


@app.get("/healthz", response_class=PlainTextResponse)
async def healthz():
    """
    Health check endpoint.
    
    Returns a simple "ok" response to indicate the service is running.
    Used by container orchestration systems and load balancers.
    """
    return PlainTextResponse("ok")


@app.post("/generate")
async def generate_visualization(
    request: Request,
    prompt: str = Form(..., description="User's request for visualization"),
    files: List[UploadFile] = File(
        default=[],
        description="Optional files to include as context"
    )
):
    """
    Generate a new HTML visualization from a user prompt.
    
    This endpoint processes the user's request and any uploaded files,
    then streams back an AI-generated HTML visualization.
    
    Args:
        request: FastAPI request object
        prompt: User's description of what to generate
        files: Optional files to use as context (images, data, etc.)
        
    Returns:
        StreamingResponse: AI-generated HTML code with metadata
    """
    # Process uploaded files into context
    file_context = await file_processor.process_uploaded_files(files)
    
    # Build the complete prompt
    final_prompt = PROMPT_GENERATE.format(
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT,
        user_prompt=prompt,
        file_context=file_context
    )
    
    # Stream the response
    return StreamingResponse(
        model_manager.generate_content_streaming(final_prompt, request),
        media_type="text/plain; charset=utf-8"
    )


@app.post("/modify")
async def modify_visualization(
    request: Request,
    prompt: str = Form(..., description="Modification request"),
    current_code: str = Form(..., description="Current HTML code"),
    console_logs: str = Form(default="", description="Browser console logs"),
    prompt_history: List[str] = Form(
        default=[],
        description="Previous prompts in conversation"
    ),
    files: List[UploadFile] = File(
        default=[],
        description="Optional new files to include"
    )
):
    """
    Modify an existing HTML visualization based on user feedback.
    
    This endpoint takes the current code and a modification request,
    along with conversation history and optional new files, then
    streams back an updated version.
    
    Args:
        request: FastAPI request object
        prompt: User's modification request
        current_code: The current HTML code to modify
        console_logs: Browser console logs for debugging context
        prompt_history: List of previous prompts in the conversation
        files: Optional new files to add to the project
        
    Returns:
        StreamingResponse: Modified HTML code with metadata
    """
    # Format conversation history
    history_str = (
        "\n".join(f"- {p}" for p in prompt_history)
        if prompt_history
        else "No history provided."
    )
    
    # Process uploaded files
    file_context = await file_processor.process_uploaded_files(files)
    
    # Build the complete prompt
    final_prompt = PROMPT_MODIFY.format(
        user_prompt=prompt,
        current_code=current_code,
        console_logs=console_logs or "No console logs provided.",
        prompt_history=history_str,
        file_context=file_context,
        INSTRUCTIONS_FORMAT=INSTRUCTIONS_FORMAT,
    )
    
    # Stream the response
    return StreamingResponse(
        model_manager.generate_content_streaming(final_prompt, request),
        media_type="text/plain; charset=utf-8"
    )


@app.post("/explain")
async def explain_code(req: ExplainRequest, request: Request):
    """
    Explain or answer questions about existing code.
    
    This endpoint allows users to ask questions about their visualization
    without modifying it. The AI provides explanations and guidance based
    on the current code.
    
    Args:
        req: Request containing the question and current code
        request: FastAPI request object
        
    Returns:
        StreamingResponse: AI explanation in Markdown format
    """
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
    html_content: str = Form(..., description="HTML code to package"),
    files: List[UploadFile] = File(
        default=[],
        description="Assets to include in the zip"
    )
):
    """
    Package HTML code and assets into a downloadable ZIP file.
    
    Creates a ZIP archive containing the HTML file as index.html and
    all uploaded assets in an 'assets' subdirectory, ready for deployment.
    
    Args:
        html_content: The complete HTML code
        files: Asset files to include (images, data files, etc.)
        
    Returns:
        StreamingResponse: ZIP file download
    """
    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Add HTML file
        zip_file.writestr("index.html", html_content)
        
        # Add asset files if provided
        if files:
            assets_dir_in_zip = "assets"
            for file in files:
                file_content = await file.read()
                zip_file.writestr(
                    f"{assets_dir_in_zip}/{file.filename}",
                    file_content
                )
    
    # Reset buffer position for reading
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=prompt-lab-project.zip"
        }
    )


# --- Application Entry Point ---

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )