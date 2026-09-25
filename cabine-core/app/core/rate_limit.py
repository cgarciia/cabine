import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

# In-process sliding window: the kiosk runs a single uvicorn worker.
# Only failures are counted — every kiosk login shares the totem IP.
_failures: dict[str, deque[float]] = defaultdict(deque)


def _keys(request: Request, scope: str, subject: str) -> list[tuple[str, int]]:
    ip = request.client.host if request.client else "unknown"
    keys = [(f"{scope}:ip:{ip}", settings.LOGIN_MAX_FAILURES_PER_IP)]
    if subject:
        keys.append((f"{scope}:subject:{subject.strip().lower()}", settings.LOGIN_MAX_FAILURES_PER_SUBJECT))
    return keys


def _prune(hits: deque[float], now: float) -> None:
    while hits and now - hits[0] > settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS:
        hits.popleft()


def check_login_rate_limit(request: Request, scope: str, subject: str = "") -> None:
    now = time.monotonic()
    for key, limit in _keys(request, scope, subject):
        hits = _failures[key]
        _prune(hits, now)
        if len(hits) >= limit:
            retry = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS - (now - hits[0])
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Muitas tentativas. Aguarde alguns minutos e tente novamente.",
                headers={"Retry-After": str(int(retry) + 1)},
            )


def record_login_failure(request: Request, scope: str, subject: str = "") -> None:
    now = time.monotonic()
    for key, _limit in _keys(request, scope, subject):
        _failures[key].append(now)
