# CODE_JSS - AuraShield Project

This project is split into a **Frontend** and **Backend** for easier deployment.

## Project Structure

- `/frontend`: React + Vite application.
- `/backend`: FastAPI server with gesture and voice authentication.

## Deployment Instructions

### 1. Backend Deployment (FastAPI)
The backend is a Python application. You can deploy it to platforms like **Render**, **Heroku**, or **DigitalOcean**.

- **Environment Variables**: Copy `backend/.env.example` to `.env` and fill in your details (SMTP for SOS alerts).
- **Entry Point**: `python server.py`
- **Port**: The server uses the `PORT` environment variable (defaults to 8000).
- **Docker**: A `Dockerfile` is provided for containerized deployment.

### 2. Frontend Deployment (React)
The frontend is a static site built with Vite. You can deploy it to **Vercel**, **Netlify**, or **GitHub Pages**.

- **Environment Variables**: Create a `.env` file in the `frontend` directory based on `.env.example`.
  - `VITE_API_URL`: The full URL of your deployed backend (e.g., `https://your-backend.onrender.com/gestures`).
  - `VITE_WS_URL`: The WebSocket URL of your deployed backend (e.g., `wss://your-backend.onrender.com/ws/gesture`).
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## Local Development

### Backend
```bash
cd backend
pip install -r requirements.txt
python server.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
