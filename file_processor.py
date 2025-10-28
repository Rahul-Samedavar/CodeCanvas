"""
File processing utilities for the AI Web Visualization Generator.

This module handles the processing of various file types (text, PDF, CSV, Excel)
uploaded by users and converts them into text descriptions suitable for LLM prompts.
"""

import io
from pathlib import Path
from typing import List

import pandas as pd
from fastapi import UploadFile
from pypdf import PdfReader


class FileProcessor:
    """
    Processes uploaded files and extracts their content for LLM prompts.
    
    Supports multiple file formats including text files, PDFs, CSVs, and Excel files.
    Binary files (images, audio, etc.) are identified but not processed.
    """
    
    # Maximum content length to include in prompt (to avoid huge prompts)
    MAX_CONTENT_LENGTH = 4000
    
    # Supported text-based file extensions
    TEXT_EXTENSIONS = {'.txt', '.md', '.py', '.js', '.html', '.css', '.json'}
    
    # Supported spreadsheet extensions
    EXCEL_EXTENSIONS = {'.xlsx', '.xls'}
    
    async def process_uploaded_files(self, files: List[UploadFile]) -> str:
        """
        Process multiple uploaded files and create a comprehensive text description.
        
        Args:
            files: List of uploaded files to process
            
        Returns:
            str: Formatted text description of all file contents
        """
        if not files:
            return "No files were provided."
        
        file_contexts = []
        
        for file in files:
            context = await self._process_single_file(file)
            file_contexts.append(context)
        
        return (
            "The user has provided the following files. "
            "Use their content as context for your response:\n\n"
            + "\n\n".join(file_contexts)
        )
    
    async def _process_single_file(self, file: UploadFile) -> str:
        """
        Process a single uploaded file.
        
        Args:
            file: The file to process
            
        Returns:
            str: Formatted description of the file content
        """
        file_description = f"--- START OF FILE: {file.filename} ---"
        content_summary = (
            "Content: This is a binary file (e.g., image, audio). "
            "It cannot be displayed as text but should be referenced in the "
            "code by its filename."
        )
        
        file_extension = Path(file.filename).suffix.lower()
        
        try:
            content_bytes = await file.read()
            content_summary = await self._extract_content(
                content_bytes, 
                file_extension,
                file.filename
            )
        except Exception as e:
            print(f"Could not process file {file.filename}: {e}")
            # Keep the default binary file message
        finally:
            await file.seek(0)  # Reset file pointer for potential reuse
        
        return (
            f"{file_description}\n"
            f"{content_summary}\n"
            f"--- END OF FILE: {file.filename} ---"
        )
    
    async def _extract_content(
        self, 
        content_bytes: bytes, 
        file_extension: str,
        filename: str
    ) -> str:
        """
        Extract text content from file bytes based on file type.
        
        Args:
            content_bytes: Raw file content
            file_extension: File extension (e.g., '.pdf', '.csv')
            filename: Original filename
            
        Returns:
            str: Extracted and possibly truncated content
        """
        content = None
        
        # Text-based files
        if file_extension in self.TEXT_EXTENSIONS:
            content = content_bytes.decode('utf-8', errors='replace')
        
        # CSV files
        elif file_extension == '.csv':
            content = self._process_csv(content_bytes)
        
        # PDF files
        elif file_extension == '.pdf':
            content = self._process_pdf(content_bytes)
        
        # Excel files
        elif file_extension in self.EXCEL_EXTENSIONS:
            content = self._process_excel(content_bytes)
        
        # If no specific handler, return default message
        if content is None:
            return (
                "Content: This is a binary file (e.g., image, audio). "
                "It cannot be displayed as text but should be referenced in the "
                "code by its filename."
            )
        
        # Truncate if necessary
        if len(content) > self.MAX_CONTENT_LENGTH:
            content = content[:self.MAX_CONTENT_LENGTH] + "\n... (content truncated)"
        
        return content
    
    def _process_csv(self, content_bytes: bytes) -> str:
        """
        Process CSV file content.
        
        Args:
            content_bytes: Raw CSV file bytes
            
        Returns:
            str: CSV content as text
        """
        df = pd.read_csv(io.BytesIO(content_bytes))
        return "File content represented as CSV:\n" + df.to_csv(index=False)
    
    def _process_pdf(self, content_bytes: bytes) -> str:
        """
        Process PDF file content and extract text.
        
        Args:
            content_bytes: Raw PDF file bytes
            
        Returns:
            str: Extracted text from all PDF pages
        """
        reader = PdfReader(io.BytesIO(content_bytes))
        text_parts = [
            page.extract_text() 
            for page in reader.pages 
            if page.extract_text()
        ]
        return "Extracted text from PDF:\n" + "\n".join(text_parts)
    
    def _process_excel(self, content_bytes: bytes) -> str:
        """
        Process Excel file content.
        
        Args:
            content_bytes: Raw Excel file bytes
            
        Returns:
            str: Content from all sheets as CSV format
        """
        xls = pd.ExcelFile(io.BytesIO(content_bytes))
        text_parts = []
        
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            text_parts.append(
                f"Sheet: '{sheet_name}'\n{df.to_csv(index=False)}"
            )
        
        return (
            "File content represented as CSV for each sheet:\n"
            + "\n\n".join(text_parts)
        )