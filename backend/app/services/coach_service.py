from typing import Optional, Dict
import requests
from openai import OpenAI
from ..config import settings


class CoachService:
    """Service for generating AI-powered chess coaching commentary"""
    
    def __init__(self):
        self.provider = settings.COACH_PROVIDER.lower()
        
        if not settings.ENABLE_COACH:
            self.enabled = False
            self.client = None
            return
        
        # Initialize based on provider
        if self.provider == "openai":
            if settings.OPENAI_API_KEY:
                self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
                self.model = settings.OPENAI_MODEL
                self.enabled = True
            else:
                print("OpenAI API key not found. Coach disabled.")
                self.enabled = False
                self.client = None
        
        elif self.provider == "ollama":
            # Ollama runs locally, no API key needed
            self.ollama_url = settings.OLLAMA_BASE_URL
            self.model = settings.OLLAMA_MODEL
            self.enabled = True
            self.client = None
            print(f"Using Ollama with model: {self.model} at {self.ollama_url}")
        
        else:
            print(f"Unknown coach provider: {self.provider}. Coach disabled.")
            self.enabled = False
            self.client = None
    
    def is_enabled(self) -> bool:
        """Check if coach service is enabled and configured"""
        return self.enabled
    
    async def generate_move_commentary(
        self,
        move_san: str,
        classification: str,
        centipawn_loss: float,
        fen_before: str,
        fen_after: str,
        best_move_san: Optional[str],
        game_phase: str,
        user_color: str
    ) -> Optional[str]:
        """
        Generate coaching commentary for a move
        
        Args:
            move_san: The move played in SAN notation
            classification: Move classification (blunder, mistake, inaccuracy, etc.)
            centipawn_loss: Centipawn loss for this move
            fen_before: FEN position before the move
            fen_after: FEN position after the move
            best_move_san: Best move in SAN notation (if available)
            game_phase: Phase of the game (opening, middlegame, endgame)
            user_color: Color the user is playing (white/black)
            
        Returns:
            Coaching commentary string or None if generation fails
        """
        if not self.is_enabled():
            return None
        
        # Only generate commentary for significant mistakes
        if classification not in ["blunder", "mistake", "inaccuracy"]:
            return None
        
        try:
            # Build the prompt
            prompt = self._build_coaching_prompt(
                move_san=move_san,
                classification=classification,
                centipawn_loss=centipawn_loss,
                fen_before=fen_before,
                best_move_san=best_move_san,
                game_phase=game_phase,
                user_color=user_color
            )
            
            system_prompt = "You are an experienced chess coach providing constructive feedback. Be concise, educational, and encouraging. Focus on explaining why a move was problematic and what the player should have considered. Keep responses to 1-2 sentences."
            
            # Generate commentary based on provider
            if self.provider == "openai":
                commentary = self._generate_with_openai(system_prompt, prompt)
            elif self.provider == "ollama":
                commentary = self._generate_with_ollama(system_prompt, prompt)
            else:
                return None
            
            return commentary
            
        except Exception as e:
            print(f"Error generating coach commentary: {e}")
            return None
    
    def _generate_with_openai(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Generate commentary using OpenAI API"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=150,
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI API error: {e}")
            return None
    
    def _generate_with_ollama(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Generate commentary using Ollama (local LLM)"""
        try:
            # Combine system and user prompts for Ollama
            full_prompt = f"{system_prompt}\n\n{user_prompt}"
            
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 150
                    }
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip()
            else:
                print(f"Ollama error: {response.status_code} - {response.text}")
                return None
                
        except requests.exceptions.ConnectionError:
            print("Cannot connect to Ollama. Make sure it's running: ollama serve")
            return None
        except Exception as e:
            print(f"Ollama error: {e}")
            return None
    
    def _build_coaching_prompt(
        self,
        move_san: str,
        classification: str,
        centipawn_loss: float,
        fen_before: str,
        best_move_san: Optional[str],
        game_phase: str,
        user_color: str
    ) -> str:
        """Build the prompt for the AI coach"""
        
        best_move_text = f"The best move was {best_move_san}." if best_move_san else ""
        
        prompt = f"""You are analyzing a chess position where the player (playing {user_color}) made a {classification}.

Position (FEN): {fen_before}
Move played: {move_san}
Classification: {classification}
Centipawn loss: {centipawn_loss:.1f}
Game phase: {game_phase}
{best_move_text}

Provide brief, educational coaching feedback (1-2 sentences) explaining:
1. Why this move was a {classification}
2. What the player should have considered instead

Be constructive and focus on learning."""
        
        return prompt
    
    def generate_game_summary(
        self,
        total_moves: int,
        blunders: int,
        mistakes: int,
        inaccuracies: int,
        accuracy: Optional[float],
        result: str,
        opening_name: str
    ) -> Optional[str]:
        """
        Generate an overall game summary commentary
        
        Args:
            total_moves: Total number of moves in the game
            blunders: Number of blunders
            mistakes: Number of mistakes
            inaccuracies: Number of inaccuracies
            accuracy: Overall accuracy percentage
            result: Game result (win/loss/draw)
            opening_name: Name of the opening played
            
        Returns:
            Game summary commentary or None if generation fails
        """
        if not self.is_enabled():
            return None
        
        try:
            accuracy_str = f"{accuracy:.1f}%" if accuracy else "N/A"
            
            prompt = f"""Provide a brief game summary for a chess game:

Opening: {opening_name}
Result: {result}
Total moves: {total_moves}
Accuracy: {accuracy_str}
Errors: {blunders} blunders, {mistakes} mistakes, {inaccuracies} inaccuracies

Give 2-3 sentences of constructive feedback focusing on:
1. Overall performance assessment
2. Key areas for improvement
3. Positive aspects (if any)

Be encouraging and specific."""
            
            system_prompt = "You are a supportive chess coach providing game summaries. Be constructive, specific, and encouraging."
            
            # Generate summary based on provider
            if self.provider == "openai":
                return self._generate_with_openai(system_prompt, prompt)
            elif self.provider == "ollama":
                return self._generate_with_ollama(system_prompt, prompt)
            else:
                return None
            
        except Exception as e:
            print(f"Error generating game summary: {e}")
            return None

