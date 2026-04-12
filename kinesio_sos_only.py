"""
╔══════════════════════════════════════════════════════════════╗
║              KINESIO-SPELL  —  SOS Emergency Alert Only    ║
║  Features:                                                   ║
║   • 3 fast blinks → email alert (any time)                   ║
║   • Optimized EAR with rolling 3-frame smoothing             ║
║   • Thread-safe, per-session FaceMesh                        ║
╚══════════════════════════════════════════════════════════════╝

SETUP:
    pip install opencv-python mediapipe numpy

CONFIG (edit section below before running):
    SOS email uses SMTP only (stdlib) — no HTTP API / SendGrid.
    For Gmail: enable 2FA and create an App Password, put it in SMTP_PASSWORD.

    SMTP_HOST / SMTP_PORT — usually smtp.gmail.com:587
    SMTP_USER — your mailbox login (often same as SOS_EMAIL_FROM)
    SMTP_PASSWORD — app password or SMTP password (never commit real secrets)
    SOS_EMAIL_FROM / SOS_EMAIL_TO — sender and recipient
    SOS_PHONE — optional: shown in alert body
"""

import os
import smtplib
import ssl
from email.message import EmailMessage
from urllib.request import urlretrieve
from dotenv import load_dotenv

# Load sensitive config from .env
load_dotenv()

import cv2
import mediapipe as mp
import numpy as np
import time
import threading
from collections import deque

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
FACE_LANDMARKER_TASK_PATH = os.path.join(_APP_DIR, "face_landmarker.task")
FACE_LANDMARKER_TASK_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)


def _ensure_face_landmarker_task(path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return True
    try:
        urlretrieve(FACE_LANDMARKER_TASK_URL, path)
        return os.path.exists(path) and os.path.getsize(path) > 1024
    except Exception:
        return False


def _open_face_tracker():
    """
    Older MediaPipe: mp.solutions.face_mesh
    Newer builds (e.g. py3.13): Tasks API FaceLandmarker only.
    """
    if hasattr(mp, "solutions"):
        mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6,
        )
        return "solutions", mesh, None

    if not _ensure_face_landmarker_task(FACE_LANDMARKER_TASK_PATH):
        raise RuntimeError(
            "Could not download face_landmarker.task. Check network, or place face_landmarker.task next to this script."
        )
    BaseOptions = mp.tasks.BaseOptions
    vision = mp.tasks.vision
    options = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=FACE_LANDMARKER_TASK_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    landmarker = vision.FaceLandmarker.create_from_options(options)
    return "tasks", None, landmarker


def _close_face_tracker(mode: str, mesh, landmarker) -> None:
    try:
        if mode == "solutions" and mesh is not None:
            mesh.close()
        elif mode == "tasks" and landmarker is not None:
            landmarker.close()
    except Exception:
        pass


def _get_face_pixel_coords(mode: str, mesh, landmarker, rgb, ts_ms: int, w: int, h: int):
    """Returns (468, 2) float32 pixel coords or None."""
    if mode == "solutions":
        rgb.flags.writeable = False
        results = mesh.process(rgb)
        rgb.flags.writeable = True
        if not results.multi_face_landmarks:
            return None
        lm = results.multi_face_landmarks[0].landmark
        return np.array([(lm[i].x * w, lm[i].y * h) for i in range(468)], dtype=np.float32)

    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    res = landmarker.detect_for_video(image, ts_ms)
    if not getattr(res, "face_landmarks", None) or not res.face_landmarks:
        return None
    pts = res.face_landmarks[0]
    coords = np.array([(float(lm.x) * w, float(lm.y) * h) for lm in pts], dtype=np.float32)
    if len(coords) < 468:
        return None
    return coords[:468]

# ══════════════════════════════════════════════════════════════
#  USER CONFIGURATION  — edit these before running
# ══════════════════════════════════════════════════════════════

# SMTP (direct email — no third-party API)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

SOS_EMAIL_FROM = os.getenv("SOS_EMAIL_FROM")
SOS_EMAIL_TO = os.getenv("SOS_EMAIL_TO")
SOS_CONTACT_NAME = os.getenv("SOS_CONTACT_NAME", "Emergency Contact")
SOS_PHONE = os.getenv("SOS_PHONE", "N/A")

# ══════════════════════════════════════════════════════════════
#  DETECTION CONSTANTS
# ══════════════════════════════════════════════════════════════

# Eye landmark indices (MediaPipe 468-point mesh)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

