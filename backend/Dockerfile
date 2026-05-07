# Use Python 3.10 slim for smaller image size
FROM python:3.10-slim

# Install system dependencies for OpenCV and MediaPipe
RUN apt-get update && apt-get install -y \
    libgl1 \
    libgles2 \
    libglib2.0-0 \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Expose the port (Render/Heroku usually provide PORT env var)
EXPOSE 8000

# Start the server
CMD ["python", "server.py"]
