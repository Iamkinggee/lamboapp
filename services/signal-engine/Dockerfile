# # ============================================================
# # FILE: services/signal-engine/Dockerfile
# # PURPOSE: Container for the Python SMC signal engine
# # ============================================================

# FROM python:3.11-slim

# WORKDIR /app

# # Install dependencies first (cached layer)
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt

# COPY . .

# CMD ["python", "main.py"]







# FILE: services/signal-engine/Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

CMD ["python", "main.py"]