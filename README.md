# AURASHIELD — NEXUS AUTH

Single-page **React + Vite** frontend with **Three.js** (React Three Fiber) and a **FastAPI** WebSocket bridge around `gesture_auth.py`. The original Tk desktop app is unchanged; the server imports its MediaPipe/OpenCV logic and processes **browser webcam** frames (JPEG base64 over `ws://localhost:8000/ws/gesture`).

## Prerequisites

- Python 3.10+ (MediaPipe supported version)
- Node 18+

## Backend

From the **project root** (`CODE_JSS/`):

```bash
pip install -r requirements.txt
python server.py
```

This starts Uvicorn on **http://0.0.0.0:8000** with:

- WebSocket: `ws://localhost:8000/ws/gesture`
- REST (gesture cards): `GET http://localhost:8000/gestures`

On first run, MediaPipe may download `.task` model files into the project directory (same behavior as `gesture_auth.py`).

To use the **original desktop UI** only:

```bash
python gesture_auth.py
```

## Frontend

```bash
cd aurashield
npm install
npm run dev
```

Open **http://localhost:5173**.

### Stack (as installed)

- React 18, Vite
- `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`
- TailwindCSS, Framer Motion, GSAP (available for further polish), Lucide React

## Flow

1. Start `server.py`, then `npm run dev`.
2. Allow **camera** in the browser.
3. Enter a signature ID → **Record** (≈4.5s capture) → gesture saved to `gesture_data.json`.
4. **Activate Nexus** → live frames + metrics; hold a matching pose with face visible for the hold window to get **IDENTITY CONFIRMED**.

If the socket cannot connect after several retries, the UI shows **NEXUS UNREACHABLE** — ensure `python server.py` is running.

## Layout

- `gesture_auth.py` — original recorder/detector (unchanged).
- `server.py` — FastAPI + `WebGestureSession` (headless; no Tk, no OpenCV window).
- `aurashield/` — Vite app; Nexus UI, hooks, and Three.js scene under `src/`.

Future modules (blink SOS, voice, deepfake, dashboard) have **commented slots** in `App.jsx` and reserved keys in `AuraShieldContext.jsx`.
