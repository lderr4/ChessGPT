from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Chess.com API
    CHESS_COM_USER_AGENT: str
    
    # Stockfish
    STOCKFISH_PATH: str = "/usr/games/stockfish"
    STOCKFISH_DEPTH: int = 18
    STOCKFISH_TIME_LIMIT: float = 0.8
    
    # AI Chess Coach
    ENABLE_COACH: bool = False
    COACH_PROVIDER: str = "ollama"  # Options: "openai", "ollama"
    
    # OpenAI Settings (paid)
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4"
    
    # Ollama Settings (free, local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1"  # or "mistral", "phi3", etc.
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    # Environment
    ENVIRONMENT: str = "development"
    
    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:5173"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