# Below = eye closed. Slightly lower helps with glasses / bright rooms.
EAR_THRESHOLD = 0.15
EAR_SMOOTH_FRAMES = 3   # rolling average window for noise reduction
BLINK_COOLDOWN_MS = 200 # min ms (0.2s) between separate counted blinks to prevent noise jitter

# ── 3 fast blinks → email alert ──
# All 3 blink *end* times must fall within this window (ms).
FAST_3_BLINK_WINDOW_MS = 1500
FAST_3_BLINK_EMAIL_COOLDOWN_SEC = 45  # avoid spam after one send


def calculate_ear(eye_indices: list, coords: np.ndarray) -> float:
    """
    Eye Aspect Ratio (EAR) — Soukupová & Čech, 2016.
    Uses 6 landmark points per eye.
    Returns a float: ~0.3 open, <0.21 closed.
    """
    p1, p2, p3, p4, p5, p6 = [coords[i] for i in eye_indices]
    vertical1 = np.linalg.norm(p2 - p6)
    vertical2 = np.linalg.norm(p3 - p5)
    horizontal = np.linalg.norm(p1 - p4)
    if horizontal < 1e-6:
        return 0.0
    return (vertical1 + vertical2) / (2.0 * horizontal)


def send_alert_email(timestamp: str) -> bool:
    """Send SOS alert email via SMTP (stdlib only)."""

    subject = "🚨 SOS ALERT — Emergency Signal Detected"
    headline_html = "SOS EMERGENCY SIGNAL"
    trigger_detail = (
        "Three rapid blinks were detected in quick succession "
        f"(within {FAST_3_BLINK_WINDOW_MS} ms). This is an emergency distress signal."
    )
    plain_summary = (
        f"SOS ALERT at {timestamp}. Contact: {SOS_CONTACT_NAME} {SOS_PHONE}"
    )

    html_body = (
        f"<h2 style='color:red'>{headline_html}</h2>"
        f"<p>{trigger_detail}</p>"
        f"<table>"
        f"<tr><td><b>Time</b></td><td>{timestamp}</td></tr>"
        f"<tr><td><b>Contact</b></td><td>{SOS_CONTACT_NAME}</td></tr>"
        f"<tr><td><b>Phone</b></td><td>{SOS_PHONE}</td></tr>"
        f"</table>"
        f"<p style='color:red'><b>Please check on this person immediately.</b></p>"
        f"<hr/><small>Sent by Kinesio-Spell SOS System.</small>"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_USER
    msg["To"] = SOS_EMAIL_TO
    msg.set_content(plain_summary)
    msg.add_alternative(html_body, subtype="html")

    try:
        context = ssl.create_default_context()

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        print(f"[ALERT] SOS Email sent to {SOS_EMAIL_TO} via SMTP ({SMTP_HOST})")
        return True

    except smtplib.SMTPAuthenticationError:
        print("❌ AUTH ERROR: Use Gmail App Password, not normal password")
    except Exception as e:
        print(f"[ALERT] Email failed: {e}")

    return False


def trigger_sos_email_async(timestamp: str) -> None:
    threading.Thread(target=send_alert_email, args=(timestamp,), daemon=True).start()


class FastTripleBlinkDetector:
    """
    Triggers when 3 blink *completions* occur within FAST_3_BLINK_WINDOW_MS.
    """

    def __init__(self) -> None:
        self._blink_ends_ms: list[int] = []
        self._last_email_time: float = 0.0

    def feed(self, blink_end_ms: int) -> bool:
        now_sec = time.time()
        self._blink_ends_ms = [
            t for t in self._blink_ends_ms if blink_end_ms - t <= FAST_3_BLINK_WINDOW_MS
        ]
        self._blink_ends_ms.append(blink_end_ms)

        if len(self._blink_ends_ms) < 3:
            return False

        if now_sec - self._last_email_time < FAST_3_BLINK_EMAIL_COOLDOWN_SEC:
            self._blink_ends_ms.clear()
            return False

        self._blink_ends_ms.clear()
        self._last_email_time = now_sec
        return True


class BlinkTracker:
    def __init__(self):
        self.ear_buffer: deque = deque(maxlen=EAR_SMOOTH_FRAMES)
        self.eye_closed: bool = False
        self.close_time_ms: int = 0
        self.last_blink_time_ms: int = 0
        self.blink_count: int = 0

    @property
    def smooth_ear(self) -> float:
        if not self.ear_buffer:
            return 1.0
        return float(np.mean(self.ear_buffer))

    def update(self, raw_ear: float, now_ms: int) -> dict | None:
        self.ear_buffer.append(raw_ear)
        ear = self.smooth_ear

        if ear < EAR_THRESHOLD:
            if not self.eye_closed:
                self.eye_closed = True
                self.close_time_ms = now_ms
        else:
            if self.eye_closed:
                self.eye_closed = False
                duration_ms = now_ms - self.close_time_ms

                if (now_ms - self.last_blink_time_ms) < BLINK_COOLDOWN_MS:
                    return None

                self.last_blink_time_ms = now_ms
                self.blink_count += 1

                return {
                    "time_ms": now_ms,
                    "duration_ms": duration_ms,
                }
        return None


def draw_ui(
    frame: np.ndarray,
    status: str,
    sub: str = "",
    color: tuple = (0, 220, 80),
    sos_active: bool = False,
    ear_hint: str = "",
) -> None:
    overlay = frame.copy()
    if sos_active:
        cv2.rectangle(overlay, (0, 0), (frame.shape[1], frame.shape[0]), (0, 0, 200), -1)
        cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)

    cv2.putText(frame, status, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2, cv2.LINE_AA)
    if sub:
        cv2.putText(frame, sub, (30, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 1, cv2.LINE_AA)
    if ear_hint:
        cv2.putText(frame, ear_hint, (30, 118), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 220, 255), 1, cv2.LINE_AA)

    cv2.putText(
        frame,
        "ESC = quit",
        (30, frame.shape[0] - 15),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (120, 120, 120),
        1,
        cv2.LINE_AA,
    )


