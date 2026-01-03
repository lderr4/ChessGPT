restart:
	docker compose down
	docker compose build
	docker compose up -d

reset-analysis-job:
	docker compose exec psql -U chess_user -d chess_analytics -c "SELECT id, user_id, status, progress, analyzed_games, total_games FROM analysis_jobs;"

run-performance-tests:
	docker exec -it chess_analytics_backend python run_performance_tests.py

run-validation-tests:
	docker exec -it chess_analytics_backend sh -c "PYTHONPATH=/app pytest tests/test_analysis_service_validation.py -v -s -p no:conftest"

clear-analyses:
	docker exec -it chess_analytics_api python -m scripts.clear_analyses
clear-user-games:
	docker exec -it chess_analytics_api python -m scripts.delete_user_games lderr4