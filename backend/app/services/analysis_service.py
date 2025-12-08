import chess
import chess.pgn
import chess.engine
import asyncio
from io import StringIO
from typing import List, Dict, Optional, Tuple
from ..config import settings
from .coach_service import CoachService


class AnalysisService:
    """Service for analyzing chess games with Stockfish"""
    
    def __init__(self):
        self.stockfish_path = settings.STOCKFISH_PATH
        self.depth = settings.STOCKFISH_DEPTH
        self.time_limit = settings.STOCKFISH_TIME_LIMIT
        self.coach_service = CoachService()
    
    def parse_pgn(self, pgn_string: str) -> Optional[chess.pgn.Game]:
        """Parse a PGN string into a chess.pgn.Game object"""
        try:
            pgn_io = StringIO(pgn_string)
            game = chess.pgn.read_game(pgn_io)
            return game
        except Exception as e:
            print(f"Error parsing PGN: {e}")
            return None
    
    def classify_move(self, cp_loss: float, eval_before: Optional[float] = None, eval_after: Optional[float] = None) -> str:
        """
        Classify a move based on centipawn loss AND position evaluation
        
        A blunder should be a move that turns a good position into a losing one,
        not just any move with high centipawn loss.
        """
        if cp_loss is None:
            return "book"
        
        abs_loss = abs(cp_loss)
        
        # Perfect or near-perfect moves
        if abs_loss <= 10:
            return "best"
        elif abs_loss <= 25:
            return "excellent"
        elif abs_loss <= 50:
            return "good"
        
        # For mistakes and blunders, consider the position evaluation
        # Convert centipawns to pawns for easier reasoning
        eval_before_pawns = (eval_before / 100) if eval_before else 0
        eval_after_pawns = (eval_after / 100) if eval_after else 0
        
        # A BLUNDER is a move that:
        # 1. Turns a winning position (>+1.5) into a losing position (<-1.5) OR
        # 2. Turns an equal position into a losing position (<-2.0) OR
        # 3. Loses massive material/advantage (>300 CP) from any position
        if eval_before is not None and eval_after is not None:
            # Check if position went from winning to losing
            if eval_before_pawns > 1.5 and eval_after_pawns < -1.5:
                return "blunder"
            
            # Check if position went from equal/slightly better to clearly losing
            if abs(eval_before_pawns) < 0.5 and eval_after_pawns < -2.0:
                return "blunder"
            
            # Check if position went from slightly better to clearly losing
            if 0.5 <= eval_before_pawns <= 1.5 and eval_after_pawns < -2.0:
                return "blunder"
        
        # Massive centipawn loss is always a blunder (losing a piece without compensation)
        if abs_loss >= 300:
            return "blunder"
        
        # A MISTAKE is a move that:
        # 1. Significantly worsens the position (150-300 CP) OR
        # 2. Turns advantage into equality or slight disadvantage
        if eval_before is not None and eval_after is not None:
            # Turn advantage into equality or worse
            if eval_before_pawns > 2.0 and -0.5 <= eval_after_pawns <= 0.5:
                return "mistake"
            
            # Turn winning into only slightly better
            if eval_before_pawns > 2.5 and 0.5 < eval_after_pawns < 1.5:
                return "mistake"
        
        # Moderate centipawn loss
        if 150 <= abs_loss < 300:
            return "mistake"
        
        # An INACCURACY is missing the best move but maintaining a solid position
        if 50 < abs_loss < 150:
            # If position is still good after the move, it's just an inaccuracy
            if eval_after is not None and eval_after_pawns > -1.0:
                return "inaccuracy"
            # If position became clearly worse, it's a mistake
            else:
                return "mistake"
        
        return "good"
    
    def get_evaluation_cp(self, info: Dict) -> Optional[float]:
        """Extract centipawn evaluation from engine info"""
        score = info.get("score")
        if not score:
            return None
        
        # Get the score relative to the current player (POV score)
        # In python-chess 1.x, use .relative instead of .score()
        if score.is_mate():
            # Mate score: use large values
            mate_in = score.relative.mate()
            if mate_in > 0:
                return 10000 - mate_in * 100
            else:
                return -10000 - mate_in * 100
        else:
            # Use .relative to get the score from current player's perspective
            cp = score.relative.cp
            return float(cp) if cp is not None else None
    
    async def analyze_game(self, pgn_string: str, user_color: str) -> Dict:
        """
        Analyze a complete game and return move-by-move analysis
        
        Returns:
            Dict with keys:
                - moves: List of move analysis
                - stats: Overall game stats
        """
        game = self.parse_pgn(pgn_string)
        if not game:
            return {"error": "Failed to parse PGN"}
        
        board = game.board()
        moves_analysis = []
        
        # Track statistics
        total_cp_loss = 0
        num_analyzed_moves = 0
        blunders = 0
        mistakes = 0
        inaccuracies = 0
        coach_commentary_count = 0  # Limit coach commentaries to avoid long analysis times
        max_coach_commentaries = 5  # Maximum 5 coach insights per game
        
        # Determine if we should analyze this move (only user's moves)
        is_user_white = user_color == "white"
        
        try:
            transport, engine = await chess.engine.popen_uci(self.stockfish_path)
            
            move_number = 1
            half_move = 0
            
            # Build list of all moves first
            all_moves = []
            temp_board = game.board()
            for node in game.mainline():
                move = node.move
                is_white = temp_board.turn == chess.WHITE
                san = temp_board.san(move)
                all_moves.append({
                    'move': move,
                    'is_white': is_white,
                    'san': san
                })
                temp_board.push(move)
            
            # Now analyze each move
            board.reset()
            for idx, move_info in enumerate(all_moves):
                move = move_info['move']
                is_white_move = move_info['is_white']
                move_san = move_info['san']
                
                # Get evaluation before the move
                try:
                    info_before = await engine.analyse(
                        board,
                        chess.engine.Limit(depth=self.depth, time=self.time_limit)
                    )
                    eval_before = self.get_evaluation_cp(info_before)
                except Exception as e:
                    print(f"Error evaluating position: {e}")
                    eval_before = None
                
                # Get best move
                try:
                    info_best = await engine.analyse(
                        board,
                        chess.engine.Limit(depth=self.depth, time=self.time_limit)
                    )
                    best_move = info_best.get("pv", [None])[0]
                except:
                    best_move = None
                
                # Make the move
                board.push(move)
                
                # Get evaluation after the move
                try:
                    info_after = await engine.analyse(
                        board,
                        chess.engine.Limit(depth=self.depth, time=self.time_limit)
                    )
                    eval_after = self.get_evaluation_cp(info_after)
                except Exception as e:
                    print(f"Error evaluating position after move: {e}")
                    eval_after = None
                
                # Calculate centipawn loss
                cp_loss = None
                eval_before_for_classification = eval_before
                eval_after_for_classification = eval_after
                
                if eval_before is not None and eval_after is not None:
                    # Flip evaluation based on whose turn it was
                    if not is_white_move:
                        eval_before = -eval_before
                        eval_after = -eval_after
                    
                    cp_loss = eval_before - eval_after
                    
                    # Only count user's moves in statistics
                    should_analyze = (is_white_move and is_user_white) or (not is_white_move and not is_user_white)
                    
                    if should_analyze and cp_loss is not None:
                        total_cp_loss += max(0, cp_loss)  # Only count losses
                        num_analyzed_moves += 1
                
                # Classify the move using ORIGINAL evaluations (from current player's perspective)
                # For black moves, we need to flip the evaluations for classification
                if not is_white_move and eval_before_for_classification is not None:
                    eval_before_for_classification = -eval_before_for_classification
                    eval_after_for_classification = -eval_after_for_classification
                
                classification = self.classify_move(cp_loss, eval_before_for_classification, eval_after_for_classification)
                
                # Count errors (only for user's moves)
                should_analyze = (is_white_move and is_user_white) or (not is_white_move and not is_user_white)
                if should_analyze:
                    if classification == "blunder":
                        blunders += 1
                    elif classification == "mistake":
                        mistakes += 1
                    elif classification == "inaccuracy":
                        inaccuracies += 1
                
                # Generate coach commentary for user's clear mistakes and blunders only
                # Limit to max_coach_commentaries to prevent long analysis times
                coach_commentary = None
                if should_analyze and classification in ["blunder", "mistake"] and coach_commentary_count < max_coach_commentaries:
                    try:
                        # Determine game phase
                        phase = "opening" if half_move < 20 else ("endgame" if half_move > len(all_moves) * 0.7 else "middlegame")
                        
                        # Get FEN before the move (we need to rewind one move)
                        temp_board = chess.Board()
                        for i in range(half_move):
                            temp_board.push(all_moves[i]['move'])
                        fen_before = temp_board.fen()
                        
                        # Get best move in SAN
                        best_move_san = None
                        if best_move:
                            best_move_san = temp_board.san(best_move)
                        
                        # Generate commentary with timeout protection
                        try:
                            coach_commentary = await asyncio.wait_for(
                                self.coach_service.generate_move_commentary(
                                    move_san=move_san,
                                    classification=classification,
                                    centipawn_loss=cp_loss if cp_loss else 0,
                                    fen_before=fen_before,
                                    fen_after=board.fen(),
                                    best_move_san=best_move_san,
                                    game_phase=phase,
                                    user_color=user_color
                                ),
                                timeout=25.0  # 25 second timeout for coach commentary
                            )
                        except asyncio.TimeoutError:
                            print(f"Coach commentary generation timed out for move {move_san}. Continuing analysis without commentary.")
                            coach_commentary = None
                        
                        # Increment counter if commentary was generated
                        if coach_commentary:
                            coach_commentary_count += 1
                    except Exception as e:
                        print(f"Error generating coach commentary: {e}")
                        coach_commentary = None
                
                # Store move analysis
                moves_analysis.append({
                    "move_number": move_number,
                    "is_white": is_white_move,
                    "half_move": half_move,
                    "move_san": move_san,
                    "move_uci": move.uci(),
                    "evaluation_before": eval_before,
                    "evaluation_after": -eval_after if eval_after is not None else None,  # Flip for next player
                    "best_move_uci": best_move.uci() if best_move else None,
                    "classification": classification,
                    "centipawn_loss": cp_loss,
                    "coach_commentary": coach_commentary,
                })
                
                if not is_white_move:
                    move_number += 1
                
                half_move += 1
            
            await engine.quit()
            
            # Calculate overall statistics
            avg_cp_loss = total_cp_loss / num_analyzed_moves if num_analyzed_moves > 0 else None
            
            # Calculate accuracy (simplified formula)
            # Accuracy = max(0, 100 - average_cp_loss / 10)
            accuracy = None
            if avg_cp_loss is not None:
                accuracy = max(0, min(100, 100 - avg_cp_loss / 10))
            
            return {
                "moves": moves_analysis,
                "stats": {
                    "num_moves": len(moves_analysis),
                    "average_centipawn_loss": avg_cp_loss,
                    "accuracy": accuracy,
                    "num_blunders": blunders,
                    "num_mistakes": mistakes,
                    "num_inaccuracies": inaccuracies,
                }
            }
            
        except Exception as e:
            print(f"Error during analysis: {e}")
            return {"error": str(e)}
    
    def detect_opening(self, pgn_string: str) -> Tuple[Optional[str], Optional[str], int]:
        """
        Detect the opening from a PGN
        
        Returns:
            Tuple of (eco_code, opening_name, ply)
        """
        game = self.parse_pgn(pgn_string)
        if not game:
            return None, None, 0
        
        eco_code = game.headers.get("ECO")
        opening_name = game.headers.get("Opening")
        
        # Count opening moves (typically first 10-15 moves or until out of book)
        board = game.board()
        ply = 0
        for node in game.mainline():
            ply += 1
            if ply > 20:  # Assume opening is over after 20 ply
                break
        
        return eco_code, opening_name, min(ply, 20)
    
    async def analyze_position(self, fen: str) -> Dict:
        """
        Analyze a single chess position
        
        Args:
            fen: FEN string of the position to analyze
            
        Returns:
            Dict with keys:
                - evaluation: Centipawn evaluation (or None)
                - best_move: Best move in UCI format
                - best_move_san: Best move in SAN format
                - mate_in: Moves until mate (if applicable)
        """
        try:
            board = chess.Board(fen)
        except Exception as e:
            print(f"Invalid FEN: {e}")
            return {"error": "Invalid FEN string"}
        
        try:
            transport, engine = await chess.engine.popen_uci(self.stockfish_path)
            
            # Analyze the position
            info = await engine.analyse(
                board,
                chess.engine.Limit(depth=self.depth, time=self.time_limit)
            )
            
            # Extract evaluation
            score = info.get("score")
            evaluation = None
            mate_in = None
            
            if score:
                if score.is_mate():
                    mate_in = score.relative.mate()
                    # Use large values for mate
                    if mate_in > 0:
                        evaluation = 10000 - mate_in * 100
                    else:
                        evaluation = -10000 - mate_in * 100
                else:
                    cp = score.relative.cp
                    evaluation = float(cp) if cp is not None else None
            
            # Get best move
            best_move_uci = None
            best_move_san = None
            pv = info.get("pv", [])
            if pv and len(pv) > 0:
                best_move = pv[0]
                best_move_uci = best_move.uci()
                best_move_san = board.san(best_move)
            
            await engine.quit()
            
            return {
                "evaluation": evaluation,
                "best_move": best_move_uci,
                "best_move_san": best_move_san,
                "mate_in": mate_in,
            }
            
        except Exception as e:
            print(f"Error analyzing position: {e}")
            return {"error": str(e)}
