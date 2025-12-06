restart:
	docker compose down
	docker compose build
	docker compose up -d
	docker compose logs -f

reset-analysis-job:
	docker compose exec psql -U chess_user -d chess_analytics -c "SELECT id, user_id, status, progress, analyzed_games, total_games FROM analysis_jobs;"