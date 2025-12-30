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

4. **Analysis State Tracking**
   - Database-backed `analysis_state` field: `unanalyzed`, `in_progress`, `analyzed`
   - Persists across page refreshes
   - Frontend automatically detects and polls in-progress games

### Current Capacity Estimate

| Users | Status      | Notes                           |
| ----- | ----------- | ------------------------------- |
| 1-5   | ✅ Good     | Should work smoothly            |
| 5-10  | ⚠️ Marginal | May experience delays           |
| 10+   | ❌ Poor     | Will hit rate limits frequently |

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
- Proven, battle-tested solution

**Cons**:

- More complex setup
- Additional infrastructure (Redis)
- Need to manage worker processes

**Good for**: 10-1000 users, production use

**Cost**: ~$495/month (3 workers + Redis)

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
        if not game or game.analysis_state == "analyzed":
            return

        # Set state to in_progress
        game.analysis_state = "in_progress"
        db.commit()

        # Update task state
        self.update_state(state='PROGRESS', meta={'game_id': game_id})

        # Analyze
        analysis_service = AnalysisService()
        import asyncio
        result = asyncio.run(analysis_service.analyze_game(game.pgn, game.user_color))

        if "error" not in result:
            stats = result.get("stats", {})
            game.is_analyzed = True
            game.analysis_state = "analyzed"
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
            Game.analysis_state != "analyzed"
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
    replicas: 3 # Scale to 3 workers
  volumes:
    - ./backend:/app

celery_beat: # Optional: for scheduled tasks
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

flower: # Optional: Celery monitoring dashboard
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
from app.celery_app import analyze_game_task, batch_analyze_task

