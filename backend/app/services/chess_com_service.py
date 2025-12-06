import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from typing import List, Dict, Optional
from datetime import datetime
import chess.pgn
from io import StringIO
from ..config import settings


class ChessComService:
    """Service for interacting with Chess.com API"""
    
    def __init__(self):
        self.session = self._make_session()
    
    def _make_session(self):
        """Configure a session with retry logic and compliant User-Agent"""
        session = requests.Session()
        session.headers.update({
            "User-Agent": settings.CHESS_COM_USER_AGENT
        })
        retries = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[403, 429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        session.mount("https://", HTTPAdapter(max_retries=retries))
        return session
    
    def get_archive_urls(self, username: str) -> List[str]:
        """Get all monthly archive URLs for a player"""
        username = username.strip().lower()
        archives_url = f"https://api.chess.com/pub/player/{username}/games/archives"
        
        response = self.session.get(archives_url, timeout=10)
        
        if response.status_code == 403:
            raise Exception("403 Forbidden — Chess.com may be blocking requests")
        elif response.status_code == 404:
            raise Exception(f"User '{username}' not found on Chess.com. Please verify the username is correct.")
        elif response.status_code == 410:
            raise Exception(f"User '{username}' not found or has no games on Chess.com. Please verify the username is correct.")
        elif response.status_code != 200:
            raise Exception(f"Failed to fetch archives from Chess.com: HTTP {response.status_code}. Please try again later.")
        
        archives = response.json().get("archives", [])
        if not archives:
            raise Exception(f"No games found for user '{username}' on Chess.com.")
        
        return archives
    
    def get_games_from_archive(self, archive_url: str) -> List[Dict]:
        """Fetch games from a specific monthly archive"""
        response = self.session.get(archive_url, timeout=15)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch archive: {response.status_code}")
        
        games = response.json().get("games", [])
        return games
    
    def get_all_games(self, username: str) -> List[Dict]:
        """Fetch all games for a player"""
        username = username.lower()
        archives = self.get_archive_urls(username)
        
        all_games = []
        for archive_url in archives:
            try:
                games = self.get_games_from_archive(archive_url)
                all_games.extend(games)
            except Exception as e:
                print(f"Error fetching {archive_url}: {e}")
                continue
        
        return all_games
    
    def parse_game_data(self, game_data: Dict, target_username: str) -> Optional[Dict]:
        """Parse a Chess.com game into our format"""
        target_username = target_username.lower()
        
        white_username = game_data["white"]["username"].lower()
        black_username = game_data["black"]["username"].lower()
        
        # Determine user's color and rating
        if white_username == target_username:
            user_color = "white"
            user_result = game_data["white"]["result"]
            user_rating = game_data["white"].get("rating")
            opponent = game_data["black"]["username"]
        elif black_username == target_username:
            user_color = "black"
            user_result = game_data["black"]["result"]
            user_rating = game_data["black"].get("rating")
            opponent = game_data["white"]["username"]
        else:
            return None  # User not in this game
        
        # Determine result
        if user_result == "win":
            result = "win"
        elif user_result in ["checkmated", "resigned", "timeout", "lose", "abandoned"]:
            result = "loss"
        elif user_result in ["agreed", "stalemate", "repetition", "timevsinsufficient", "insufficient"]:
            result = "draw"
        else:
            result = "draw"  # Default to draw for unknown results
        
        # Get PGN
        pgn = game_data.get("pgn", "")
        
        # Extract opening from PGN headers if available
        opening_eco = None
        opening_name = None
        try:
            pgn_io = StringIO(pgn)
            game = chess.pgn.read_game(pgn_io)
            if game:
                opening_eco = game.headers.get("ECO")
                opening_name = game.headers.get("Opening")
        except:
            pass
        
        return {
            "chess_com_url": game_data.get("url"),
            "chess_com_id": game_data.get("url", "").split("/")[-1] if game_data.get("url") else None,
            "pgn": pgn,
            "white_player": game_data["white"]["username"],
            "black_player": game_data["black"]["username"],
            "white_elo": game_data["white"].get("rating"),
            "black_elo": game_data["black"].get("rating"),
            "user_color": user_color,
            "user_rating": user_rating,
            "result": result,
            "termination": user_result,
            "time_class": game_data.get("time_class"),
            "time_control": game_data.get("time_control"),
            "opening_eco": opening_eco,
            "opening_name": opening_name,
            "date_played": datetime.fromtimestamp(game_data.get("end_time", 0)),
        }
    
    def fetch_and_parse_games(
        self, 
        username: str, 
        from_year: int = None, 
        from_month: int = None,
        to_year: int = None,
        to_month: int = None
    ) -> List[Dict]:
        """
        Fetch and parse games with optional date filtering
        
        Args:
            username: Chess.com username
            from_year: Start year (e.g., 2023)
            from_month: Start month (1-12)
            to_year: End year
            to_month: End month (1-12)
        """
        # Get all archive URLs
        archives = self.get_archive_urls(username)
        
        # Filter archives by date if specified
        if from_year or to_year:
            filtered_archives = []
            for archive_url in archives:
                # Extract year and month from URL (format: .../YYYY/MM)
                parts = archive_url.rstrip('/').split('/')
                if len(parts) >= 2:
                    try:
                        year = int(parts[-2])
                        month = int(parts[-1])
                        
                        # Check if within date range
                        if from_year and (year < from_year or (year == from_year and month < (from_month or 1))):
                            continue
                        if to_year and (year > to_year or (year == to_year and month > (to_month or 12))):
                            continue
                        
                        filtered_archives.append(archive_url)
                    except ValueError:
                        # If parsing fails, include the archive
                        filtered_archives.append(archive_url)
            archives = filtered_archives
        
        # Fetch games from selected archives
        raw_games = []
        for archive_url in archives:
            try:
                games = self.get_games_from_archive(archive_url)
                raw_games.extend(games)
            except Exception as e:
                print(f"Error fetching {archive_url}: {e}")
                continue
        
        # Parse games
        parsed_games = []
        for game_data in raw_games:
            parsed = self.parse_game_data(game_data, username)
            if parsed:
                parsed_games.append(parsed)
        
        return parsed_games

