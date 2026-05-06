import json
import math
import os
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from urllib.request import urlretrieve

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
# Some MediaPipe dependencies may import Matplotlib, which caches fonts/config on first import.
# Ensure caches go to a writable directory (especially in constrained environments).
os.environ.setdefault("MPLCONFIGDIR", os.path.join(_APP_DIR, ".mplconfig"))
os.environ.setdefault("XDG_CACHE_HOME", os.path.join(_APP_DIR, ".cache"))
try:
    os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)
    os.makedirs(os.environ["XDG_CACHE_HOME"], exist_ok=True)
except Exception:
    pass

import cv2
try:
    import customtkinter as ctk
except (ImportError, Exception):
    ctk = None

if ctk is None:
    # Dummy class to prevent inheritance errors in headless environments
    class MockCtk:
        class CTk: pass
    ctk = MockCtk()
import mediapipe as mp


GESTURE_DB_PATH = "gesture_data.json"
HAND_LANDMARKER_TASK_PATH = os.path.join(_APP_DIR, "hand_landmarker.task")
# Official MediaPipe model asset (used only when mp.solutions is unavailable).
HAND_LANDMARKER_TASK_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

FACE_LANDMARKER_TASK_PATH = os.path.join(_APP_DIR, "face_landmarker.task")
FACE_LANDMARKER_TASK_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

# MediaPipe Hands landmark indices
WRIST = 0
THUMB_TIP = 4
INDEX_TIP = 8
MIDDLE_TIP = 12
RING_TIP = 16
PINKY_TIP = 20
INDEX_MCP = 5
PINKY_MCP = 17
MIDDLE_MCP = 9


FEATURE_PAIRS: List[Tuple[int, int]] = [
    (THUMB_TIP, INDEX_TIP),
    (THUMB_TIP, PINKY_TIP),
    (INDEX_TIP, MIDDLE_TIP),
    (MIDDLE_TIP, RING_TIP),
    (RING_TIP, PINKY_TIP),
    (WRIST, THUMB_TIP),
    (WRIST, INDEX_TIP),
    (WRIST, MIDDLE_TIP),
    (WRIST, RING_TIP),
    (WRIST, PINKY_TIP),
    (INDEX_MCP, PINKY_MCP),
]


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def euclidean(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def l2_distance(v1: List[float], v2: List[float]) -> float:
    if len(v1) != len(v2):
        raise ValueError("Vector length mismatch")
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))


def mean_vector(vectors: List[List[float]]) -> List[float]:
    if not vectors:
        return []
    n = len(vectors)
    m = len(vectors[0])
    out = [0.0] * m
    for vec in vectors:
        for i in range(m):
            out[i] += float(vec[i])
    return [x / n for x in out]


def variance_2d(points: List[Tuple[float, float]]) -> float:
    if len(points) < 2:
        return 0.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    vx = sum((x - mx) ** 2 for x in xs) / (len(xs) - 1)
    vy = sum((y - my) ** 2 for y in ys) / (len(ys) - 1)
    return vx + vy


def safe_read_json(path: str) -> Dict:
    if not os.path.exists(path):
        return {"gestures": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"gestures": {}}
        if "gestures" not in data or not isinstance(data["gestures"], dict):
            data["gestures"] = {}
        return data
    except Exception:
        return {"gestures": {}}


def safe_write_json(path: str, data: Dict) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def landmarks_to_xy(landmarks) -> List[Tuple[float, float]]:
    pts = []
    for lm in landmarks:
        pts.append((float(lm.x), float(lm.y)))
    return pts


