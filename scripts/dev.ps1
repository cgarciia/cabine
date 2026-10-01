# Sobe Postgres, a API unica (:8000) e os dois fronts.
# MVP 1 em https://127.0.0.1:5173, MVP 2 em https://127.0.0.1:5174.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Core = Join-Path $Root "cabine-core"
$Web = Join-Path $Root "cabine-web"

function Test-Listening([int] $Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn
}

Write-Host "Postgres..."
docker compose -f (Join-Path $Core "docker-compose.yml") up -d

if (Test-Listening 8000) {
    Write-Host "API ja escuta na porta 8000"
} else {
    $python = Join-Path $Core ".venv\Scripts\python.exe"
    if (Test-Path $python) {
        Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $Core
    } else {
        $uv = Get-Command uv -ErrorAction SilentlyContinue
        if (-not $uv) { throw "Rode 'uv sync' em cabine-core antes do make dev." }
        Start-Process -FilePath $uv.Source -ArgumentList "run", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $Core
    }
    Write-Host "API iniciando em http://127.0.0.1:8000"
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = "C:\Program Files\nodejs\npm.cmd" }

function Start-Web([string] $Mode, [int] $Port) {
    if (Test-Listening $Port) {
        Write-Host "Frontend $Mode ja escuta na porta $Port"
        return
    }
    Start-Process -FilePath $npm -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "$Port", "--mode", $Mode -WorkingDirectory $Web
    Write-Host "MVP $Mode iniciando na porta $Port"
}

Start-Web "mvp1" 5173
Start-Web "mvp2" 5174

Write-Host ""
Write-Host "MVP 1  https://127.0.0.1:5173"
Write-Host "MVP 2  https://127.0.0.1:5174"
Write-Host "API    http://127.0.0.1:8000/health"
