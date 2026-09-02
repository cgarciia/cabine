db-up:
	docker compose up -d

db-down:
	docker compose down

run:
	uv run uvicorn app.main:app --reload --port 8000

m ?= "autogenerate"
makemigrations:
	uv run alembic revision --autogenerate -m "$(m)"

migrate:
	uv run alembic upgrade head