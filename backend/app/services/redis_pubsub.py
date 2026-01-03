"""
Redis Pub/Sub service for real-time game analysis event notifications.
This service allows Celery workers to publish events when game analysis completes,
and FastAPI SSE endpoints to subscribe and stream these events to the frontend.
"""
import redis
import json
import logging
from typing import Optional
from datetime import datetime
from ..config import settings

logger = logging.getLogger(__name__)


class RedisPubSub:
    """Helper class for Redis pub/sub operations for game analysis events"""
    
    def __init__(self):
        """Initialize Redis client connection"""
        try:
            self.redis_client = redis.from_url(
                settings.REDIS_URL, 
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            # Test connection
            self.redis_client.ping()
            logger.info(f"Redis pub/sub client initialized successfully (URL: {settings.REDIS_URL})")
        except Exception as e:
            logger.error(f"Failed to initialize Redis pub/sub client: {e}")
            raise
    
    def publish_game_completed(self, user_id: int, game_id: int):
        """
        Publish a game analysis completion event to Redis.
        
        Args:
            user_id: ID of the user who owns the game
            game_id: ID of the game that completed analysis
        """
        channel = f"game_analysis:completed:user_{user_id}"
        message = {
            "type": "game_analysis_completed",
            "user_id": user_id,
            "game_id": game_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        try:
            subscribers = self.redis_client.publish(channel, json.dumps(message))
            logger.info(
                f"Published game completion event: user={user_id}, game={game_id}, "
                f"subscribers={subscribers}, channel={channel}"
            )
            return True
        except Exception as e:
            logger.error(f"Error publishing game completion event to Redis: {e}", exc_info=True)
            return False
    
    def get_subscriber(self, user_id: int):
        """
        Get a Redis pubsub subscriber for a specific user's game analysis events.
        
        Args:
            user_id: ID of the user to subscribe to events for
            
        Returns:
            redis.client.PubSub: PubSub object subscribed to the user's channel
        """
        try:
            pubsub = self.redis_client.pubsub()
            channel = f"game_analysis:completed:user_{user_id}"
            pubsub.subscribe(channel)
            logger.info(f"Subscribed to Redis channel: {channel} for user {user_id}")
            return pubsub
        except Exception as e:
            logger.error(f"Error creating Redis subscriber for user {user_id}: {e}", exc_info=True)
            raise
    
    def close(self):
        """Close the Redis connection"""
        try:
            if hasattr(self, 'redis_client'):
                self.redis_client.close()
                logger.info("Redis pub/sub client closed")
        except Exception as e:
            logger.warning(f"Error closing Redis pub/sub client: {e}")


# Singleton instance
redis_pubsub = RedisPubSub()

