FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy talos package
COPY talos/ ./talos/
COPY config.yml ./config.yml

# Expose API port
EXPOSE 8081

# Run the talos API
CMD ["uvicorn", "talos.api:app", "--host", "0.0.0.0", "--port", "8081"]