def ensure_hand_landmarker_task(path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return True
    try:
        urlretrieve(HAND_LANDMARKER_TASK_URL, path)
        return os.path.exists(path) and os.path.getsize(path) > 1024
    except Exception:
        return False


def ensure_face_landmarker_task(path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return True
    try:
        urlretrieve(FACE_LANDMARKER_TASK_URL, path)
        return os.path.exists(path) and os.path.getsize(path) > 1024
    except Exception:
        return False





FACE_LEFT_EYE_OUTER = 33
FACE_RIGHT_EYE_OUTER = 263
FACE_NOSE_TIP = 1
FACE_MOUTH_LEFT = 61
FACE_MOUTH_RIGHT = 291
FACE_LEFT_EYE_INNER = 133
FACE_RIGHT_EYE_INNER = 362
FACE_LEFT_EYE_UPPER = 159
FACE_LEFT_EYE_LOWER = 145
FACE_RIGHT_EYE_UPPER = 386
FACE_RIGHT_EYE_LOWER = 374

FACE_FEATURE_PAIRS: List[Tuple[int, int]] = [
    (FACE_LEFT_EYE_OUTER, FACE_RIGHT_EYE_OUTER),
    (FACE_LEFT_EYE_OUTER, FACE_NOSE_TIP),
    (FACE_RIGHT_EYE_OUTER, FACE_NOSE_TIP),
    (FACE_MOUTH_LEFT, FACE_MOUTH_RIGHT),
    (FACE_NOSE_TIP, FACE_MOUTH_LEFT),
    (FACE_NOSE_TIP, FACE_MOUTH_RIGHT),
]


def face_feature_vector(pts: List[Tuple[float, float]]) -> List[float]:
    # Normalize by inter-ocular distance for scale invariance.
    scale = euclidean(pts[FACE_LEFT_EYE_OUTER], pts[FACE_RIGHT_EYE_OUTER])
    scale = max(scale, 1e-6)
    return [euclidean(pts[a], pts[b]) / scale for a, b in FACE_FEATURE_PAIRS]


class FaceLandmarkExtractor:
    def __init__(self):
        self._landmarker = None

    def open(self) -> None:
        if not ensure_face_landmarker_task(FACE_LANDMARKER_TASK_PATH):
            raise RuntimeError(
                "Could not download face_landmarker.task. Check your network, then re-run."
            )
        try:
            BaseOptions = mp.tasks.BaseOptions
            vision = mp.tasks.vision
            FaceLandmarker = vision.FaceLandmarker
            FaceLandmarkerOptions = vision.FaceLandmarkerOptions
            RunningMode = vision.RunningMode
        except Exception as e:
            raise RuntimeError(f"MediaPipe tasks API not available: {e}") from e

        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=FACE_LANDMARKER_TASK_PATH),
            running_mode=RunningMode.VIDEO,
            num_faces=1,
        )
        self._landmarker = FaceLandmarker.create_from_options(options)

    def close(self) -> None:
        try:
            if self._landmarker is not None:
                self._landmarker.close()
        except Exception:
            pass
        self._landmarker = None

    def extract_xy(self, frame_rgb, timestamp_ms: int) -> Optional[List[Tuple[float, float]]]:
        if self._landmarker is None:
            return None
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        res = self._landmarker.detect_for_video(image, timestamp_ms)
        if not getattr(res, "face_landmarks", None):
            return None
        if not res.face_landmarks:
            return None
        return landmarks_to_xy(res.face_landmarks[0])


class HandLandmarkExtractor:
    """
    Compatibility wrapper:
    - Older MediaPipe: mp.solutions.hands
    - Newer MediaPipe (e.g. 0.10.33 on py3.13): mp.tasks.vision.HandLandmarker
    """

    def __init__(self):
        self._mode = "unknown"
        self._hands = None
        self._landmarker = None

    @property
    def mode(self) -> str:
        return self._mode

    def open(self) -> None:
        if hasattr(mp, "solutions"):
            self._mode = "solutions"
            mp_hands = mp.solutions.hands
            self._hands = mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=1,
                model_complexity=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            return

        # Fallback to Tasks API
        if not ensure_hand_landmarker_task(HAND_LANDMARKER_TASK_PATH):
            raise RuntimeError(
                "Could not download hand_landmarker.task. Check your network, then re-run."
            )

        self._mode = "tasks"
        try:
            BaseOptions = mp.tasks.BaseOptions
            vision = mp.tasks.vision
            HandLandmarker = vision.HandLandmarker
            HandLandmarkerOptions = vision.HandLandmarkerOptions
            RunningMode = vision.RunningMode
        except Exception as e:
            raise RuntimeError(f"MediaPipe tasks API not available: {e}") from e

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=HAND_LANDMARKER_TASK_PATH),
            running_mode=RunningMode.VIDEO,
            num_hands=1,
        )
        self._landmarker = HandLandmarker.create_from_options(options)

    def close(self) -> None:
        try:
            if self._hands is not None:
                self._hands.close()
        except Exception:
            pass
        try:
            if self._landmarker is not None:
                self._landmarker.close()
        except Exception:
            pass
        self._hands = None
        self._landmarker = None
        self._mode = "unknown"

    def extract_xy(self, frame_rgb, timestamp_ms: int) -> Optional[List[Tuple[float, float]]]:
        if self._mode == "solutions":
            res = self._hands.process(frame_rgb)
            if not res.multi_hand_landmarks:
                return None
            return landmarks_to_xy(res.multi_hand_landmarks[0].landmark)

        if self._mode == "tasks":
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            res = self._landmarker.detect_for_video(image, timestamp_ms)
            if not getattr(res, "hand_landmarks", None):
                return None
            if not res.hand_landmarks:
                return None
            return landmarks_to_xy(res.hand_landmarks[0])

        return None


