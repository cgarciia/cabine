db-up:
	docker compose up -d

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d
	powershell -NoProfile -Command "for ($$i=0; $$i -lt 40; $$i++) { docker exec cabine_postgres pg_isready -U admin; if ($$LASTEXITCODE -eq 0) { exit 0 }; Start-Sleep -Seconds 1 }; Write-Error 'postgres not ready'; exit 1"
	uv run alembic upgrade head

run:
	uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

m ?= "autogenerate"
makemigrations:
	uv run alembic revision --autogenerate -m "$(m)"

migrate:
	uv run alembic upgrade head
