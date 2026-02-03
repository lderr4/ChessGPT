from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import engine, Base
from .routers import auth, games, stats
from .logging_config import setup_logging
from .schema_migrations import ensure_lichess_columns

# Configure logging with datetime
setup_logging()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Chess Analytics API",
    description="API for chess game analytics and statistics",
    version="1.0.0"
)


@app.on_event("startup")
def run_startup_migrations() -> None:
    ensure_lichess_columns(engine)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(games.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Chess Analytics API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

