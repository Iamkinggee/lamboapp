# FILE: services/ai-assistant/Dockerfile
# ─────────────────────────────────────────────────────────────
# FIX 1: Added curl for Docker healthcheck (was missing — caused silent failure)
# FIX 2: Port corrected to 8001 to match docker-compose healthcheck + api-server
# ─────────────────────────────────────────────────────────────

FROM python:3.11-slim

WORKDIR /app

# Install curl — required by Docker healthcheck: ["CMD", "curl", "-f", "http://localhost:8001/health"]
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

# Must match the port in docker-compose healthcheck and CMD below
EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]