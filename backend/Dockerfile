FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY alembic.ini .
COPY alembic/ ./alembic/
COPY app/ ./app/
COPY docker-entrypoint.sh .

RUN pip install --no-cache-dir -e ".[dev]" && chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
