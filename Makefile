.PHONY: dev

# API em :8000 (todos os módulos) e os dois totens: :5173 (MVP 1) e :5174 (MVP 2).
dev:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
