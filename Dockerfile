# --- Stage 1: Build the React Frontend Dashboard ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# --- Stage 2: Build the Python Backend and Final Package ---
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies list and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and config templates
COPY osmosisdb/ ./osmosisdb/
COPY pyproject.toml ./
COPY config.example.toml ./config.toml

# Copy built frontend static files to the backend app serving location
COPY --from=frontend-builder /app/dashboard/dist ./dashboard/dist

# Expose proxy port (6432) and dashboard/API port (8080)
EXPOSE 6432 8080

# Environment variables defaults
ENV OSMOSIS_DASHBOARD__HOST=0.0.0.0
ENV OSMOSIS_DASHBOARD__PORT=8080
ENV OSMOSIS_PROXY__LISTEN_HOST=0.0.0.0
ENV OSMOSIS_PROXY__LISTEN_PORT=6432

# Run the middleware entrypoint command
ENTRYPOINT ["python", "-m", "osmosisdb.cli", "start"]