@router.post("/{game_id}/analyze", status_code=202)
async def analyze_game(
    game_id: int,
    force: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    game = db.query(Game).filter(
        Game.id == game_id,
        Game.user_id == current_user.id
    ).first()

    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if game.analysis_state == "analyzed" and not force:
        return {"message": "Game already analyzed", "status": "completed"}

    # Set state to in_progress
    game.analysis_state = "in_progress"
    db.commit()

    # Dispatch to Celery instead of BackgroundTasks
    task = analyze_game_task.delay(game_id)

    return {
        "message": "Game analysis started",
        "status": "processing",
        "task_id": task.id
    }

@router.post("/analyze/all", status_code=202)
async def analyze_all_games(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ... validation ...

    # Create job
    analysis_job = AnalysisJob(user_id=current_user.id, ...)
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

### Phase 2.5: AWS Lambda (Alternative Serverless Approach) ☁️

```
User Request → FastAPI → SQS Queue → Lambda Functions
                                      ↓
                                   Stockfish (in Lambda)
                                      ↓
                                  RDS PostgreSQL
```

**Pros**:

- ✅ True serverless - no servers to manage
- ✅ Auto-scaling to thousands of concurrent executions
- ✅ Pay only for actual analysis time
- ✅ No cold start issues with provisioned concurrency
- ✅ Good for bursty workloads

**Cons**:

- ❌ **15-minute timeout limit** (single games OK, batch jobs need splitting)
- ❌ Cold start latency (1-5 seconds) without provisioned concurrency
- ❌ Need to package Stockfish binary (~40-75MB) - may need container images
- ❌ VPC configuration required for RDS access (adds latency)
- ❌ More complex setup than Celery
- ❌ Cost can add up with high volume: ~$0.20 per 1M requests + compute time
- ❌ Debugging is harder (CloudWatch logs)
- ❌ State management more complex

**When to Use Lambda**:

- ✅ Bursty, unpredictable workloads
- ✅ Need to scale from 0 to 1000s instantly
- ✅ Want to avoid managing servers entirely
- ✅ Single game analysis (fits in 15-min timeout)
- ✅ Willing to pay premium for serverless convenience

**When NOT to Use Lambda**:

- ❌ Batch analysis jobs (need to split into chunks)
- ❌ Predictable, steady workloads (Celery is cheaper)
- ❌ Need sub-second latency (cold starts)
- ❌ Tight budget (Celery on EC2 is more cost-effective)

**Cost Comparison** (1000 games/month):

- **Celery on EC2**: ~$495/month (fixed cost)
- **Lambda**: ~$50-150/month (varies with usage)
  - 1000 invocations × $0.20/1M = $0.0002
  - Compute: 1000 games × 45s × $0.0000166667/GB-second = ~$2-5
  - **But**: Need provisioned concurrency to avoid cold starts = $50-100/month

**Implementation Example**:

```python
# backend/app/lambda_handler.py
import json
import boto3
from .services.analysis_service import AnalysisService
from .database import SessionLocal
from .models import Game, Move
from datetime import datetime

def lambda_handler(event, context):
    """AWS Lambda handler for game analysis"""
    game_id = event['game_id']

    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game or game.analysis_state == "analyzed":
            return {"status": "skipped"}

        # Set state to in_progress
        game.analysis_state = "in_progress"
        db.commit()

        # Analyze
        analysis_service = AnalysisService()
        import asyncio
        result = asyncio.run(analysis_service.analyze_game(game.pgn, game.user_color))

        if "error" not in result:
            stats = result.get("stats", {})
            game.is_analyzed = True
            game.analysis_state = "analyzed"
            # ... update game fields ...

            for move_data in result.get("moves", []):
                move = Move(game_id=game_id, **move_data)
                db.add(move)

            db.commit()

        return {"status": "completed", "game_id": game_id}
    finally:
        db.close()

# In FastAPI endpoint:
import boto3
lambda_client = boto3.client('lambda')

@router.post("/{game_id}/analyze", status_code=202)
async def analyze_game(game_id: int, ...):
    # ... validation ...

    game.analysis_state = "in_progress"
    db.commit()

    # Invoke Lambda
    lambda_client.invoke(
        FunctionName='chess-analytics-analyze-game',
        InvocationType='Event',  # Async
        Payload=json.dumps({'game_id': game_id})
    )

    return {"message": "Analysis started", "status": "processing"}
```

**Lambda Deployment**:

- Use **Container Images** (up to 10GB) to include Stockfish
- Set memory: 1024-2048 MB (Stockfish is CPU-intensive)
- Set timeout: 900 seconds (15 minutes max)
- Enable VPC for RDS access
- Consider provisioned concurrency to avoid cold starts

### Parallel Batch Analysis with Lambda (Massive Parallelization) 🚀

**The Key Idea**: Instead of analyzing games sequentially, dispatch **one Lambda per game** so they all run in parallel!

**Performance**:

- **Sequential**: 100 games = 50-100 minutes
- **Parallel Lambda**: 100 games = **1-2 minutes** (50-100x faster!)
- **1000 games**: Sequential = 8-17 hours, Parallel = **1-2 minutes** (500-1000x faster!)

**Implementation**:

```python
# backend/app/routers/games.py
import boto3
import json
from botocore.exceptions import ClientError

lambda_client = boto3.client('lambda')

@router.post("/analyze/all", status_code=202)
async def analyze_all_games(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start batch analysis using parallel Lambda functions"""

    # Check for existing job
    existing_job = db.query(AnalysisJob).filter(
        AnalysisJob.user_id == current_user.id,
        AnalysisJob.status.in_(["pending", "processing"])
    ).first()

    if existing_job:
        raise HTTPException(
            status_code=429,
            detail=f"You already have a batch analysis job running (Job #{existing_job.id})."
        )

    # Get all unanalyzed games
    games = db.query(Game).filter(
        Game.user_id == current_user.id,
        Game.analysis_state != "analyzed"
    ).all()

    if len(games) == 0:
        return {"message": "No games to analyze", "status": "completed"}

    # Create analysis job
    job = AnalysisJob(
        user_id=current_user.id,
        status="processing",
        total_games=len(games),
        analyzed_games=0,
        progress=0
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Dispatch one Lambda per game (MASSIVE PARALLELIZATION!)
    print(f"🚀 Dispatching {len(games)} Lambda functions for parallel analysis...")

    for game in games:
        # Set state to in_progress
        game.analysis_state = "in_progress"
        db.commit()

        # Invoke Lambda asynchronously (don't wait for response)
        try:
            lambda_client.invoke(
                FunctionName='chess-analytics-analyze-game',
                InvocationType='Event',  # Async - fire and forget
                Payload=json.dumps({
                    'game_id': game.id,
                    'job_id': job.id  # For progress tracking
                })
            )
        except ClientError as e:
            print(f"Error invoking Lambda for game {game.id}: {e}")
            game.analysis_state = "unanalyzed"
            db.commit()

    return {
        "job_id": job.id,
        "total_games": len(games),
        "message": f"Started parallel analysis of {len(games)} games",
        "status": "processing",
        "estimated_time_minutes": 1  # All run in parallel!
    }
```

**Lambda Handler** (single game analysis):

```python
# backend/app/lambda_handler.py
import json
from .services.analysis_service import AnalysisService
from .database import SessionLocal
from .models import Game, Move, AnalysisJob
from datetime import datetime
import asyncio

def lambda_handler(event, context):
    """AWS Lambda handler for analyzing a single game"""
    game_id = event.get('game_id')
    job_id = event.get('job_id')

    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game or game.analysis_state == "analyzed":
            return {'statusCode': 200, 'body': json.dumps({'status': 'skipped'})}

        # Analyze
        analysis_service = AnalysisService()
        result = asyncio.run(analysis_service.analyze_game(game.pgn, game.user_color))

        if "error" not in result:
            stats = result.get("stats", {})
            game.is_analyzed = True
            game.analysis_state = "analyzed"
            game.num_moves = stats.get("num_moves", 0)
            game.average_centipawn_loss = stats.get("average_centipawn_loss")
            game.accuracy = stats.get("accuracy")
            game.num_blunders = stats.get("num_blunders", 0)
            game.num_mistakes = stats.get("num_mistakes", 0)
            game.num_inaccuracies = stats.get("num_inaccuracies", 0)
            game.analyzed_at = datetime.utcnow()

            # Batch insert moves
            moves_list = [Move(game_id=game_id, **move_data)
                         for move_data in result.get("moves", [])]
            db.bulk_save_objects(moves_list)
            db.commit()

            # Update batch job progress
            if job_id:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                if job:
                    job.analyzed_games += 1
                    job.progress = int((job.analyzed_games / job.total_games) * 100)

                    # Check if complete
                    if job.analyzed_games >= job.total_games:
                        job.status = "completed"
                        job.completed_at = datetime.utcnow()

                    db.commit()

        return {'statusCode': 200, 'body': json.dumps({'status': 'completed'})}
    except Exception as e:
        # Mark as analyzed to prevent retry loops
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game:
                game.analysis_state = "analyzed"
                db.commit()
        except:
            pass
        raise
    finally:
        db.close()
```

**Important Considerations**:

1. **Lambda Concurrency Limits**:

   - Default: 1000 concurrent executions per region
   - Can request increase to 10,000+
   - Set reserved concurrency per function to prevent one function from using all capacity

2. **Database Connection Pooling**:

   - **Problem**: 1000 parallel Lambdas = 1000+ DB connections
   - **Solution**: Use **RDS Proxy** or **PgBouncer**
   - RDS Proxy: Managed connection pooling, handles up to 1000s of connections
   - Cost: ~$15-30/month

3. **Progress Tracking**:

   - Each Lambda updates `job.analyzed_games` in database
   - Frontend polls `/api/games/analyze/status/{job_id}`
   - Alternative: Use SQS + DynamoDB for more robust tracking

4. **Error Handling**:

   - Configure Dead Letter Queue (DLQ) for failed invocations
   - Set retry policy (2-3 retries)
   - Monitor CloudWatch for failures

5. **Cost at Scale**:

   **Detailed Cost Breakdown for 1000 Games**:

   | Component                              | Calculation                                 | Cost          |
   | -------------------------------------- | ------------------------------------------- | ------------- |
   | **Lambda Invocations**                 | 1000 × $0.20/1M                             | $0.0002       |
   | **Lambda Compute**                     | 1000 games × 45s × 2GB × $0.0000166667/GB-s | $1.50         |
   | **CloudWatch Logs**                    | ~500MB logs × $0.50/GB                      | $0.25         |
   | **Data Transfer**                      | Minimal (VPC internal)                      | $0.00         |
   | **RDS Proxy** (if needed)              | Per month (not per batch)                   | $20/month     |
   | **Provisioned Concurrency** (optional) | 100 × 2GB × $0.0000041667/GB-s × 30 days    | $50/month     |
   |                                        |                                             |               |
   | **One-time batch cost**                |                                             | **$1.75**     |
   | **Monthly infrastructure**             | RDS Proxy only                              | **$20/month** |
   | **With provisioned concurrency**       | RDS Proxy + Provisioned                     | **$70/month** |

   **Key Points**:

   - **Per 1000-game batch**: ~$1.75 (just Lambda costs)
   - **Monthly infrastructure**: $20 (RDS Proxy) if you need connection pooling
   - **Optional**: +$50/month for provisioned concurrency (eliminates cold starts)
   - **Total for 1 batch/month**: $1.75 + $20 = **$21.75**
   - **Total for 10 batches/month**: $17.50 + $20 = **$37.50**
   - **vs Celery**: $495/month (fixed cost, regardless of usage)

   **Cost Comparison**:

   - **Lambda**: Pay per batch - $1.75 per 1000 games
   - **Celery**: Fixed $495/month (even if you analyze 0 games)
   - **Break-even**: ~282 batches of 1000 games/month (unlikely!)
   - **Winner for bursty workloads**: Lambda (by far!)

**When This Pattern Excels**:

- ✅ Batch analysis jobs (your exact use case!)
- ✅ Need to process hundreds/thousands of games quickly
- ✅ Bursty workloads (analyze 1000 games, then nothing for days)
- ✅ Cost-effective for occasional large batches

**When to Use Celery Instead**:

- ✅ Steady, continuous workload
- ✅ Need predictable costs
- ✅ Simpler debugging and monitoring
- ✅ Don't need massive parallelization

---

### Phase 2.6: ECS with Spot Instances (Alternative Container Approach) 🐳

**Architecture**:

```
User Request → FastAPI → SQS Queue → ECS Tasks (Spot Instances)
                                      ↓
                                   Stockfish (in Container)
                                      ↓
                                  RDS PostgreSQL
```

**How It Works**:

1. User triggers batch analysis
2. FastAPI dispatches one ECS task per game to SQS
3. ECS Fargate Spot (or EC2 Spot) auto-scales to handle tasks
4. Each container analyzes one game
5. Tasks run in parallel across multiple spot instances
6. Results saved to database

**Pros**:

- ✅ **No timeout limits** (unlike Lambda's 15-min limit)
- ✅ **Spot instances are 60-90% cheaper** than on-demand
- ✅ **More CPU/memory** - can use larger instances for faster analysis
- ✅ **Better for long-running jobs** (games that take >15 minutes)
- ✅ **Full control** over container environment
- ✅ **Can use existing Docker images** (no Lambda packaging needed)
- ✅ **Spot interruptions are fine** for batch jobs (tasks auto-retry)
- ✅ **No cold starts** (containers stay warm during batch)

**Cons**:

- ❌ **More complex setup** (ECS cluster, task definitions, auto-scaling)
- ❌ **Spot instances can be interrupted** (but tasks auto-retry on different instance)
- ❌ **Container startup time** (~30-60 seconds for first task)
- ❌ **Need to manage scaling policies** (when to scale up/down)
- ❌ **More moving parts** (ECS, SQS, CloudWatch, IAM roles)
- ❌ **Cost varies** with spot pricing (but still very cheap)

**Cost Comparison for 1000 Games**:

| Component                | Lambda                | ECS Fargate Spot      | ECS EC2 Spot        |
| ------------------------ | --------------------- | --------------------- | ------------------- |
| **Compute**              | $1.50                 | $0.75-1.25            | $0.50-0.75          |
| **Invocations/Tasks**    | $0.0002               | $0.00 (SQS free tier) | $0.00               |
| **Infrastructure**       | $20/month (RDS Proxy) | $0 (no extra infra)   | $0 (no extra infra) |
| **ECS Cluster**          | N/A                   | $0 (Fargate)          | ~$10/month (EC2)    |
| **SQS**                  | N/A                   | $0.40 (1M requests)   | $0.40               |
| **CloudWatch Logs**      | $0.25                 | $0.25                 | $0.25               |
| **Total per 1000 games** | **$1.75**             | **$1.40-1.90**        | **$1.15-1.40**      |
| **Monthly (10 batches)** | $37.50                | $14-19                | $11.50-14           |

**Detailed ECS Spot Cost Calculation**:

**ECS Fargate Spot** (Serverless Containers):

- **vCPU**: $0.01248/hour (spot pricing, ~70% discount)
- **Memory**: $0.00137/GB-hour (spot pricing)
- **Per game**: 45s × 2 vCPU × 4GB = 0.0125 hours
- **Cost per game**: 0.0125 × ($0.01248 × 2 + $0.00137 × 4) = **$0.00038**
- **1000 games**: $0.38 (compute) + $0.40 (SQS) + $0.25 (logs) = **$1.03**

**ECS EC2 Spot** (More Control):

- **c5.xlarge** (4 vCPU, 8GB): ~$0.10/hour spot (vs $0.17 on-demand)
- **Per game**: 45s = 0.0125 hours
- **Cost per game**: 0.0125 × $0.10 = **$0.00125**
- **1000 games**: $1.25 (compute) + $0.40 (SQS) + $0.25 (logs) = **$1.90**
- **But**: Can run multiple games per instance (4-8 parallel) = **$0.24-0.48 per game**

**Performance Comparison**:

| Metric                 | Lambda             | ECS Fargate Spot    | ECS EC2 Spot         |
| ---------------------- | ------------------ | ------------------- | -------------------- |
| **Cold Start**         | 1-5 seconds        | 30-60 seconds       | 30-60 seconds        |
| **Max Duration**       | 15 minutes         | Unlimited           | Unlimited            |
| **Parallelization**    | 1000+ concurrent   | 1000+ concurrent    | 1000+ concurrent     |
| **CPU/Memory**         | Up to 10GB, 6 vCPU | Up to 120GB, 4 vCPU | Up to 448GB, 96 vCPU |
| **Scaling Speed**      | Instant            | 1-2 minutes         | 1-2 minutes          |
| **Spot Interruptions** | N/A                | Auto-retry          | Auto-retry           |

**Implementation Example**:

```python
# backend/app/routers/games.py
import boto3
import json

ecs_client = boto3.client('ecs')
sqs_client = boto3.client('sqs')

@router.post("/analyze/all", status_code=202)
async def analyze_all_games(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start batch analysis using ECS Spot tasks"""

    # Get all unanalyzed games
    games = db.query(Game).filter(
        Game.user_id == current_user.id,
        Game.analysis_state != "analyzed"
    ).all()

    if len(games) == 0:
        return {"message": "No games to analyze", "status": "completed"}

    # Create analysis job
    job = AnalysisJob(
        user_id=current_user.id,
        status="processing",
        total_games=len(games),
        analyzed_games=0,
        progress=0
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Send tasks to SQS (ECS will auto-scale to process them)
    queue_url = os.getenv('ECS_TASK_QUEUE_URL')

    for game in games:
        game.analysis_state = "in_progress"
        db.commit()

        # Send message to SQS
        sqs_client.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps({
                'game_id': game.id,
                'job_id': job.id
            })
        )

    # Trigger ECS service to scale up (or use auto-scaling)
    ecs_client.update_service(
        cluster='chess-analytics',
        service='game-analysis-worker',
        desiredCount=min(len(games) // 10, 100)  # 10 games per task, max 100 tasks
    )

    return {
        "job_id": job.id,
        "total_games": len(games),
        "message": f"Started ECS batch analysis of {len(games)} games",
        "status": "processing"
    }
```

**ECS Task Definition** (Docker container):

```json
{
  "family": "chess-game-analysis",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048", // 2 vCPU
  "memory": "4096", // 4GB
  "containerDefinitions": [
    {
      "name": "analysis-worker",
      "image": "your-ecr-repo/chess-analytics:latest",
      "command": ["python", "-m", "app.workers.analyze_game"],
      "environment": [
        { "name": "DATABASE_URL", "value": "..." },
        { "name": "GAME_ID", "value": "from-sqs-message" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/chess-analysis",
          "awslogs-region": "us-east-1"
        }
      }
    }
  ]
}
```

**When to Choose ECS Spot vs Lambda**:

**Choose ECS Spot if**:

- ✅ Need to run jobs longer than 15 minutes
- ✅ Want maximum cost savings (60-90% cheaper than on-demand)
- ✅ Need more CPU/memory than Lambda provides
- ✅ Already using Docker/containers
- ✅ Want full control over the environment
- ✅ Can tolerate spot interruptions (auto-retry handles this)

**Choose Lambda if**:

- ✅ Jobs fit in 15-minute window (your games do!)
- ✅ Want simplest setup (no ECS cluster management)
- ✅ Need instant scaling (Lambda is faster)
- ✅ Want zero infrastructure management
- ✅ Prefer pay-per-invocation model

**Verdict for Chess Game Analysis**:

| Factor                     | Winner          | Notes                                                     |
| -------------------------- | --------------- | --------------------------------------------------------- |
| **Cost**                   | 🟡 **Tie**      | ECS Spot: ~$1.15-1.90 vs Lambda: ~$1.75 (both very cheap) |
| **Simplicity**             | 🟢 **Lambda**   | Lambda is much simpler to set up                          |
| **Speed**                  | 🟢 **Lambda**   | Faster cold starts, instant scaling                       |
| **Flexibility**            | 🟢 **ECS Spot** | No timeout limits, more CPU/memory                        |
| **Reliability**            | 🟡 **Tie**      | Both handle failures well (auto-retry)                    |
| **Best for your use case** | 🟢 **Lambda**   | Games take 30-60s (well under 15-min limit)               |

**Recommendation**: **Use Lambda** for your chess game analysis because:

1. Games take 30-60 seconds (well under 15-min limit)
2. Simpler setup and management
3. Costs are nearly identical
4. Faster scaling and cold starts
5. Zero infrastructure to manage

**Use ECS Spot if**:

- You need to analyze very long games (>15 minutes)
- You want to run multiple games per container (cost optimization)
- You already have ECS infrastructure
- You need more CPU/memory than Lambda provides

**Parallel Batch Analysis with Lambda** (Recommended Pattern):

Instead of analyzing games sequentially, dispatch one Lambda per game for massive parallelization:

```python
# backend/app/routers/games.py
import boto3
import json
from botocore.exceptions import ClientError

lambda_client = boto3.client('lambda')

@router.post("/analyze/all", status_code=202)
async def analyze_all_games(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start batch analysis using parallel Lambda functions"""

    # Check for existing job
    existing_job = db.query(AnalysisJob).filter(
        AnalysisJob.user_id == current_user.id,
        AnalysisJob.status.in_(["pending", "processing"])
    ).first()

    if existing_job:
        raise HTTPException(
            status_code=429,
            detail=f"You already have a batch analysis job running (Job #{existing_job.id}). Please wait for it to complete."
        )

    # Get all unanalyzed games
    games = db.query(Game).filter(
        Game.user_id == current_user.id,
        Game.analysis_state != "analyzed"
    ).all()

    if len(games) == 0:
        return {"message": "No games to analyze", "status": "completed"}

    # Create analysis job
    job = AnalysisJob(
        user_id=current_user.id,
        status="processing",
        total_games=len(games),
        analyzed_games=0,
        progress=0
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Dispatch one Lambda per game (massive parallelization!)
    print(f"Dispatching {len(games)} Lambda functions for parallel analysis...")

    for game in games:
        # Set state to in_progress
        game.analysis_state = "in_progress"
        db.commit()

        # Invoke Lambda asynchronously
        try:
            lambda_client.invoke(
                FunctionName='chess-analytics-analyze-game',
                InvocationType='Event',  # Async - don't wait for response
                Payload=json.dumps({
                    'game_id': game.id,
                    'job_id': job.id  # For progress tracking
                })
            )
        except ClientError as e:
            print(f"Error invoking Lambda for game {game.id}: {e}")
            # Mark as failed
            game.analysis_state = "unanalyzed"
            db.commit()

    return {
        "job_id": job.id,
        "total_games": len(games),
        "message": f"Started parallel analysis of {len(games)} games",
        "status": "processing",
        "estimated_time_minutes": 1  # All run in parallel!
    }
```

**Lambda Handler** (for single game analysis):

```python
# backend/app/lambda_handler.py
import json
import os
from .services.analysis_service import AnalysisService
from .database import SessionLocal
from .models import Game, Move, AnalysisJob
from datetime import datetime
import asyncio

def lambda_handler(event, context):
    """AWS Lambda handler for analyzing a single game"""
    game_id = event.get('game_id')
    job_id = event.get('job_id')  # Optional: for batch job tracking

    if not game_id:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'game_id is required'})
        }

    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            print(f"Game {game_id} not found")
            return {'statusCode': 404, 'body': json.dumps({'error': 'Game not found'})}

        if game.analysis_state == "analyzed":
            print(f"Game {game_id} already analyzed, skipping")
            return {'statusCode': 200, 'body': json.dumps({'status': 'skipped'})}

        # Ensure state is in_progress
        if game.analysis_state != "in_progress":
            game.analysis_state = "in_progress"
            db.commit()

        # Analyze the game
        analysis_service = AnalysisService()
        result = asyncio.run(analysis_service.analyze_game(game.pgn, game.user_color))

        if "error" in result:
            print(f"Error analyzing game {game_id}: {result['error']}")
            game.is_analyzed = True
            game.analysis_state = "analyzed"
            game.num_moves = 0
            game.analyzed_at = datetime.utcnow()
            db.commit()
            return {'statusCode': 500, 'body': json.dumps({'error': result['error']})}

        # Update game with analysis results
        stats = result.get("stats", {})
        game.is_analyzed = True
        game.analysis_state = "analyzed"
        game.num_moves = stats.get("num_moves", 0)
        game.average_centipawn_loss = stats.get("average_centipawn_loss")
        game.accuracy = stats.get("accuracy")
        game.num_blunders = stats.get("num_blunders", 0)
        game.num_mistakes = stats.get("num_mistakes", 0)
        game.num_inaccuracies = stats.get("num_inaccuracies", 0)
        game.analyzed_at = datetime.utcnow()

        # Store move analysis
        for move_data in result.get("moves", []):
            move = Move(game_id=game_id, **move_data)
            db.add(move)

        db.commit()

        # Update batch job progress if job_id provided
        if job_id:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
                job.analyzed_games += 1
                job.progress = int((job.analyzed_games / job.total_games) * 100)

                # Check if all games are done
                remaining = db.query(Game).filter(
                    Game.user_id == job.user_id,
                    Game.analysis_state == "in_progress"
                ).count()

                if remaining == 0:
                    job.status = "completed"
                    job.completed_at = datetime.utcnow()

                db.commit()

        print(f"✓ Game {game_id} analysis completed")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'status': 'completed',
                'game_id': game_id
            })
        }

    except Exception as e:
        print(f"Error in Lambda handler for game {game_id}: {e}")
        import traceback
        traceback.print_exc()

        # Mark game as analyzed to prevent retry loops
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game and game.analysis_state != "analyzed":
                game.is_analyzed = True
                game.analysis_state = "analyzed"
                game.num_moves = 0
                game.analyzed_at = datetime.utcnow()
                db.commit()
        except:
            pass

        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
    finally:
        db.close()
```

**Performance Comparison**:

| Approach                 | 100 Games          | 1000 Games           |
| ------------------------ | ------------------ | -------------------- |
| **Sequential (Current)** | ~50-100 min        | ~8-17 hours          |
| **Lambda Parallel**      | ~1-2 min           | ~1-2 min             |
| **Speedup**              | **50-100x faster** | **500-1000x faster** |

**Lambda Concurrency Limits**:

- **Default**: 1000 concurrent executions per region
- **Can request increase**: Up to 10,000+ concurrent executions
- **Per-function limit**: Can set reserved concurrency to prevent one function from using all capacity

**Cost Example** (1000 games analyzed in parallel):

- **Invocations**: 1000 × $0.20/1M = $0.0002
- **Compute**: 1000 games × 45s × 2GB × $0.0000166667/GB-second = ~$1.50
- **Total**: ~$1.50 (vs $495/month for Celery workers)
- **But**: Need provisioned concurrency for consistent performance = +$50-100/month

**Important Considerations**:

1. **Database Connection Pooling**: Each Lambda creates its own DB connection. With 1000 parallel Lambdas, you need:

   - RDS connection limit: At least 1000+ connections
   - Connection pooling: Use RDS Proxy or PgBouncer

2. **Progress Tracking**:

   - Option A: Poll database for `analysis_state` (current implementation)
   - Option B: Use SQS + DynamoDB for progress tracking
   - Option C: Use Step Functions for orchestration

3. **Error Handling**:

   - Dead Letter Queue (DLQ) for failed invocations
   - Retry logic in Lambda
   - Monitor CloudWatch for failures

4. **VPC Configuration**:
   - Lambda needs VPC access for RDS
   - Adds ~100-500ms latency per invocation
   - Consider RDS Proxy to reduce connection overhead

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
- **CloudWatch**: For Lambda monitoring

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

### With AWS Lambda (Parallel Batch Analysis):

**Per 1000-Game Batch**:

- **Lambda Invocations**: 1000 × $0.20/1M = $0.0002
- **Lambda Compute**: 1000 × 45s × 2GB × $0.0000166667/GB-s = **$1.50**
- **CloudWatch Logs**: ~500MB × $0.50/GB = $0.25
- **Batch Total**: **~$1.75 per 1000 games**

**Monthly Infrastructure** (if using Lambda):

- **RDS PostgreSQL**: ~$60/month
- **RDS Proxy** (for connection pooling): ~$20/month
- **API Gateway + Lambda** (API): ~$20/month
- **Provisioned Concurrency** (optional, eliminates cold starts): ~$50-100/month
- **Infrastructure Total**: ~$100-180/month

**Example Monthly Costs**:

- **1 batch of 1000 games**: $1.75 + $100 = **$101.75/month**
- **10 batches of 1000 games**: $17.50 + $100 = **$117.50/month**
- **100 batches of 1000 games**: $175 + $100 = **$275/month**

**Capacity**: 50-500 active users (with auto-scaling)
**Note**: Cost scales with usage - pay only for what you use!

### Kubernetes (Auto-scaling):

- **EKS Cluster**: ~$75/month
- **EC2 instances** (auto-scale 2-10): ~$150-750/month
- **RDS, Redis, etc.**: ~$100/month
- **Total**: ~$325-925/month (varies with load)
- **Capacity**: 100-1000+ users

---

## Quick Reference: When to Upgrade

| Scenario            | Current | Celery | Lambda | K8s |
| ------------------- | ------- | ------ | ------ | --- |
| Personal project    | ✅      | ❌     | ❌     | ❌  |
| Small team (5-10)   | ✅      | ⚠️     | ❌     | ❌  |
| Startup (10-50)     | ❌      | ✅     | ⚠️     | ❌  |
| Production (50-500) | ❌      | ✅     | ✅     | ⚠️  |
| Enterprise (500+)   | ❌      | ⚠️     | ⚠️     | ✅  |

---

## Recommendation: Celery vs Lambda

### Choose **Celery** if:

- ✅ Predictable, steady workload
- ✅ Want simpler setup and debugging
- ✅ Need batch analysis jobs (no timeout limits)
- ✅ Cost-effective for consistent usage
- ✅ Already using Docker/containers

### Choose **Lambda** if:

- ✅ Bursty, unpredictable workloads
- ✅ Need to scale from 0 to 1000s instantly
- ✅ Want fully serverless architecture
- ✅ Single game analysis only (fits in 15-min timeout)
- ✅ Willing to pay premium for serverless convenience
- ✅ Need to handle traffic spikes automatically

### Hybrid Approach (Best of Both):

- **FastAPI + Celery** for steady-state workloads
- **Lambda** for handling traffic spikes
- Use SQS to route between them based on queue depth

---

## Summary

**Current Implementation**: Good for MVP and small-scale use

- ✅ Simple to understand
- ✅ Easy to deploy
- ✅ No additional infrastructure
- ✅ Analysis state persists across refreshes
- ❌ Limited to ~5-10 concurrent users
- ❌ No true job queue

**Next Steps**:

1. **Short term**: Keep current setup, monitor usage
2. **Medium term**: Add Celery when you hit ~10 active users (recommended)
3. **Alternative**: Consider Lambda if you have bursty workloads and want serverless
4. **Long term**: Move to Kubernetes when you need 100+ users

**You're covered for now!** The rate limiting and analysis state tracking will prevent overload. Monitor your usage and upgrade when needed. 🎉