def start_sos_monitor() -> None:
    print("=" * 60)
    print("  KINESIO-SPELL  —  SOS Emergency Alert Only")
    print("=" * 60)

    try:
        mode, face_mesh, landmarker = _open_face_tracker()
    except Exception as e:
        print(f"ERROR: Face tracker init failed: {e}")
        return
    print(f"[INFO] Face tracking mode: {mode}")
    print(
        f"[INFO] SOS Monitor Active: blink quickly 3 times within ~{FAST_3_BLINK_WINDOW_MS} ms "
        f"-> sends email to {SOS_EMAIL_TO}"
    )
    print("[INFO] Monitoring for emergency signals...")

    backend = cv2.CAP_AVFOUNDATION if hasattr(cv2, "CAP_AVFOUNDATION") else 0
    cap = cv2.VideoCapture(0, backend) if backend != 0 else cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open camera.")
        _close_face_tracker(mode, face_mesh, landmarker)
        return

    tracker = BlinkTracker()
    fast_3_blink = FastTripleBlinkDetector()
    alert_flash_until: float = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("ERROR: Camera read failed.")
            break

        now_ms = int(time.time() * 1000)
        ts_ms = now_ms
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = frame.shape[:2]
        coords = _get_face_pixel_coords(mode, face_mesh, landmarker, rgb, ts_ms, w, h)

        status = "SOS MONITOR ACTIVE"
        sub = "Blink 3x rapidly for emergency"
        color = (0, 220, 80)
        alert_flash = time.time() < alert_flash_until
        ear_hint = "Show face to camera"

        if coords is not None:
            raw_ear = (calculate_ear(LEFT_EYE, coords) + calculate_ear(RIGHT_EYE, coords)) / 2.0
            ear_hint = f"EAR {raw_ear:.3f} | Blink 3x fast -> SOS"
            blink_event = tracker.update(raw_ear, now_ms)

            if blink_event:
                bt = blink_event["time_ms"]

                if fast_3_blink.feed(bt):
                    ts = time.strftime("%Y-%m-%d %H:%M:%S")
                    print(f"\n[🚨 SOS TRIGGERED] Alert at {ts} — sending email...")
                    trigger_sos_email_async(ts)
                    alert_flash_until = time.time() + 3.0
        else:
            sub = "No face detected"
            ear_hint = ""

        if alert_flash:
            status = "🚨 SOS ALERT SENT"
            color = (0, 0, 255)
            sub = "Emergency signal transmitted!"

        draw_ui(frame, status, sub, color, sos_active=alert_flash, ear_hint=ear_hint)
        cv2.imshow("Kinesio-SPELL SOS Monitor", frame)

        if cv2.waitKey(1) & 0xFF == 27:
            print("\n[INFO] Session ended by user.")
            break

    cap.release()
    cv2.destroyAllWindows()
    _close_face_tracker(mode, face_mesh, landmarker)
    print("[INFO] Camera released. Goodbye.")


if __name__ == "__main__":
    start_sos_monitor()
