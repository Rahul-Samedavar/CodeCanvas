"""
AI model management for the AI Web Visualization Generator.

This module handles interactions with multiple AI providers (Gemini and Requesty),
including API key rotation, fallback mechanisms, and streaming response generation.
"""

import itertools
from typing import AsyncGenerator, List, Optional

import openai
import google.generativeai as genai
from fastapi import Request

from config import AppSettings


class GeminiModelManager:
    """
    Manages Gemini API interactions with support for multiple API keys.
    
    This class handles API key rotation and provides streaming content generation
    using Google's Generative AI models. If one API key fails, it automatically
    tries the next available key.
    
    Attributes:
        model_name: Name of the Gemini model to use
        keys: List of Gemini API keys for rotation
        generation_config: Configuration for text generation
    """
    
    def __init__(self, config: AppSettings):
        """
        Initialize the Gemini model manager.
        
        Args:
            config: Application settings containing API keys and model name
            
        Raises:
            ValueError: If no Gemini API keys are provided
        """
        self.model_name = config.primary_model_name
        self.keys = config.gemini_api_keys_list
        
        if not self.keys:
            raise ValueError(
                "GeminiModelManager initialized but no GEMINI_API_KEYS were provided."
            )
        
        self.key_cycler = itertools.cycle(self.keys)
        self.generation_config = genai.GenerationConfig(
            temperature=0.7,
            top_p=1,
            top_k=1
        )
        
        print(
            f"Gemini Manager initialized for model: {self.model_name} "
            f"with {len(self.keys)} API key(s)."
        )
    
    async def generate_content_streaming_with_key(
        self, 
        prompt: str, 
        api_key: str
    ) -> AsyncGenerator[str, None]:
        """
        Generate streaming content using a specific API key.
        
        Args:
            prompt: The prompt to send to the model
            api_key: The Gemini API key to use
            
        Yields:
            str: Chunks of generated text
            
        Raises:
            Exception: If the API call fails
        """
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(self.model_name)
        
        print(
            f"[Gemini] Attempting generation with model {self.model_name} "
            f"using key ending in ...{api_key[-4:]}"
        )
        
        stream = await model.generate_content_async(
            prompt,
            stream=True,
            generation_config=self.generation_config
        )
        
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
        
        print(
            f"[Gemini] Successfully generated response "
            f"with key ending in ...{api_key[-4:]}"
        )
    
    async def try_all_keys_streaming(
        self, 
        prompt: str
    ) -> AsyncGenerator[str, None]:
        """
        Attempt to generate content using all available API keys.
        
        Tries each API key in sequence until one succeeds. If all keys fail,
        raises the last exception encountered.
        
        Args:
            prompt: The prompt to send to the model
            
        Yields:
            str: Chunks of generated text
            
        Raises:
            Exception: If all API keys fail
        """
        last_exception = None
        
        for i, api_key in enumerate(self.keys):
            try:
                print(
                    f"[Gemini] Trying key {i+1}/{len(self.keys)} "
                    f"(ending in ...{api_key[-4:]})"
                )
                
                async for chunk in self.generate_content_streaming_with_key(
                    prompt, 
                    api_key
                ):
                    yield chunk
                
                # If we got here, generation succeeded
                return
                
            except Exception as e:
                last_exception = e
                print(f"[Gemini] Key {i+1}/{len(self.keys)} failed: {str(e)}")
                continue
        
        # All keys failed
        print(
            f"[Gemini] All {len(self.keys)} API keys failed. "
            f"Last error: {last_exception}"
        )
        raise last_exception or Exception("All Gemini API keys failed")


class RequestyModelManager:
    """
    Manages Requesty API interactions as a fallback provider.
    
    This class provides a fallback mechanism when Gemini API is unavailable
    or all API keys have been exhausted. It uses the Requesty router service
    with OpenAI-compatible API.
    
    Attributes:
        model_name: Name of the model to use via Requesty
        client: Async OpenAI client configured for Requesty
    """
    
    def __init__(self, config: AppSettings):
        """
        Initialize the Requesty model manager.
        
        Args:
            config: Application settings containing API key and site info
        """
        self.model_name = config.fallback_model_name
        
        # Build headers for Requesty service
        headers = {
            "HTTP-Referer": config.requesty_site_url,
            "X-Title": config.requesty_site_name
        }
        
        # Filter out empty header values
        headers = {k: v for k, v in headers.items() if v}
        
        self.client = openai.AsyncOpenAI(
            api_key=config.requesty_api_key,
            base_url="https://router.requesty.ai/v1",
            default_headers=headers
        )
        
        print(f"Requesty Fallback Manager initialized for model: {self.model_name}")
    
    async def generate_content_streaming(
        self, 
        prompt: str, 
        request: Request
    ) -> AsyncGenerator[str, None]:
        """
        Generate streaming content using Requesty API.
        
        Args:
            prompt: The prompt to send to the model
            request: FastAPI request object (for disconnect detection)
            
        Yields:
            str: Chunks of generated text
        """
        print(f"[Requesty] Attempting generation with model {self.model_name}")
        
        stream = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}],
            stream=True
        )
        
        async for chunk in stream:
            # Check if client disconnected
            if await request.is_disconnected():
                print("[Requesty] Client disconnected. Cancelling stream.")
                break
            
            content = chunk.choices[0].delta.content
            if content:
                yield content
        
        print("[Requesty] Successfully generated response.")


class MultiModelManager:
    """
    Orchestrates multiple AI model providers with fallback logic.
    
    This class manages the coordination between primary (Gemini) and fallback
    (Requesty) AI providers. It attempts to use Gemini first with all available
    API keys, then falls back to Requesty if all Gemini attempts fail.
    
    Attributes:
        gemini_manager: Optional Gemini model manager
        requesty_manager: Requesty model manager (always available)
    """
    
    def __init__(self, config: AppSettings):
        """
        Initialize the multi-model manager.
        
        Args:
            config: Application settings for all providers
        """
        self.gemini_manager: Optional[GeminiModelManager] = None
        
        # Try to initialize Gemini manager if API keys are available
        if config.gemini_api_keys_list:
            try:
                self.gemini_manager = GeminiModelManager(config)
            except ValueError as e:
                print(f"Warning: Could not initialize Gemini Manager. {e}")
        
        # Always initialize Requesty as fallback
        self.requesty_manager = RequestyModelManager(config)
    
    async def generate_content_streaming(
        self, 
        prompt: str, 
        request: Request
    ) -> AsyncGenerator[str, None]:
        """
        Generate content with automatic fallback between providers.
        
        First attempts to use Gemini with all available API keys. If all fail
        or Gemini is not available, falls back to Requesty. Sends a special
        [STREAM_RESTART] marker when switching providers.
        
        Args:
            prompt: The prompt to send to the model
            request: FastAPI request object
            
        Yields:
            str: Chunks of generated text
        """
        # Try Gemini first if available
        if self.gemini_manager:
            try:
                print(
                    "[Orchestrator] Attempting generation with all "
                    "available Gemini keys..."
                )
                
                async for chunk in self.gemini_manager.try_all_keys_streaming(prompt):
                    yield chunk
                
                # If we got here, generation succeeded
                return
                
            except Exception as e:
                print(
                    f"[Orchestrator] All Gemini keys failed with final error: {e}. "
                    f"Falling back to Requesty."
                )
                # Send restart marker to indicate provider switch
                yield "[STREAM_RESTART]\n"
        
        # Use Requesty fallback
        print("[Orchestrator] Using fallback: Requesty.")
        async for chunk in self.requesty_manager.generate_content_streaming(
            prompt, 
            request
        ):
            yield chunk