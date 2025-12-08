from sqlalchemy.orm import Session
from sqlalchemy import func, extract, case
from typing import List, Dict
from datetime import datetime
from ..models import Game, User, UserStats, Move


class StatsService:
    """Service for calculating user statistics"""
    
    @staticmethod
    def calculate_user_stats(db: Session, user_id: int) -> Dict:
        """Calculate and update user statistics"""
        
        # Total game counts
        total_games = db.query(Game).filter(Game.user_id == user_id).count()
        total_wins = db.query(Game).filter(
            Game.user_id == user_id, Game.result == "win"
        ).count()
        total_losses = db.query(Game).filter(
            Game.user_id == user_id, Game.result == "loss"
        ).count()
        total_draws = db.query(Game).filter(
            Game.user_id == user_id, Game.result == "draw"
        ).count()
        
        # By color
        white_games = db.query(Game).filter(
            Game.user_id == user_id, Game.user_color == "white"
        ).count()
        white_wins = db.query(Game).filter(
            Game.user_id == user_id, Game.user_color == "white", Game.result == "win"
        ).count()
        
        black_games = db.query(Game).filter(
            Game.user_id == user_id, Game.user_color == "black"
        ).count()
        black_wins = db.query(Game).filter(
            Game.user_id == user_id, Game.user_color == "black", Game.result == "win"
        ).count()
        
        # Analysis stats (only for analyzed games)
        analyzed_games = db.query(Game).filter(
            Game.user_id == user_id, Game.is_analyzed == True
        )
        
        avg_accuracy = analyzed_games.with_entities(
            func.avg(Game.accuracy)
        ).scalar()
        
        avg_cp_loss = analyzed_games.with_entities(
            func.avg(Game.average_centipawn_loss)
        ).scalar()
        
        total_blunders = analyzed_games.with_entities(
            func.sum(Game.num_blunders)
        ).scalar() or 0
        
        total_mistakes = analyzed_games.with_entities(
            func.sum(Game.num_mistakes)
        ).scalar() or 0
        
        total_inaccuracies = analyzed_games.with_entities(
            func.sum(Game.num_inaccuracies)
        ).scalar() or 0
        
        # Update or create UserStats
        user_stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        
        stats_data = {
            "total_games": total_games,
            "total_wins": total_wins,
            "total_losses": total_losses,
            "total_draws": total_draws,
            "white_games": white_games,
            "white_wins": white_wins,
            "black_games": black_games,
            "black_wins": black_wins,
            "avg_accuracy": float(avg_accuracy) if avg_accuracy else None,
            "avg_centipawn_loss": float(avg_cp_loss) if avg_cp_loss else None,
            "total_blunders": int(total_blunders),
            "total_mistakes": int(total_mistakes),
            "total_inaccuracies": int(total_inaccuracies),
            "updated_at": datetime.utcnow(),
        }
        
        if user_stats:
            for key, value in stats_data.items():
                setattr(user_stats, key, value)
        else:
            user_stats = UserStats(user_id=user_id, **stats_data)
            db.add(user_stats)
        
        db.commit()
        db.refresh(user_stats)
        
        return stats_data
    
    @staticmethod
    def get_opening_stats(db: Session, user_id: int, limit: int = 10) -> List[Dict]:
        """Get statistics by opening"""
        
        results = db.query(
            Game.opening_eco,
            Game.opening_name,
            func.count(Game.id).label("games_played"),
            func.sum(case((Game.result == "win", 1), else_=0)).label("wins"),
            func.sum(case((Game.result == "loss", 1), else_=0)).label("losses"),
            func.sum(case((Game.result == "draw", 1), else_=0)).label("draws"),
            func.avg(Game.accuracy).label("avg_accuracy"),
        ).filter(
            Game.user_id == user_id,
            Game.opening_eco.isnot(None)
        ).group_by(
            Game.opening_eco, Game.opening_name
        ).order_by(
            func.count(Game.id).desc()
        ).limit(limit).all()
        
        opening_stats = []
        for row in results:
            games = row.games_played
            wins = row.wins or 0
            win_rate = (wins / games * 100) if games > 0 else 0
            
            opening_stats.append({
                "opening_eco": row.opening_eco,
                "opening_name": row.opening_name or "Unknown",
                "games_played": games,
                "wins": wins,
                "losses": row.losses or 0,
                "draws": row.draws or 0,
                "win_rate": round(win_rate, 2),
                "avg_accuracy": round(row.avg_accuracy, 2) if row.avg_accuracy else None,
            })
        
        return opening_stats
    
    @staticmethod
    def get_time_control_stats(db: Session, user_id: int) -> List[Dict]:
        """Get statistics by time control"""
        
        results = db.query(
            Game.time_class,
            func.count(Game.id).label("games_played"),
            func.sum(case((Game.result == "win", 1), else_=0)).label("wins"),
            func.sum(case((Game.result == "loss", 1), else_=0)).label("losses"),
            func.sum(case((Game.result == "draw", 1), else_=0)).label("draws"),
        ).filter(
            Game.user_id == user_id,
            Game.time_class.isnot(None)
        ).group_by(
            Game.time_class
        ).order_by(
            func.count(Game.id).desc()
        ).all()
        
        time_control_stats = []
        for row in results:
            games = row.games_played
            wins = row.wins or 0
            win_rate = (wins / games * 100) if games > 0 else 0
            
            time_control_stats.append({
                "time_class": row.time_class,
                "games_played": games,
                "wins": wins,
                "losses": row.losses or 0,
                "draws": row.draws or 0,
                "win_rate": round(win_rate, 2),
            })
        
        return time_control_stats
    
    @staticmethod
    def get_performance_over_time(db: Session, user_id: int, months: int = 12) -> List[Dict]:
        """Get performance statistics over time (monthly)"""
        
        results = db.query(
            func.to_char(Game.date_played, 'YYYY-MM').label("month"),
            func.count(Game.id).label("games"),
            func.sum(case((Game.result == "win", 1), else_=0)).label("wins"),
            func.sum(case((Game.result == "loss", 1), else_=0)).label("losses"),
            func.sum(case((Game.result == "draw", 1), else_=0)).label("draws"),
            func.avg(Game.accuracy).label("avg_accuracy"),
        ).filter(
            Game.user_id == user_id
        ).group_by(
            "month"
        ).order_by(
            "month"
        ).limit(months).all()
        
        performance = []
        for row in results:
            games = row.games
            wins = row.wins or 0
            win_rate = (wins / games * 100) if games > 0 else 0
            
            performance.append({
                "date": row.month,
                "games": games,
                "wins": wins,
                "losses": row.losses or 0,
                "draws": row.draws or 0,
                "win_rate": round(win_rate, 2),
                "avg_accuracy": round(row.avg_accuracy, 2) if row.avg_accuracy else None,
            })
        
        return performance
    
    @staticmethod
    def get_rating_over_time(db: Session, user_id: int, limit: int = 50) -> List[Dict]:
        """Get rating progression over time"""
        
        games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.user_rating.isnot(None)
        ).order_by(
            Game.date_played.asc()
        ).limit(limit).all()
        
        rating_data = []
        for game in games:
            rating_data.append({
                "date": game.date_played.strftime("%Y-%m-%d"),
                "rating": game.user_rating,
                "result": game.result,
            })
        
        return rating_data
    
    @staticmethod
    def get_error_analysis_by_phase(db: Session, user_id: int) -> List[Dict]:
        """Get error distribution by game phase (opening/middlegame/endgame)"""
        
        # Get all analyzed games for the user
        games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.is_analyzed == True
        ).all()
        
        phase_stats = {
            'opening': {'blunders': 0, 'mistakes': 0, 'inaccuracies': 0, 'total_moves': 0},
            'middlegame': {'blunders': 0, 'mistakes': 0, 'inaccuracies': 0, 'total_moves': 0},
            'endgame': {'blunders': 0, 'mistakes': 0, 'inaccuracies': 0, 'total_moves': 0}
        }
        
        for game in games:
            moves = db.query(Move).filter(Move.game_id == game.id).all()
            total_moves = len(moves)
            
            for i, move in enumerate(moves):
                # Determine phase
                if i < 20:  # First 10 full moves (20 ply)
                    phase = 'opening'
                elif i < total_moves * 0.7:
                    phase = 'middlegame'
                else:
                    phase = 'endgame'
                
                phase_stats[phase]['total_moves'] += 1
                
                if move.classification == 'blunder':
                    phase_stats[phase]['blunders'] += 1
                elif move.classification == 'mistake':
                    phase_stats[phase]['mistakes'] += 1
                elif move.classification == 'inaccuracy':
                    phase_stats[phase]['inaccuracies'] += 1
        
        # Convert to list format
        result = []
        for phase, stats in phase_stats.items():
            total_errors = stats['blunders'] + stats['mistakes'] + stats['inaccuracies']
            error_rate = (total_errors / stats['total_moves'] * 100) if stats['total_moves'] > 0 else 0
            
            result.append({
                'phase': phase.capitalize(),
                'blunders': stats['blunders'],
                'mistakes': stats['mistakes'],
                'inaccuracies': stats['inaccuracies'],
                'total_errors': total_errors,
                'total_moves': stats['total_moves'],
                'error_rate': round(error_rate, 2)
            })
        
        return result
    
    @staticmethod
    def get_win_loss_error_correlation(db: Session, user_id: int) -> Dict:
        """Analyze correlation between errors and game outcomes"""
        
        win_games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.is_analyzed == True,
            Game.result == "win"
        ).all()
        
        loss_games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.is_analyzed == True,
            Game.result == "loss"
        ).all()
        
        def calc_avg_errors(games):
            if not games:
                return {'blunders': 0, 'mistakes': 0, 'inaccuracies': 0, 'accuracy': 0}
            
            total_blunders = sum(g.num_blunders for g in games)
            total_mistakes = sum(g.num_mistakes for g in games)
            total_inaccuracies = sum(g.num_inaccuracies for g in games)
            avg_accuracy = sum(g.accuracy for g in games if g.accuracy) / len([g for g in games if g.accuracy]) if any(g.accuracy for g in games) else 0
            
            return {
                'blunders': round(total_blunders / len(games), 2),
                'mistakes': round(total_mistakes / len(games), 2),
                'inaccuracies': round(total_inaccuracies / len(games), 2),
                'accuracy': round(avg_accuracy, 2)
            }
        
        return {
            'wins': calc_avg_errors(win_games),
            'losses': calc_avg_errors(loss_games),
            'win_game_count': len(win_games),
            'loss_game_count': len(loss_games)
        }
    
    @staticmethod
    def get_performance_by_phase(db: Session, user_id: int) -> List[Dict]:
        """Get win rate and accuracy by game phase"""
        
        games = db.query(Game).filter(
            Game.user_id == user_id,
            Game.is_analyzed == True
        ).all()
        
        phase_performance = {
            'opening': {'wins': 0, 'losses': 0, 'draws': 0, 'accuracy_sum': 0, 'accuracy_count': 0},
            'middlegame': {'wins': 0, 'losses': 0, 'draws': 0, 'accuracy_sum': 0, 'accuracy_count': 0},
            'endgame': {'wins': 0, 'losses': 0, 'draws': 0, 'accuracy_sum': 0, 'accuracy_count': 0}
        }
        
        # Classify games by where they ended
        for game in games:
            moves = db.query(Move).filter(Move.game_id == game.id).count()
            
            # Determine which phase the game ended in
            if moves < 20:
                phase = 'opening'
            elif moves < 40:
                phase = 'middlegame'
            else:
                phase = 'endgame'
            
            if game.result == 'win':
                phase_performance[phase]['wins'] += 1
            elif game.result == 'loss':
                phase_performance[phase]['losses'] += 1
            else:
                phase_performance[phase]['draws'] += 1
            
            if game.accuracy:
                phase_performance[phase]['accuracy_sum'] += game.accuracy
                phase_performance[phase]['accuracy_count'] += 1
        
        result = []
        for phase, stats in phase_performance.items():
            total_games = stats['wins'] + stats['losses'] + stats['draws']
            win_rate = (stats['wins'] / total_games * 100) if total_games > 0 else 0
            avg_accuracy = (stats['accuracy_sum'] / stats['accuracy_count']) if stats['accuracy_count'] > 0 else 0
            
            result.append({
                'phase': phase.capitalize(),
                'wins': stats['wins'],
                'losses': stats['losses'],
                'draws': stats['draws'],
                'total_games': total_games,
                'win_rate': round(win_rate, 2),
                'avg_accuracy': round(avg_accuracy, 2)
            })
        
        return result
    
    @staticmethod
    def get_dashboard_data(db: Session, user_id: int) -> Dict:
        """Get all data needed for the dashboard"""
        
        # Get or calculate user stats
        user_stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        if not user_stats:
            StatsService.calculate_user_stats(db, user_id)
            user_stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        
        # Recent games
        recent_games = db.query(Game).filter(
            Game.user_id == user_id
        ).order_by(
            Game.date_played.desc()
        ).limit(10).all()
        
        # Opening stats
        opening_stats = StatsService.get_opening_stats(db, user_id, limit=5)
        
        # Time control stats
        time_control_stats = StatsService.get_time_control_stats(db, user_id)
        
        # Performance over time
        performance = StatsService.get_performance_over_time(db, user_id, months=12)
        
        return {
            "user_stats": user_stats,
            "recent_games": recent_games,
            "opening_stats": opening_stats,
            "time_control_stats": time_control_stats,
            "performance_over_time": performance,
        }

