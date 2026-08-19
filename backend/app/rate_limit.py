import time
from collections import defaultdict

from fastapi import HTTPException, Request

_buckets: dict[str, list[float]] = defaultdict(list)


class RateLimitExceeded(Exception):
    pass


def check_rate_limit(key: str, max_requests: int, window_seconds: int, now: float | None = None) -> None:
    if now is None:
        now = time.monotonic()
    cutoff = now - window_seconds
    timestamps = [t for t in _buckets[key] if t > cutoff]
    if len(timestamps) >= max_requests:
        _buckets[key] = timestamps
        raise RateLimitExceeded(key)
    timestamps.append(now)
    _buckets[key] = timestamps


def rate_limiter(name: str, max_requests: int, window_seconds: int):
    def _dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        try:
            check_rate_limit(f"{name}:{client_ip}", max_requests, window_seconds)
        except RateLimitExceeded:
            raise HTTPException(429, "Too many requests, try again later.")
    return _dependency
