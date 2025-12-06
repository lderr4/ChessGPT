# Scaling Guide for Chess Analytics Platform 🚀

## Current Implementation Status

### ✅ What's Implemented (Basic Protection)

1. **Per-User Rate Limiting**
   - Only 1 batch analysis job per user at a time
   - Returns HTTP 429 if user tries to start multiple jobs

2. **Global Job Limiting**
   - Maximum 3 concurrent batch analysis jobs across all users
   - Returns HTTP 503 if server is at capacity

3. **User-Friendly Error Messages**
   - Clear feedback when rate limits are hit
   - Suggestions for what to do next

### Current Capacity Estimate

| Users | Status | Notes |
|-------|--------|-------|
| 1-5   | ✅ Good | Should work smoothly |
| 5-10  | ⚠️ Marginal | May experience delays |
| 10+   | ❌ Poor | Will hit rate limits frequently |

**Bottleneck**: Single FastAPI process + Stockfish CPU usage

---

## Architecture Evolution

### Phase 1: Current (MVP) 👶
```
User Request → FastAPI → BackgroundTasks → Stockfish
                ↓
            PostgreSQL
```

**Pros**: Simple, easy to understand
**Cons**: No true job queue, limited scalability
**Good for**: 1-10 users, personal/small team use

---

### Phase 2: Celery Workers (Recommended for Production) 🏭

```
User Request → FastAPI → Celery → Redis Queue
                                      ↓
                                   Workers (3-5)
                                      ↓
                                   Stockfish
                                      ↓
                                  PostgreSQL
```

**Pros**: 
- True job queue with Redis
- Horizontal scaling (add more workers)
- Better resource management
- Priority queues
- Job retry logic

**Cons**: 
- More complex setup
- Additional infrastructure

**Good for**: 10-1000 users, production use

#### Implementation Steps:

**1. Install Celery**
```bash
# backend/requirements.txt
celery==5.3.4
redis==5.0.1
```

**2. Create Celery App**
```python
# backend/app/celery_app.py
from celery import Celery
from .config import settings

celery_app = Celery(
    "chess_analytics",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL.replace("/0", "/1")
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    worker_prefetch_multiplier=1,  # One task at a time per worker
)

@celery_app.task(bind=True, name="analyze_game")
def analyze_game_task(self, game_id: int):
    """Celery task to analyze a single game"""
    from .services.analysis_service import AnalysisService
    from .database import SessionLocal
    from .models import Game, Move
    from datetime import datetime
    
    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game or game.is_analyzed:
            return
        
        # Update task state
        self.update_state(state='PROGRESS', meta={'game_id': game_id})
        
        # Analyze
        analysis_service = AnalysisService()
        import asyncio
        result = asyncio.run(analysis_service.analyze_game(game.pgn, game.user_color))
        
        if "error" not in result:
            stats = result.get("stats", {})
            game.is_analyzed = True
            game.num_moves = stats.get("num_moves", 0)
            game.average_centipawn_loss = stats.get("average_centipawn_loss")
            game.accuracy = stats.get("accuracy")
            game.num_blunders = stats.get("num_blunders", 0)
            game.num_mistakes = stats.get("num_mistakes", 0)
            game.num_inaccuracies = stats.get("num_inaccuracies", 0)
            game.analyzed_at = datetime.utcnow()
            
            for move_data in result.get("moves", []):
                move = Move(game_id=game_id, **move_data)
                db.add(move)
            
            db.commit()
        
        return {"game_id": game_id, "status": "completed"}
        
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="batch_analyze")
def batch_analyze_task(self, user_id: int, job_id: int):
    """Celery task to batch analyze games"""
    from .database import SessionLocal
    from .models import Game, AnalysisJob
    from datetime import datetime
    
    db = SessionLocal()
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    
    try:
        job.status = "processing"
        job.started_at = datetime.utcnow()
        db.commit()
        
        games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.is_analyzed == False
        ).all()
        
        job.total_games = len(games)
        db.commit()
        
        # Dispatch individual game analysis tasks
        for i, game in enumerate(games):
            analyze_game_task.delay(game.id)
            
            job.analyzed_games = i + 1
            job.progress = int(((i + 1) / len(games)) * 100)
            db.commit()
            
            # Update main task progress
            self.update_state(
                state='PROGRESS',
                meta={
                    'current': i + 1,
                    'total': len(games),
                    'percent': job.progress
                }
            )
        
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        db.commit()
        
        return {"job_id": job_id, "analyzed": len(games)}
        
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        raise
    finally:
        db.close()
```

**3. Update docker-compose.yml**
```yaml
  celery_worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: chess_analytics_celery_worker
    command: celery -A app.celery_app worker --loglevel=info --concurrency=2
    environment:
      DATABASE_URL: postgresql://chess_user:chess_password@postgres:5432/chess_analytics
      REDIS_URL: redis://redis:6379/0
      STOCKFISH_PATH: /usr/games/stockfish
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 3  # Scale to 3 workers
    volumes:
      - ./backend:/app

  celery_beat:  # Optional: for scheduled tasks
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: chess_analytics_celery_beat
    command: celery -A app.celery_app beat --loglevel=info
    environment:
      DATABASE_URL: postgresql://chess_user:chess_password@postgres:5432/chess_analytics
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    volumes:
      - ./backend:/app

  flower:  # Optional: Celery monitoring dashboard
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: chess_analytics_flower
    command: celery -A app.celery_app flower --port=5555
    ports:
      - "5555:5555"
    environment:
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - redis
```

