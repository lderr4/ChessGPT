import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import chess.pgn
from io import StringIO
import json


class LichessService:
    """Service for interacting with Lichess.org API"""
    
    def __init__(self):
        self.base_url = "https://lichess.org/api"
        self.session = self._make_session()
    
    def _make_session(self):
        """Configure a session with retry logic and User-Agent"""
        session = requests.Session()
        session.headers.update({
            "User-Agent": "ChessAnalytics/1.0 (https://github.com/yourusername/chess-analytics)"
        })
        retries = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        session.mount("https://", HTTPAdapter(max_retries=retries))
        return session
    
    def get_user_games(
        self,
        username: str,
        max_games: int = 200,
        since: Optional[int] = None,
        until: Optional[int] = None
    ) -> List[Dict]:
        """
        Fetch games for a Lichess user
        
        Args:
            username: Lichess username
            max_games: Maximum number of games to fetch (default 200, max 200)
            since: Timestamp in milliseconds (start date)
            until: Timestamp in milliseconds (end date)
        
        Returns:
            List of game dictionaries
        """
        username = username.strip()
        url = f"{self.base_url}/games/user/{username}"
        
        params = {
            "max": min(max_games, 200),
            "pgnInJson": "true"
        }
        
        if since:
            params["since"] = since
        if until:
            params["until"] = until
        
        try:
            response = self.session.get(url, params=params, timeout=30, stream=True)
            
            if response.status_code == 404:
                raise Exception(f"User '{username}' not found on Lichess.org. Please verify the username is correct.")
            elif response.status_code == 429:
                raise Exception("Rate limit exceeded. Please wait a moment and try again.")
            elif response.status_code != 200:
                raise Exception(f"Failed to fetch games from Lichess.org: HTTP {response.status_code}. Please try again later.")
            
            # Lichess returns NDJSON (newline-delimited JSON)
            games = []
            for line in response.iter_lines(decode_unicode=True):
                if line:
                    try:
                        game_data = json.loads(line)
                        games.append(game_data)
                    except json.JSONDecodeError:
                        continue
                    except Exception as e:
                        print(f"Error parsing game line: {e}")
                        continue
            
            return games
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Error connecting to Lichess.org: {str(e)}")
    
    def parse_game_data(self, game_data: Dict, target_username: str) -> Optional[Dict]:
        """Parse a Lichess game into our format"""
        target_username = target_username.lower()
        
        # Lichess game structure
        players = game_data.get("players", {})
        white_player_data = players.get("white", {})
        black_player_data = players.get("black", {})
        
        # Get player names
        white_username = white_player_data.get("user", {}).get("name", "").lower()
        black_username = black_player_data.get("user", {}).get("name", "").lower()
        
        # Determine user's color and rating
        if white_username == target_username:
            user_color = "white"
            user_rating = white_player_data.get("rating")
            opponent_username = black_player_data.get("user", {}).get("name", "")
        elif black_username == target_username:
            user_color = "black"
            user_rating = black_player_data.get("rating")
            opponent_username = white_player_data.get("user", {}).get("name", "")
        else:
            return None  # User not in this game
        
        # Determine result from winner field
        winner = game_data.get("winner")
        if winner == user_color:
            result = "win"
        elif winner and winner != user_color:
            result = "loss"
        else:
            result = "draw"  # winner is None for draws
        
        # Get termination reason
        status = game_data.get("status", "")
        termination = None
        if "checkmate" in status.lower():
            termination = "checkmate"
        elif "resign" in status.lower():
            termination = "resignation"
        elif "timeout" in status.lower() or "time" in status.lower():
            termination = "timeout"
        elif "stalemate" in status.lower():
            termination = "stalemate"
        elif "draw" in status.lower():
            termination = "draw"
        
        # Get PGN
        pgn = game_data.get("pgn", "")
        if not pgn:
            # Try to get from moves if PGN not available
            moves = game_data.get("moves", "")
            if moves:
                pgn = moves
        
        # Extract opening from PGN headers if available
        opening_eco = None
        opening_name = None
        try:
            if pgn:
                pgn_io = StringIO(pgn)
                game = chess.pgn.read_game(pgn_io)
                if game:
                    opening_eco = game.headers.get("ECO")
                    opening_name = game.headers.get("Opening")
        except:
            pass
        
        # Get time control
        time_control = game_data.get("clock", {}).get("initial", None)
        if time_control:
            increment = game_data.get("clock", {}).get("increment", 0)
            time_control_str = f"{time_control // 60}+{increment}"
        else:
            time_control_str = game_data.get("timeControl", None)
        
        # Determine time class from time control
        time_class = None
        if time_control_str:
            try:
                initial, increment = map(int, time_control_str.split("+"))
                total_seconds = initial + (increment * 40)  # Rough estimate
                if total_seconds < 180:
                    time_class = "bullet"
                elif total_seconds < 600:
                    time_class = "blitz"
                elif total_seconds < 1800:
                    time_class = "rapid"
                else:
                    time_class = "classical"
            except:
                time_class = "rapid"  # Default
        
        # Get game date
        created_at = game_data.get("createdAt")
        if created_at:
            # Lichess uses milliseconds timestamp
            date_played = datetime.fromtimestamp(created_at / 1000)
        else:
            date_played = datetime.utcnow()
        
        # Get game ID and URL
        game_id = game_data.get("id", "")
        lichess_url = f"https://lichess.org/{game_id}" if game_id else None
        
        return {
            "lichess_url": lichess_url,
            "lichess_id": game_id,
            "pgn": pgn,
            "white_player": white_player_data.get("user", {}).get("name", ""),
            "black_player": black_player_data.get("user", {}).get("name", ""),
            "white_elo": white_player_data.get("rating"),
            "black_elo": black_player_data.get("rating"),
            "user_color": user_color,
            "user_rating": user_rating,
            "result": result,
            "termination": termination,
            "time_class": time_class,
            "time_control": time_control_str,
            "opening_eco": opening_eco,
            "opening_name": opening_name,
            "date_played": date_played,
        }
    
    def fetch_and_parse_games(
        self,
        username: str,
        from_year: Optional[int] = None,
        from_month: Optional[int] = None,
        to_year: Optional[int] = None,
        to_month: Optional[int] = None
    ) -> List[Dict]:
        """
        Fetch and parse games with optional date filtering
        
        Args:
            username: Lichess username
            from_year: Start year (e.g., 2023)
            from_month: Start month (1-12)
            to_year: End year
            to_month: End month (1-12)
        """
        # Convert date range to timestamps
        since = None
        until = None
        
        if from_year:
            from_month = from_month or 1
            since_dt = datetime(from_year, from_month, 1)
            since = int(since_dt.timestamp() * 1000)  # Convert to milliseconds
        
        if to_year:
            to_month = to_month or 12
            # Get last day of month
            if to_month == 12:
                until_dt = datetime(to_year + 1, 1, 1) - timedelta(seconds=1)
            else:
                until_dt = datetime(to_year, to_month + 1, 1) - timedelta(seconds=1)
            until = int(until_dt.timestamp() * 1000)  # Convert to milliseconds
        
        # Fetch games in batches (Lichess max is 200 per request)
        all_games = []
        max_per_request = 200
        offset = 0
        
        while True:
            try:
                # Calculate 'since' for pagination (fetch older games)
                # For simplicity, we'll fetch all games and filter by date
                games = self.get_user_games(
                    username,
                    max_games=max_per_request,
                    since=since,
                    until=until
                )
                
                if not games:
                    break
                
                all_games.extend(games)
                
                # If we got fewer than max, we've reached the end
                if len(games) < max_per_request:
                    break
                
                # For pagination, we'd need to use the oldest game's timestamp
                # But Lichess API doesn't support offset, so we'll fetch all at once
                # and filter client-side if needed
                break
                
            except Exception as e:
                print(f"Error fetching games batch: {e}")
                break
        
        # Parse games
        parsed_games = []
        for game_data in all_games:
            parsed = self.parse_game_data(game_data, username)
            if parsed:
                parsed_games.append(parsed)
        
        return parsed_games
