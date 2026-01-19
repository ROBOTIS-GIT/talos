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

# Copy system_manager package
COPY system_manager/ ./system_manager/
COPY config.yml ./config.yml

# Expose API port
EXPOSE 8081

# Run the system_manager API
CMD ["uvicorn", "system_manager.api:app", "--host", "0.0.0.0", "--port", "8081"]