**4. Update API Endpoints**
```python
# backend/app/routers/games.py
from app.celery_app import batch_analyze_task

@router.post("/analyze/all", status_code=202)
async def analyze_all_games(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ... validation ...
    
    # Create job
    analysis_job = AnalysisJob(...)
    db.add(analysis_job)
    db.commit()
    db.refresh(analysis_job)
    
    # Dispatch to Celery instead of BackgroundTasks
    task = batch_analyze_task.delay(current_user.id, analysis_job.id)
    
    return {
        "job_id": analysis_job.id,
        "celery_task_id": task.id,
        "message": "Batch analysis started"
    }
```

---

### Phase 3: Kubernetes + Cloud (Enterprise) ☁️

```
                    Load Balancer
                         ↓
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
    FastAPI Pod 1    FastAPI Pod 2    FastAPI Pod 3
        ↓                ↓                ↓
            Celery Workers (Auto-scaling)
                    ↓
                Redis Queue
                    ↓
            PostgreSQL (Managed)
```

**Features**:
- Horizontal auto-scaling
- High availability
- Load balancing
- Monitoring & alerting
- Cost optimization

**Good for**: 1000+ users, enterprise

---

## Performance Optimizations

### 1. **Parallel Game Analysis**

Analyze multiple games simultaneously per worker:

```python
from concurrent.futures import ProcessPoolExecutor

def analyze_games_parallel(games, max_workers=4):
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(analyze_single_game, games))
    return results
```

### 2. **Stockfish Pool**

Reuse Stockfish instances:

```python
class StockfishPool:
    def __init__(self, size=4):
        self.engines = Queue(maxsize=size)
        for _ in range(size):
            engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
            self.engines.put(engine)
    
    def get_engine(self):
        return self.engines.get()
    
    def return_engine(self, engine):
        self.engines.put(engine)
```

### 3. **Caching**

Cache analysis results for duplicate positions:

```python
from functools import lru_cache

@lru_cache(maxsize=10000)
def get_position_evaluation(fen: str):
    # Cache evaluations by FEN
    pass
```

### 4. **Database Optimization**

Batch insert moves:

```python
# Instead of:
for move_data in moves:
    move = Move(**move_data)
    db.add(move)
    db.commit()  # ❌ Slow: N commits

# Do this:
moves_list = [Move(**move_data) for move_data in moves]
db.bulk_save_objects(moves_list)
db.commit()  # ✅ Fast: 1 commit
```

---

## Monitoring & Observability

### Key Metrics to Track:

1. **Job Queue Length**
   - Alert if > 100 pending jobs

2. **Average Analysis Time**
   - Track per game: should be 30-60s
   - Alert if > 120s

3. **Error Rate**
   - Track failed analyses
   - Alert if > 5%

4. **Resource Usage**
   - CPU: Stockfish is CPU-heavy
   - Memory: PGN parsing uses memory
   - Disk I/O: Database writes

5. **User Wait Time**
   - Time from job creation to completion
   - Target: < 1 hour for 100 games

### Tools:

- **Flower**: Celery monitoring UI (`localhost:5555`)
- **Prometheus**: Metrics collection
- **Grafana**: Dashboards
- **Sentry**: Error tracking

---

## Cost Considerations

### Current Setup (Single Server):
- **AWS EC2 t3.large** (2 vCPU, 8GB RAM): ~$60/month
- **RDS PostgreSQL** (db.t3.small): ~$30/month
- **Total**: ~$90/month
- **Capacity**: 5-10 active users

### With Celery Workers:
- **EC2 t3.large** × 1 (API): ~$60/month
- **EC2 c5.xlarge** × 3 (Workers): ~$360/month
- **RDS PostgreSQL** (db.t3.medium): ~$60/month
- **ElastiCache Redis**: ~$15/month
- **Total**: ~$495/month
- **Capacity**: 50-100 active users

### Kubernetes (Auto-scaling):
- **EKS Cluster**: ~$75/month
- **EC2 instances** (auto-scale 2-10): ~$150-750/month
- **RDS, Redis, etc.**: ~$100/month
- **Total**: ~$325-925/month (varies with load)
- **Capacity**: 100-1000+ users

---

## Quick Reference: When to Upgrade

| Scenario | Current | With Celery | With K8s |
|----------|---------|-------------|----------|
| Personal project | ✅ | ❌ | ❌ |
| Small team (5-10) | ✅ | ⚠️ | ❌ |
| Startup (10-50) | ❌ | ✅ | ⚠️ |
| Production (50-500) | ❌ | ✅ | ✅ |
| Enterprise (500+) | ❌ | ⚠️ | ✅ |

---

## Summary

**Current Implementation**: Good for MVP and small-scale use
- ✅ Simple to understand
- ✅ Easy to deploy
- ✅ No additional infrastructure
- ❌ Limited to ~5-10 concurrent users
- ❌ No true job queue

**Next Steps**:
1. **Short term**: Keep current setup, monitor usage
2. **Medium term**: Add Celery when you hit ~10 active users
3. **Long term**: Move to Kubernetes when you need 100+ users

**You're covered for now!** The rate limiting I just added will prevent overload. Monitor your usage and upgrade when needed. 🎉

