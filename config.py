"""
Configuration management for the AI Web Visualization Generator.

This module handles all application settings using Pydantic for validation
and type safety. Settings are loaded from environment variables and .env files.
"""

from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """
    Manages application settings using Pydantic for validation.
    
    All settings can be configured via environment variables or a .env file.
    Settings are validated at startup to ensure proper configuration.
    
    Attributes:
        primary_model_name: Name of the primary AI model (default: Gemini Flash)
        gemini_api_keys: Comma-separated list of Gemini API keys
        fallback_model_name: Name of the fallback AI model (default: Gemini Pro)
        requesty_api_key: API key for Requesty service (required)
        requesty_site_url: URL of the site using Requesty
        requesty_site_name: Name of the site for Requesty headers
        cors_allow_origins: Comma-separated list of allowed CORS origins
        static_dir: Directory containing static frontend files
    """
    
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore'
    )
    
    # AI Model Configuration
    primary_model_name: str = Field(
        default="gemini-1.5-flash-latest",
        alias="PRIMARY_AI_MODEL_NAME",
        description="Primary AI model to use for generation"
    )
    
    gemini_api_keys: str = Field(
        default="",
        alias="GEMINI_API_KEYS",
        description="Comma-separated list of Gemini API keys"
    )
    
    fallback_model_name: str = Field(
        default="gemini-1.5-pro-latest",
        alias="AI_MODEL_NAME",
        description="Fallback AI model name"
    )
    
    # Requesty Configuration
    requesty_api_key: str = Field(
        ...,
        alias="REQUESTY_API_KEY",
        description="API key for Requesty service (required)"
    )
    
    requesty_site_url: str = Field(
        default="",
        alias="REQUESTY_SITE_URL",
        description="Site URL for Requesty headers"
    )
    
    requesty_site_name: str = Field(
        default="AI Visualization Generator",
        alias="REQUESTY_SITE_NAME",
        description="Site name for Requesty headers"
    )
    
    # Server Configuration
    cors_allow_origins: str = Field(
        default="*",
        alias="CORS_ALLOW_ORIGINS",
        description="Comma-separated list of allowed CORS origins"
    )
    
    static_dir: Path = Field(
        default=Path("static"),
        alias="STATIC_DIR",
        description="Directory containing static frontend files"
    )
    
    @property
    def index_file(self) -> Path:
        """Path to the main index.html file."""
        return self.static_dir / "index.html"
    
    @property
    def gemini_api_keys_list(self) -> List[str]:
        """
        Parse comma-separated Gemini API keys into a list.
        
        Returns:
            List of API keys, empty list if none provided
        """
        if isinstance(self.gemini_api_keys, str):
            return [key.strip() for key in self.gemini_api_keys.split(',') if key.strip()]
        return []


def load_settings() -> AppSettings:
    """
    Load and validate application settings.
    
    Returns:
        AppSettings: Validated application settings
        
    Raises:
        RuntimeError: If configuration is invalid or missing required values
    """
    try:
        return AppSettings()
    except Exception as e:
        raise RuntimeError(
            f"FATAL: Configuration error. Is your .env file set up correctly? "
            f"Details: {e}"
        )