def compute_scale(pts: List[Tuple[float, float]]) -> float:
    # Robust-ish palm scale: wrist->middle_mcp blended with wrist->index_mcp and wrist->pinky_mcp.
    w = pts[WRIST]
    d1 = euclidean(w, pts[MIDDLE_MCP])
    d2 = euclidean(w, pts[INDEX_MCP])
    d3 = euclidean(w, pts[PINKY_MCP])
    scale = (d1 + d2 + d3) / 3.0
    return max(scale, 1e-6)


def compute_feature_vector(pts: List[Tuple[float, float]]) -> List[float]:
    scale = compute_scale(pts)
    feats: List[float] = []
    for a, b in FEATURE_PAIRS:
        feats.append(euclidean(pts[a], pts[b]) / scale)
    return feats


@dataclass
class GestureModel:
    name: str
    created_at: float
    feature_pairs: List[Tuple[int, int]]
    frame_vectors: List[List[float]]
    avg_vector: List[float]
    record_wrist_var: float
    owner_face_avg_vector: List[float]

    def to_json(self) -> Dict:
        return {
            "name": self.name,
            "created_at": self.created_at,
            "feature_pairs": [[a, b] for a, b in self.feature_pairs],
            "frame_vectors": self.frame_vectors,
            "avg_vector": self.avg_vector,
            "record_wrist_var": self.record_wrist_var,
            "owner_face_avg_vector": self.owner_face_avg_vector,
        }

    @staticmethod
    def from_json(d: Dict) -> "GestureModel":
        return GestureModel(
            name=str(d.get("name", "")),
            created_at=float(d.get("created_at", 0.0)),
            feature_pairs=[(int(a), int(b)) for a, b in d.get("feature_pairs", [])],
            frame_vectors=[[float(x) for x in v] for v in d.get("frame_vectors", [])],
            avg_vector=[float(x) for x in d.get("avg_vector", [])],
            record_wrist_var=float(d.get("record_wrist_var", 0.0)),
            owner_face_avg_vector=[float(x) for x in d.get("owner_face_avg_vector", [])],
        )


class GestureDB:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()

    def load_all(self) -> Dict[str, GestureModel]:
        with self._lock:
            data = safe_read_json(self.path)
        gestures = {}
        for name, gd in data.get("gestures", {}).items():
            try:
                gestures[str(name)] = GestureModel.from_json(gd)
            except Exception:
                continue
        return gestures

    def upsert(self, model: GestureModel) -> None:
        with self._lock:
            data = safe_read_json(self.path)
            data.setdefault("gestures", {})
            data["gestures"][model.name] = model.to_json()
            safe_write_json(self.path, data)


class GestureApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.title("Geometric Hand Gesture Recorder/Detector (No ML)")
        self.geometry("560x260")
        self.resizable(False, False)

        self.db = GestureDB(GESTURE_DB_PATH)

        self._status_var = ctk.StringVar(value="Idle")
        self._hint_var = ctk.StringVar(value=f"Database: {GESTURE_DB_PATH}")

        self._monitoring = False
        self._recording = False
        self._stop_event = threading.Event()
        self._camera_thread: Optional[threading.Thread] = None
        self._camera_preflight_done = False
        self._camera_preflight_ok = False
        self._latest_frame_bgr = None
        self._latest_overlay_lines: List[str] = []
        self._frame_lock = threading.Lock()
        self._display_loop_running = False

        # Recording state
        self._record_end_time = 0.0
        self._record_started_at = 0.0
        self._record_target_frames = 45
        self._record_min_frames = 30
        self._record_vectors: List[List[float]] = []
        self._record_wrist_points: List[Tuple[float, float]] = []

        # Monitoring state
        self._recent_vectors: List[List[float]] = []
        self._recent_wrist_points: List[Tuple[float, float]] = []
        self._match_started_at: Optional[float] = None
        self._last_best: Tuple[str, float] = ("", 0.0)  # (name, similarity_percent)
        self._last_detection_at: float = 0.0
        self._last_denial_at: float = 0.0
        self._record_face_vectors: List[List[float]] = []
        self._record_face_min_frames: int = 20

        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        outer = ctk.CTkFrame(self, corner_radius=12)
        outer.pack(fill="both", expand=True, padx=14, pady=14)

        title = ctk.CTkLabel(
            outer,
            text="Custom Gesture Recorder + Detector (Geometry Only)",
            font=ctk.CTkFont(size=18, weight="bold"),
        )
        title.pack(pady=(10, 8))

        row = ctk.CTkFrame(outer, fg_color="transparent")
        row.pack(fill="x", padx=14, pady=(4, 8))

        self._name_entry = ctk.CTkEntry(row, placeholder_text="Gesture Name (e.g., MyGesture)")
        self._name_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))

        self._record_btn = ctk.CTkButton(row, text="Record Gesture", command=self._on_record)
        self._record_btn.pack(side="left", padx=(0, 10))

        self._monitor_btn = ctk.CTkButton(row, text="Start Monitoring", command=self._on_toggle_monitoring)
        self._monitor_btn.pack(side="left")

        status_row = ctk.CTkFrame(outer, fg_color="transparent")
        status_row.pack(fill="x", padx=14, pady=(10, 0))

        ctk.CTkLabel(status_row, text="Status:", font=ctk.CTkFont(weight="bold")).pack(side="left")
        self._status_label = ctk.CTkLabel(status_row, textvariable=self._status_var)
        self._status_label.pack(side="left", padx=(8, 0))

        hint = ctk.CTkLabel(outer, textvariable=self._hint_var, text_color="#9aa0a6")
        hint.pack(pady=(10, 6))

        tip = ctk.CTkLabel(
            outer,
            text="Tips: Record with good lighting. Detection requires slight natural wrist motion (anti-spoof).",
            text_color="#9aa0a6",
            wraplength=520,
            justify="center",
        )
        tip.pack(pady=(0, 8))

    def _set_status(self, txt: str) -> None:
        self.after(0, lambda: self._status_var.set(txt))

    def _set_hint(self, txt: str) -> None:
        self.after(0, lambda: self._hint_var.set(txt))

    def _on_record(self) -> None:
        name = self._name_entry.get().strip()
        if not name:
            self._set_status("Idle (enter a gesture name first)")
            return
        if self._recording:
            return

        # Pause monitoring while recording to keep the flow predictable.
        if self._monitoring:
            self._monitoring = False
            try:
                self._monitor_btn.configure(text="Start Monitoring")
            except Exception:
                pass

        self._recording = True
        self._record_vectors = []
        self._record_wrist_points = []
        self._record_face_vectors = []
        self._record_started_at = time.time()
        # Time limit is a bit longer than 3s so we reliably reach 30+ detected frames.
        self._record_end_time = self._record_started_at + 4.5
        self._set_status("Recording...")
        self._set_hint(f"Recording '{name}'... show your hand clearly until it reaches {self._record_target_frames} frames.")
        try:
            self._name_entry.configure(state="disabled")
            self._record_btn.configure(state="disabled")
        except Exception:
            pass

        self._start_camera_thread()

    def _on_toggle_monitoring(self) -> None:
        if self._monitoring:
            self._monitoring = False
            self._set_status("Idle")
            self._set_hint("Monitoring stopped.")
            self._monitor_btn.configure(text="Start Monitoring")
            return

        self._monitoring = True
        self._match_started_at = None
        self._recent_vectors = []
        self._recent_wrist_points = []
        self._last_best = ("", 0.0)
        self._set_status("Monitoring...")
        self._set_hint("Monitoring...")
        self._monitor_btn.configure(text="Stop Monitoring")

        self._start_camera_thread()

    def _start_camera_thread(self) -> None:
        if self._camera_thread and self._camera_thread.is_alive():
            return
        if not self._camera_preflight_done:
            self._camera_preflight_done = True
            self._camera_preflight_ok = self._camera_preflight()
        if not self._camera_preflight_ok:
            return
        self._stop_event.clear()
        self._camera_thread = threading.Thread(target=self._camera_loop, daemon=True)
        self._camera_thread.start()
        if not self._display_loop_running:
            self._display_loop_running = True
            self.after(0, self._display_loop)

    def _camera_preflight(self) -> bool:
        """
        macOS: OpenCV's AVFoundation camera authorization request must happen on the main thread.
        We do a quick open/read/close here (GUI thread) so the OS prompt (if any) appears safely.
        """
        try:
            backend = cv2.CAP_AVFOUNDATION if hasattr(cv2, "CAP_AVFOUNDATION") else 0
            cap = cv2.VideoCapture(0, backend) if backend != 0 else cv2.VideoCapture(0)
            if not cap.isOpened():
                self._set_status("Idle (camera not available)")
                self._set_hint(
                    "Camera not available. On macOS, allow camera access for your terminal/app in System Settings."
                )
                return False
            ok, _ = cap.read()
            cap.release()
            if not ok:
                self._set_status("Idle (camera init failed)")
                self._set_hint(
                    "Camera failed to initialize. If prompted, grant camera permission, then restart the app."
                )
                return False
            return True
        except Exception as e:
            self._set_status("Idle (camera error)")
            self._set_hint(f"Camera error: {e}")
            return False

    def _on_close(self) -> None:
        self._stop_event.set()
        time.sleep(0.15)
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass
        self.destroy()

    def _display_loop(self) -> None:
        """
        OpenCV UI (imshow/waitKey) should run on the main thread on macOS.
        We periodically display the latest frame produced by the camera thread.
        """
        if self._stop_event.is_set():
            self._display_loop_running = False
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass
            return

        frame = None
        lines: List[str] = []
        with self._frame_lock:
            if self._latest_frame_bgr is not None:
                frame = self._latest_frame_bgr.copy()
                lines = list(self._latest_overlay_lines)

        if frame is not None:
            try:
                self._draw_overlay(frame, lines)
                cv2.imshow("Gesture Camera", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    self._stop_event.set()
                    self._monitoring = False
                    self._recording = False
                    self._set_status("Idle")
                    self._set_hint("Stopped (pressed q).")
                    try:
                        self._monitor_btn.configure(text="Start Monitoring")
                    except Exception:
                        pass
            except Exception as e:
                # If display fails, stop cleanly instead of crashing a worker thread.
                self._stop_event.set()
                self._set_status("Idle (OpenCV display error)")
                self._set_hint(str(e))

        # ~60fps UI refresh
        self.after(16, self._display_loop)

    def _camera_loop(self) -> None:
        backend = cv2.CAP_AVFOUNDATION if hasattr(cv2, "CAP_AVFOUNDATION") else 0
        cap = cv2.VideoCapture(0, backend) if backend != 0 else cv2.VideoCapture(0)
        if not cap.isOpened():
            self._set_status("Idle (camera not available)")
            self._set_hint("Could not open webcam.")
            return

        extractor = HandLandmarkExtractor()
        face_extractor = FaceLandmarkExtractor()
        try:
            self._set_hint("Initializing hand landmark extractor...")
            extractor.open()
            self._set_hint(f"Hand tracker ready ({extractor.mode}). Initializing face tracker...")
            face_extractor.open()
            self._set_hint(f"Hand + face trackers ready ({extractor.mode} + tasks).")
        except Exception as e:
            self._set_status("Idle (Tracker init failed)")
            self._set_hint(str(e))
            return

        last_frame_time = time.time()

        try:
            while not self._stop_event.is_set():
                try:
                    ok, frame = cap.read()
                    if not ok:
                        time.sleep(0.01)
                        continue

                    frame = cv2.flip(frame, 1)
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    ts_ms = int(time.time() * 1000)
                    pts = extractor.extract_xy(rgb, ts_ms)
                    face_pts = face_extractor.extract_xy(rgb, ts_ms)

                    overlay_lines: List[str] = []
                    now = time.time()

                    # Simple FPS control helps keep UI responsive on slower machines.
                    dt = now - last_frame_time
                    if dt < 1 / 60:
                        time.sleep(max(0.0, (1 / 60) - dt))
                    last_frame_time = now

                    # While recording, also capture the recorder's face signature.
                    if self._recording:
                        if face_pts:
                            self._record_face_vectors.append(face_feature_vector(face_pts))
                        else:
                            overlay_lines.append("Face not found (needed for owner-only detection).")

                    if pts:
                        vec = compute_feature_vector(pts)
                        wrist_pt = pts[WRIST]

                        if self._recording:
                            remaining = max(0.0, self._record_end_time - now)
                            overlay_lines.append(
                                f"Recording... {len(self._record_vectors)}/{self._record_target_frames}  ({remaining:0.1f}s)"
                            )
                            self._record_vectors.append(vec)
                            self._record_wrist_points.append(wrist_pt)

                            # Finish early once we have enough detected frames.
                            if len(self._record_vectors) >= self._record_target_frames:
                                self.after(0, self._finish_recording)
                            elif now >= self._record_end_time:
                                # Time limit reached; finish/save (may fail if too few frames).
                                self.after(0, self._finish_recording)

                        if self._monitoring:
                            overlay_lines.append("Matching...")
                            live_face_vec = face_feature_vector(face_pts) if face_pts else None
                            self._monitor_step(vec, wrist_pt, overlay_lines, live_face_vec, face_pts)

                    else:
                        if self._recording:
                            remaining = max(0.0, self._record_end_time - now)
                            overlay_lines.append(
                                f"Recording... {len(self._record_vectors)}/{self._record_target_frames}  (hand not found, {remaining:0.1f}s)"
                            )
                        if self._monitoring:
                            overlay_lines.append("Matching... (hand not found)")
                            self._match_started_at = None
                            self._recent_vectors = []
                            self._recent_wrist_points = []

                    if (not self._monitoring) and (not self._recording):
                        overlay_lines.append("Idle (press Record or Start Monitoring)")
                    if self._monitoring:
                        overlay_lines.append("Owner-only: ON (face + gesture)")
                        overlay_lines.append("Face: OK" if face_pts else "Face: NOT FOUND")

                    # Publish latest frame for the main-thread display loop.
                    with self._frame_lock:
                        self._latest_frame_bgr = frame
                        self._latest_overlay_lines = overlay_lines
                except Exception as e:
                    # Prevent unexpected exceptions from killing the camera thread.
                    self._set_status("Idle (camera loop error)")
                    self._set_hint(str(e))
                    time.sleep(0.05)
        finally:
            extractor.close()
            face_extractor.close()
            cap.release()
            try:
                cv2.destroyWindow("Gesture Camera")
            except Exception:
                pass

    def _finish_recording(self) -> None:
        # Guard against multiple finish triggers.
        if not self._recording:
            return
        self._recording = False
        name = self._name_entry.get().strip()

        try:
            self._name_entry.configure(state="normal")
            self._record_btn.configure(state="normal")
        except Exception:
            pass

        vectors = self._record_vectors[:]
        wrist_points = self._record_wrist_points[:]
        face_vectors = self._record_face_vectors[:]

        if len(vectors) < self._record_min_frames:
            self._set_status("Idle (record failed: not enough frames)")
            self._set_hint(
                f"Need at least {self._record_min_frames} detected frames; got {len(vectors)}. "
                "Keep your hand fully in view and try again."
            )
            return
        if len(face_vectors) < self._record_face_min_frames:
            self._set_status("Idle (record failed: face not detected)")
            self._set_hint(
                f"Need at least {self._record_face_min_frames} detected face frames; got {len(face_vectors)}. "
                "Make sure your face is visible while recording (owner-only)."
            )
            return

        # Average across frames reduces noise.
        avg_vec = mean_vector(vectors)
        wrist_var = variance_2d(wrist_points)
        avg_face = mean_vector(face_vectors)

        model = GestureModel(
            name=name,
            created_at=time.time(),
            feature_pairs=FEATURE_PAIRS,
            frame_vectors=vectors,
            avg_vector=avg_vec,
            record_wrist_var=wrist_var,
            owner_face_avg_vector=avg_face,
        )
        self.db.upsert(model)
        self._set_status("Idle")
        self._set_hint(f"Saved gesture '{name}' with {len(vectors)} frames.")

    def _monitor_step(
        self,
        vec: List[float],
        wrist_pt: Tuple[float, float],
        overlay_lines: List[str],
        live_face_vec: Optional[List[float]],
        face_pts: Optional[List[Tuple[float, float]]],
    ) -> None:
        if not live_face_vec:
            overlay_lines.append("Face required (owner-only).")
            self._set_hint("Show your face to allow detection.")
            self._match_started_at = None
            return

        gestures = self.db.load_all()
        if not gestures:
            overlay_lines.append("No gestures saved yet.")
            self._set_hint("No gestures found. Record one first.")
            self._match_started_at = None
            return

        # Rolling window smooths jitter.
        window = 18
        self._recent_vectors.append(vec)
        self._recent_wrist_points.append(wrist_pt)
        if len(self._recent_vectors) > window:
            self._recent_vectors = self._recent_vectors[-window:]
        if len(self._recent_wrist_points) > window:
            self._recent_wrist_points = self._recent_wrist_points[-window:]

        smooth_vec = mean_vector(self._recent_vectors)
        wrist_var = variance_2d(self._recent_wrist_points)

        # Anti-spoof: require slight natural wrist motion.
        min_motion_var = 2.0e-5
        motion_ok = wrist_var >= min_motion_var
        overlay_lines.append(f"MotionVar: {wrist_var:.2e} ({'OK' if motion_ok else 'LOW'})")

        # Owner-only matching: only consider gestures whose recorder face matches.
        best_name = ""
        best_dist = 999.0
        best_face_dist = 999.0

        # Distance threshold controls sensitivity; lower is stricter.
        dist_threshold = 0.42
        face_threshold = 0.22

        for name, model in gestures.items():
            if not model.avg_vector:
                continue
            if not model.owner_face_avg_vector:
                continue
            d_face = l2_distance(live_face_vec, model.owner_face_avg_vector)
            if d_face > face_threshold:
                continue
            d = l2_distance(smooth_vec, model.avg_vector)
            if d < best_dist:
                best_dist = d
                best_name = name
                best_face_dist = d_face

        if best_name:
            overlay_lines.append(f"Best: {best_name}")
            self._set_hint(f"Best match: {best_name}")
        else:
            self._set_hint("No matching owner face + gesture yet.")

        # Fast detection (no percentage shown). Still require a short hold + natural motion.
        required_seconds = 0.8
        match_ok = best_name != "" and (best_dist <= dist_threshold)

        if match_ok and motion_ok:
            if self._match_started_at is None:
                self._match_started_at = time.time()
            elapsed = time.time() - self._match_started_at
            overlay_lines.append(f"Hold... {elapsed:.1f}/{required_seconds:.1f}s")
            if elapsed >= required_seconds:
                # Cooldown prevents repeated prints while holding the pose.
                cooldown_s = 2.0
                now = time.time()
                if (now - self._last_detection_at) >= cooldown_s:
                    self._last_detection_at = now
                    self._trigger_detected(best_name)
                self._match_started_at = None
        else:
            self._match_started_at = None

    def _trigger_detected(self, name: str) -> None:
        print(f"GESTURE DETECTED: {name}")
        self._set_status("Gesture Detected")
        self._set_hint(f"Detected: {name}")
        # Keep monitoring, but require re-hold for next detection.

    @staticmethod
    def _draw_overlay(frame, lines: List[str]) -> None:
        y = 28
        for line in lines[:8]:
            cv2.putText(
                frame,
                line,
                (12, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.72,
                (20, 255, 20),
                2,
                cv2.LINE_AA,
            )
            y += 28


def main() -> None:
    app = GestureApp()
    app.mainloop()


if __name__ == "__main__":
    main()
