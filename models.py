"""
Pydantic models for API request/response validation.

This module defines the data models used for API endpoints, ensuring
proper validation and documentation of request/response formats.
"""

from pydantic import BaseModel, Field


class ExplainRequest(BaseModel):
    """
    Request model for the /explain endpoint.
    
    Used when users ask questions about existing code.
    
    Attributes:
        question: The user's question about the code
        current_code: The HTML code to explain or discuss
    """
    
    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="User's question about the code",
        examples=["How does the animation work?"]
    )
    
    current_code: str = Field(
        ...,
        min_length=1,
        description="The current HTML code for context",
        examples=["<!DOCTYPE html><html>...</html>"]
    )