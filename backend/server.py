"""
FastAPI WebSocket bridge for AURASHIELD.
Uses gesture_auth.py extractors + DB — no Tk camera loop; frames come from the browser.
"""
from __future__ import annotations

import asyncio
import base64
import json
import time
import io
import wave
import multiprocessing
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import voice_engine
from video_detection import _materialize_payload, _run_pipeline
import os
from fastapi import File, UploadFile, HTTPException

from kinesio_sos_only import (
    _open_face_tracker,
    _close_face_tracker,
    _get_face_pixel_coords,
    calculate_ear,
    BlinkTracker,
    FastTripleBlinkDetector,
    trigger_sos_email_async,
    LEFT_EYE,
    RIGHT_EYE,
    FAST_3_BLINK_EMAIL_COOLDOWN_SEC,
)

from gesture_auth import (
    FEATURE_PAIRS,
    FaceLandmarkExtractor,
    GestureDB,
    GestureModel,
    GESTURE_DB_PATH,
    HandLandmarkExtractor,
    WRIST,
    compute_feature_vector,
    face_feature_vector,
    l2_distance,
    mean_vector,
    variance_2d,
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/predict")
async def predict_video(video: UploadFile = File(...)) -> dict[str, Any]:
    temp_path, original_name = await _materialize_payload(video)
    try:
        if os.path.getsize(temp_path) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        return await asyncio.to_thread(_run_pipeline, temp_path, original_name)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def _spawn_plot(b_spec, t_spec, trust, res_str, scores_dict):
    import voice_engine
    voice_engine.show_plot(b_spec, t_spec, trust, res_str, scores_dict)


# ─────────────────────────────────────────────────────────────
#  SOS Session — wraps kinesio_sos_only per WebSocket client
# ─────────────────────────────────────────────────────────────
class SOSSession:
    """Runs blink-SOS detection on browser frames — no local camera."""

    def __init__(self) -> None:
        self._mode: Optional[str] = None
        self._face_mesh = None
        self._landmarker = None
        self._tracker: Optional[BlinkTracker] = None
        self._fast3: Optional[FastTripleBlinkDetector] = None
        self._ready = False

        self._in_cooldown = False
        self._cooldown_until: float = 0.0
        self._last_ear: float = 0.0
        self._frame_counter: int = 0

    def open(self) -> Optional[str]:
        try:
            self._mode, self._face_mesh, self._landmarker = _open_face_tracker()
            self._tracker = BlinkTracker()
            self._fast3 = FastTripleBlinkDetector()
            self._ready = True
            return None
        except Exception as e:
            return str(e)

    def close(self) -> None:
        try:
            if self._mode:
                _close_face_tracker(self._mode, self._face_mesh, self._landmarker)
        except Exception:
            pass
        self._ready = False

    def process_frame(self, frame_bgr: np.ndarray, ts_ms: int, location_str: str) -> List[Dict[str, Any]]:
        msgs: List[Dict[str, Any]] = []
        if not self._ready or frame_bgr is None:
            return msgs

        now = time.time()
        self._frame_counter += 1

        # Update cooldown state
        if self._in_cooldown:
            secs_left = max(0.0, self._cooldown_until - now)
            if secs_left <= 0:
                self._in_cooldown = False
                self._tracker = BlinkTracker()  # fresh tracker after cooldown
                msgs.append({"type": "sos_cooldown_end"})
            else:
                # Send countdown every ~30 frames (~1 s at 30fps)
                if self._frame_counter % 30 == 0:
                    msgs.append({"type": "sos_cooldown", "seconds_left": round(secs_left)})
            return msgs

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        h, w = frame_bgr.shape[:2]
        coords = _get_face_pixel_coords(self._mode, self._face_mesh, self._landmarker, rgb, ts_ms, w, h)

        if coords is not None:
            raw_ear = (calculate_ear(LEFT_EYE, coords) + calculate_ear(RIGHT_EYE, coords)) / 2.0
            self._last_ear = raw_ear

            # Emit EAR value every 5 frames for the UI widget
            if self._frame_counter % 5 == 0:
                msgs.append({"type": "sos_ear", "ear": float(round(raw_ear, 3))})

            blink_event = self._tracker.update(raw_ear, ts_ms)
            if blink_event:
                if self._fast3.feed(blink_event["time_ms"]):
                    # ── SOS TRIGGERED ──
                    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                    print(f"\n[🚨 SOS TRIGGERED] Alert at {timestamp} | Location: {location_str}")
                    trigger_sos_email_async(f"{timestamp} | {location_str}")

                    self._in_cooldown = True
                    self._cooldown_until = now + FAST_3_BLINK_EMAIL_COOLDOWN_SEC

                    msgs.append({
                        "type": "sos_triggered",
                        "timestamp": timestamp,
                        "location": location_str,
                        "cooldown_sec": FAST_3_BLINK_EMAIL_COOLDOWN_SEC,
                    })
        return msgs


def decode_jpeg_b64(data: str) -> Optional[np.ndarray]:
    if not data:
        return None
    head = data[:48] if len(data) > 48 else data
    if "base64," in head:
        data = data.split("base64,", 1)[1]
    elif "," in head:
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception:
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return frame


@app.get("/gestures")
def list_gestures() -> Dict[str, Any]:
    db = GestureDB(GESTURE_DB_PATH)
    gestures = db.load_all()
    out = []
    for _name, m in gestures.items():
        out.append(
            {
                "name": m.name,
                "created_at": m.created_at,
                "frame_count": len(m.frame_vectors),
            }
        )
    out.sort(key=lambda x: x["created_at"], reverse=True)
    return {"gestures": out}


class WebGestureSession:
    """Headless session: same geometry/owner logic as gesture_auth.GestureApp camera path."""

    def __init__(self) -> None:
        self.db = GestureDB(GESTURE_DB_PATH)
        self.hand: Optional[HandLandmarkExtractor] = None
        self.face: Optional[FaceLandmarkExtractor] = None
        self._extractors_ready = False

        self.monitoring = False
        self.recording = False
        self.record_name = ""

        self._record_end_time = 0.0
        self._record_started_at = 0.0
        self._record_target_frames = 45
        self._record_min_frames = 30
        self._record_vectors: List[List[float]] = []
        self._record_wrist_points: List[Tuple[float, float]] = []
        self._record_face_vectors: List[List[float]] = []
        self._record_face_min_frames = 20

        self._recent_vectors: List[List[float]] = []
        self._recent_wrist_points: List[Tuple[float, float]] = []
        self._match_started_at: Optional[float] = None
        self._last_detection_at = 0.0
        self._deny_streak = 0
        self._last_denied_at = 0.0

        # Monotonic timeline for MediaPipe VIDEO mode (wall clock can repeat / jump between frames).
        self._mp_ts_ms = 0
        self._record_status_tick = 0
        self._mon_idle_tick = 0
        self._mon_no_face_tick = 0
        self._last_hold_line = ""

    def ensure_extractors(self) -> Optional[str]:
        if self._extractors_ready:
            return None
        try:
            self.hand = HandLandmarkExtractor()
            self.face = FaceLandmarkExtractor()
            self.hand.open()
            self.face.open()
            self._extractors_ready = True
            return None
        except Exception as e:
            return str(e)

    def close(self) -> None:
        try:
            if self.hand is not None:
                self.hand.close()
        except Exception:
            pass
        try:
            if self.face is not None:
                self.face.close()
        except Exception:
            pass
        self.hand = None
        self.face = None
        self._extractors_ready = False

    def start_record(self, name: str) -> None:
        self.recording = True
        self.monitoring = False
        self.record_name = name.strip()
        self._record_vectors = []
        self._record_wrist_points = []
        self._record_face_vectors = []
        self._record_started_at = time.time()
        self._record_end_time = self._record_started_at + 4.5
        self._record_status_tick = 0

    def start_monitor(self) -> None:
        self.monitoring = True
        self.recording = False
        self._match_started_at = None
        self._recent_vectors = []
        self._recent_wrist_points = []
        self._deny_streak = 0
        self._mon_idle_tick = 0
        self._mon_no_face_tick = 0
        self._last_hold_line = ""

    def stop_all(self) -> None:
        self.monitoring = False
        self.recording = False

    def _finish_recording_messages(self) -> List[Dict[str, Any]]:
        msgs: List[Dict[str, Any]] = []
        self.recording = False
        name = self.record_name
        vectors = self._record_vectors[:]
        wrist_points = self._record_wrist_points[:]
        face_vectors = self._record_face_vectors[:]

        if len(vectors) < self._record_min_frames:
            msgs.append(
                {
                    "type": "status",
                    "message": f"ERROR: Insufficient frames — need {self._record_min_frames}, got {len(vectors)}",
                    "frames_recorded": len(vectors),
                    "target_frames": self._record_target_frames,
                }
            )
            return msgs

        if len(face_vectors) < self._record_face_min_frames:
            msgs.append(
                {
                    "type": "status",
                    "message": f"ERROR: Face biometric insufficient — need {self._record_face_min_frames} frames",
                    "frames_recorded": len(vectors),
                    "target_frames": self._record_target_frames,
                }
            )
            return msgs

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
        msgs.append(
            {
                "type": "status",
                "message": f"SIGNATURE '{name}' ENCODED ✓",
                "gesture_name": name,
                "frames_recorded": len(vectors),
                "target_frames": self._record_target_frames,
            }
        )
        return msgs

    def process_frame(self, frame_bgr: np.ndarray) -> List[Dict[str, Any]]:
        msgs: List[Dict[str, Any]] = []
        if not self._extractors_ready or frame_bgr is None:
            return msgs
        if not self.recording and not self.monitoring:
            return msgs

        frame = cv2.flip(frame_bgr, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        now_ms = int(time.time() * 1000)
        if now_ms <= getattr(self, "_last_ts_ms", 0):
            now_ms = getattr(self, "_last_ts_ms", 0) + 1
        self._last_ts_ms = now_ms
        ts_ms = now_ms

        pts = self.hand.extract_xy(rgb, ts_ms) if self.hand else None
        face_pts = self.face.extract_xy(rgb, ts_ms) if self.face else None

        now = time.time()
        live_face_vec = face_feature_vector(face_pts) if face_pts else None
        face_ok = bool(face_pts)

        motion_var = 0.0
        match_dist = 999.0
        display_name = ""
        hold_progress = 0.0

        if self.recording:
            if face_pts:
                self._record_face_vectors.append(face_feature_vector(face_pts))
            remaining = max(0.0, self._record_end_time - now)
            if pts:
                vec = compute_feature_vector(pts)
                wrist_pt = pts[WRIST]
                self._record_vectors.append(vec)
                self._record_wrist_points.append(wrist_pt)
                self._record_status_tick += 1
                if self._record_status_tick % 2 == 0 or len(self._record_vectors) >= self._record_target_frames:
                    msgs.append(
                        {
                            "type": "status",
                            "message": f"RECORDING FRAME {len(self._record_vectors)}/{self._record_target_frames}...",
                            "frames_recorded": len(self._record_vectors),
                            "target_frames": self._record_target_frames,
                        }
                    )
                if len(self._record_vectors) >= self._record_target_frames:
                    msgs.extend(self._finish_recording_messages())
                elif now >= self._record_end_time:
                    msgs.extend(self._finish_recording_messages())
            else:
                self._record_status_tick += 1
                if self._record_status_tick % 4 == 0 or remaining <= 0.3:
                    msgs.append(
                        {
                            "type": "status",
                            "message": f"AWAITING HAND SIGNATURE... ({remaining:.1f}s)",
                            "frames_recorded": len(self._record_vectors),
                            "target_frames": self._record_target_frames,
                        }
                    )
                if now >= self._record_end_time:
                    msgs.extend(self._finish_recording_messages())

            motion_var = variance_2d(self._record_wrist_points) if self._record_wrist_points else 0.0
            msgs.append(
                {
                    "type": "metrics",
                    "motion_var": motion_var,
                    "match_dist": match_dist,
                    "face_ok": face_ok,
                    "gesture_name": display_name,
                    "hold_progress": hold_progress,
                }
            )
            return msgs

        if self.monitoring:
            if not pts:
                self._match_started_at = None
                self._recent_vectors = []
                self._recent_wrist_points = []
                self._deny_streak = 0
                msgs.append(
                    {
                        "type": "metrics",
                        "motion_var": 0.0,
                        "match_dist": 999.0,
                        "face_ok": face_ok,
                        "gesture_name": "",
                        "hold_progress": 0.0,
                    }
                )
                self._mon_idle_tick += 1
                if self._mon_idle_tick % 10 == 1:
                    msgs.append(
                        {
                            "type": "status",
                            "message": "MONITORING... (hand not in view)",
                        }
                    )
                return msgs

            vec = compute_feature_vector(pts)
            wrist_pt = pts[WRIST]
            self._mon_idle_tick = 0

            if not live_face_vec:
                self._match_started_at = None
                self._deny_streak = 0
                motion_var = variance_2d([wrist_pt]) if wrist_pt else 0.0
                msgs.append(
                    {
                        "type": "metrics",
                        "motion_var": motion_var,
                        "match_dist": 999.0,
                        "face_ok": False,
                        "gesture_name": "",
                        "hold_progress": 0.0,
                    }
                )
                self._mon_no_face_tick += 1
                if self._mon_no_face_tick % 12 == 1:
                    msgs.append(
                        {"type": "status", "message": "FACE LOCK: SEARCHING — show face (owner-only)"}
                    )
                return msgs

            self._mon_no_face_tick = 0

            gestures = self.db.load_all()
            if not gestures:
                msgs.append(
                    {
                        "type": "metrics",
                        "motion_var": 0.0,
                        "match_dist": 999.0,
                        "face_ok": True,
                        "gesture_name": "",
                        "hold_progress": 0.0,
                    }
                )
                msgs.append({"type": "status", "message": "No gestures in vault — record one first."})
                return msgs

            window = 18
            self._recent_vectors.append(vec)
            self._recent_wrist_points.append(wrist_pt)
            if len(self._recent_vectors) > window:
                self._recent_vectors = self._recent_vectors[-window:]
            if len(self._recent_wrist_points) > window:
                self._recent_wrist_points = self._recent_wrist_points[-window:]

            smooth_vec = mean_vector(self._recent_vectors)
            motion_var = variance_2d(self._recent_wrist_points)

            min_motion_var = 2.0e-5
            motion_ok = motion_var >= min_motion_var

            best_name = ""
            best_dist = 999.0
            best_face_dist = 999.0
            dist_threshold = 0.42
            face_threshold = 0.08

            raw_best_dist = 999.0
            for _n, model in gestures.items():
                if model.avg_vector:
                    d0 = l2_distance(smooth_vec, model.avg_vector)
                    raw_best_dist = min(raw_best_dist, d0)

            for name, model in gestures.items():
                if not model.avg_vector or not model.owner_face_avg_vector:
                    continue
                d_face = l2_distance(live_face_vec, model.owner_face_avg_vector)
                if d_face > face_threshold:
                    continue
                d = l2_distance(smooth_vec, model.avg_vector)
                if d < best_dist:
                    best_dist = d
                    best_name = name
                    best_face_dist = d_face

            match_dist = best_dist if best_name else raw_best_dist
            display_name = best_name

            required_seconds = 0.8
            match_ok = best_name != "" and (best_dist <= dist_threshold)

            if match_ok and motion_ok:
                if self._match_started_at is None:
                    self._match_started_at = time.time()
                elapsed = time.time() - self._match_started_at
                hold_progress = min(1.0, elapsed / required_seconds)
                hold_line = f"HOLD GESTURE... {elapsed:.1f}/{required_seconds:.1f}s"
                if hold_line != self._last_hold_line:
                    self._last_hold_line = hold_line
                    msgs.append({"type": "status", "message": hold_line})
                if elapsed >= required_seconds:
                    cooldown_s = 2.0
                    if (time.time() - self._last_detection_at) >= cooldown_s:
                        self._last_detection_at = time.time()
                        msgs.append(
                            {
                                "type": "detected",
                                "message": f"IDENTITY CONFIRMED: {best_name} ({best_dist:.2f} dist)",
                                "gesture_name": best_name,
                                "motion_var": motion_var,
                                "match_dist": best_dist,
                                "face_ok": True,
                            }
                        )
                    self._match_started_at = None
                self._deny_streak = 0
            else:
                self._match_started_at = None
                hold_progress = 0.0
                self._last_hold_line = ""
                # Access denied: stable hand + face + motion but no enrolled owner/gesture match
                if pts and live_face_vec and motion_ok and best_name == "":
                    self._deny_streak += 1
                else:
                    self._deny_streak = 0

                if (
                    self._deny_streak >= 55
                    and (time.time() - self._last_denied_at) > 3.0
                ):
                    self._last_denied_at = time.time()
                    self._deny_streak = 0
                    msgs.append(
                        {
                            "type": "denied",
                            "message": "ACCESS DENIED — face/gesture not enrolled",
                            "gesture_name": "",
                            "motion_var": motion_var,
                            "match_dist": match_dist,
                            "face_ok": True,
                        }
                    )

            msgs.append(
                {
                    "type": "metrics",
                    "motion_var": motion_var,
                    "match_dist": match_dist,
                    "face_ok": True,
                    "gesture_name": display_name,
                    "hold_progress": hold_progress,
                    "motion_ok": motion_ok,
                    "face_match_owner": bool(best_name),
                }
            )

        return msgs


@app.websocket("/ws/gesture")
async def gesture_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    session = WebGestureSession()
    sos = SOSSession()
    try:
        err = session.ensure_extractors()
        if err:
            await websocket.send_json(
                {"type": "status", "message": f"TRACKER INIT FAILED: {err}"}
            )

        sos_err = sos.open()
        if sos_err:
            await websocket.send_json(
                {"type": "status", "message": f"SOS TRACKER INIT FAILED: {sos_err}"}
            )
        else:
            await websocket.send_json({"type": "sos_ready", "message": "SOS MONITOR ARMED — blink 3x fast for emergency"})

        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = payload.get("action")
            name = (payload.get("name") or "").strip()
            frame_b64 = payload.get("frame")

            # Build location string from browser geolocation
            client_loc = payload.get("location") or {}
            if client_loc:
                lat = client_loc.get("lat", "?")
                lng = client_loc.get("lng", "?")
                acc = client_loc.get("accuracy", "N/A")
                location_str = f"Lat: {lat}, Lng: {lng} (±{acc}m)"
            else:
                location_str = "Unknown"

            if action == "stop":
                session.stop_all()
                await websocket.send_json({"type": "status", "message": "NEXUS IDLE"})
                continue

            if action == "record":
                if not name:
                    await websocket.send_json(
                        {"type": "status", "message": "ERROR: Enter a signature ID first"}
                    )
                    continue
                session.start_record(name)
                await websocket.send_json(
                    {
                        "type": "status",
                        "message": f"RECORDING '{name}' — hold steady",
                        "frames_recorded": 0,
                        "target_frames": 45,
                    }
                )

            if action == "monitor":
                session.start_monitor()
                await websocket.send_json({"type": "status", "message": "NEXUS MONITORING ONLINE"})

            if frame_b64 and session._extractors_ready:
                frame = decode_jpeg_b64(frame_b64)
                if frame is None:
                    await websocket.send_json({"type": "status", "message": "ERROR: Bad frame data"})
                    continue

                ts_ms = int(time.time() * 1000)

                # Send immediate ACK so UI knows backend isn't frozen
                await websocket.send_json({"type": "status", "message": "SCANNING..."})

                # Offload heavy Mediapipe math to background thread pool
                gesture_msgs = await asyncio.to_thread(session.process_frame, frame)
                
                # ── Gesture Auth ──
                if not sos._in_cooldown:
                    for msg in gesture_msgs:
                        await websocket.send_json(msg)

                # ── SOS Detection (parallel, same frame) ──
                sos_msgs = await asyncio.to_thread(sos.process_frame, frame, ts_ms, location_str)
                for msg in sos_msgs:
                    await websocket.send_json(msg)

                await asyncio.sleep(0)

    except WebSocketDisconnect:
        pass
    finally:
        session.close()
        sos.close()


@app.websocket("/ws/voice")
async def ws_voice(websocket: WebSocket):
    await websocket.accept()
    baseline_features = None
    audio_buffer = []
    mode = "idle"
    
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if "bytes" in message and mode in ("enroll", "test"):
                arr = np.frombuffer(message["bytes"], dtype=np.float32)
                audio_buffer.append(arr)
            if "text" in message:
                data = json.loads(message["text"])
                if data.get("action") == "enroll":
                    mode = "enroll"
                    audio_buffer = []
                elif data.get("action") == "test":
                    mode = "test"
                    audio_buffer = []
                elif data.get("action") == "stop":
                    if len(audio_buffer) > 0:
                        y = np.concatenate(audio_buffer)

                        if mode == "enroll":
                            print("\n" + "=" * 55)
                            print("   AURA SHIELD — Voice Liveness Engine")
                            print("=" * 55)
                            print("\nSTEP 1: Enroll voice (identity anchor only)")
                            # Store spectrogram for display + mfcc for identity cosine match
                            baseline_features = {
                                "spectrogram": voice_engine.get_spectrogram(y),
                                "mfcc": voice_engine.get_mfcc(y),
                            }
                            print("\nBaseline enrolled successfully from Web Client.")
                            print("   Identity anchor stored for MFCC cosine matching.")
                            print("\n" + "-" * 55)
                            await websocket.send_json({"type": "enrolled"})

                        elif mode == "test":
                            if not baseline_features:
                                await websocket.send_json({"type": "error", "message": "No baseline enrolled"})
                            else:
                                def _run_test(y_arr, b_features):
                                    # ── Extract liveness features from test audio ──────────────
                                    t_spec      = voice_engine.get_spectrogram(y_arr)
                                    t_jitter    = voice_engine.get_pitch_jitter(y_arr)
                                    t_flatness  = voice_engine.get_spectral_flatness(y_arr)
                                    t_high_freq = voice_engine.get_high_freq_energy(y_arr)
                                    t_shimmer   = voice_engine.get_shimmer(y_arr)
                                    t_mfcc      = voice_engine.get_mfcc(y_arr)

                                    # ── Liveness scores (biological signal checks) ─────────────
                                    s_jitter    = voice_engine.check_liveness_jitter(t_jitter)
                                    s_flatness  = voice_engine.check_liveness_flatness(t_flatness)
                                    s_high_freq = voice_engine.check_high_freq_presence(t_high_freq)
                                    s_shimmer   = voice_engine.check_shimmer(t_shimmer)

                                    # ── Identity: cosine similarity of MFCC vs baseline ───────
                                    b_mfcc     = b_features["mfcc"]
                                    mfcc_dot   = np.dot(b_mfcc, t_mfcc)
                                    mfcc_norms = np.linalg.norm(b_mfcc) * np.linalg.norm(t_mfcc)
                                    s_mfcc     = float(np.clip(mfcc_dot / (mfcc_norms + 1e-10), 0.0, 1.0))

                                    # ── Trust score + verdict ─────────────────────────────────
                                    trt    = voice_engine.compute_trust_score(s_jitter, s_flatness, s_high_freq, s_shimmer, s_mfcc)
                                    is_hum = trt >= voice_engine.THRESHOLD_REAL
                                    r_str  = voice_engine.verdict(trt)

                                    jitter_display = f"{t_jitter:.3f}" if not np.isnan(t_jitter) else "NaN"
                                    print("\n" + "=" * 55)
                                    print(f"  {r_str}")
                                    print(f"  Trust Score : {trt:.3f}  ({trt*100:.1f}%)")
                                    print("-" * 55)
                                    print(f"  Jitter      : {s_jitter:.3f}  (raw: {jitter_display}%)")
                                    print(f"  Flatness    : {s_flatness:.3f}  (raw: {t_flatness:.5f})")
                                    print(f"  High Freq   : {s_high_freq:.3f}  (raw: {t_high_freq:.5f})")
                                    print(f"  Shimmer     : {s_shimmer:.3f}  (raw: {t_shimmer:.5f})")
                                    print(f"  MFCC Match  : {s_mfcc:.3f}  (identity check)")
                                    print("=" * 55)

                                    if trt < voice_engine.THRESHOLD_REAL:
                                        print("  DIAGNOSTIC WARNINGS:")
                                        if s_jitter < 0.4:
                                            print("  ⚠️  Jitter too low — unnaturally smooth voice")
                                        if s_flatness < 0.4:
                                            print("  ⚠️  Too noise-like — possible synthesis")
                                        if s_high_freq < 0.4:
                                            print("  ⚠️  Missing high frequencies — AI filtering suspected")
                                        if s_shimmer < 0.4:
                                            print("  ⚠️  Amplitude too consistent — robotic signature")

                                    # ── Scores dict in new liveness format ───────────────────
                                    scores = {
                                        "jitter":     s_jitter,
                                        "flatness":   s_flatness,
                                        "high_freq":  s_high_freq,
                                        "shimmer":    s_shimmer,
                                        "mfcc_match": s_mfcc,
                                    }

                                    try:
                                        p = multiprocessing.Process(
                                            target=_spawn_plot,
                                            args=(b_features["spectrogram"], t_spec, trt, r_str, scores)
                                        )
                                        p.start()
                                    except Exception as e:
                                        print(f"Plot Error (non-fatal): {e}")

                                    # ── Micro-tremor label ────────────────────────────────────
                                    mt_val = "NEUTRAL"
                                    if not np.isnan(t_jitter):
                                        if s_jitter < 0.4 and t_jitter < 0.4:
                                            mt_val = "SYNTHETIC"
                                        elif t_jitter > 0.5:
                                            mt_val = "NATURAL"

                                    # ── JSON for frontend gauge ───────────────────────────────
                                    # confidence = (1 - trt)*100  → AI score (high = likely fake)
                                    return {
                                        "type": "result",
                                        "confidence": (1.0 - trt) * 100,
                                        "result": "human" if is_hum else "ai",
                                        "scores": {
                                            "spectrogram": s_mfcc * 100,
                                            "mfcc":        s_mfcc * 100,
                                            "flatness":    s_flatness * 100,
                                            "jitter":      s_jitter * 100,
                                        },
                                        "breakdown": {
                                            "jitter":     s_jitter * 100,
                                            "flatness":   s_flatness * 100,
                                            "high_freq":  s_high_freq * 100,
                                            "shimmer":    s_shimmer * 100,
                                            "mfcc_match": s_mfcc * 100,
                                            "microTremor": mt_val,
                                        }
                                    }

                                res_json = await asyncio.to_thread(_run_test, y, baseline_features)
                                await websocket.send_json(res_json)

                        audio_buffer = []
                        mode = "idle"

    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
