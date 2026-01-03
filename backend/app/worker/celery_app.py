# app/worker/celery_app.py
from celery import Celery
from app.config import settings
from app.logging_config import setup_logging

# Set up logging with datetime before initializing Celery
setup_logging()

celery_app = Celery(
    "chess_analytics",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

# Tell Celery to find tasks in the new directory
celery_app.autodiscover_tasks(['app.worker'])

# Optional: Celery configurations
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    # Task routing: send import tasks to imports queue, analysis tasks to celery (default) queue
    task_routes={
        'import_games_task': {'queue': 'imports'},
        'analyze_game_task': {'queue': 'celery'},
        'batch_analyze_games_task': {'queue': 'celery'},
    },
)

# Tell Celery to look for tasks in app/tasks.py
celery_app.autodiscover_tasks(['app'])