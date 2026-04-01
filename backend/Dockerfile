FROM python:3.12-slim

# Install system dependencies for Playwright + Xvfb + audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    xauth \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    wget \
    curl \
    ca-certificates \
    ffmpeg \
    pulseaudio \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (Chromium only)
RUN playwright install chromium && playwright install-deps chromium

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 scribe && chown -R scribe:scribe /app
USER scribe

EXPOSE 8000

# Start with Xvfb wrapper for headless browser support
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -ac & export DISPLAY=:99 && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
