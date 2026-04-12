import sounddevice as sd
import numpy as np
import librosa
import matplotlib.pyplot as plt
import time

# ─────────────────────────────────────────
#  AURA SHIELD — Voice Liveness Engine
#  Detects real human voice vs AI clones
#  FIXED: Now properly detects liveness, not content matching
# ─────────────────────────────────────────

SAMPLERATE = 22050
DURATION = 4
N_MFCC = 40

# ── Thresholds ──
THRESHOLD_REAL = 0.76      # Raised for stricter liveness detection (was 0.65)


def record_audio(prompt: str) -> np.ndarray:
    print(f"\n{prompt}")
    input("  Press Enter then speak clearly for 4 seconds...")
    print("  Recording... 🎙️")
    audio = sd.rec(
        int(DURATION * SAMPLERATE),
        samplerate=SAMPLERATE,
        channels=1,
        dtype="float32",
    )
    sd.wait()
    print("  Done recording.")
    return audio.flatten()


def get_spectrogram(y: np.ndarray) -> np.ndarray:
    s = librosa.stft(y)
    return librosa.amplitude_to_db(np.abs(s))


def get_mfcc(y: np.ndarray) -> np.ndarray:
    mfcc = librosa.feature.mfcc(y=y, sr=SAMPLERATE, n_mfcc=N_MFCC)
    return np.mean(mfcc, axis=1)


def get_spectral_flatness(y: np.ndarray) -> float:
    flatness = librosa.feature.spectral_flatness(y=y)
    return float(np.mean(flatness))


def get_spectral_rolloff(y: np.ndarray) -> float:
    """AI voices often lack high frequency content."""
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=SAMPLERATE)
    return float(np.mean(rolloff))


def get_high_freq_energy(y: np.ndarray, cutoff=6000) -> float:
    """Real voices have energy above 6kHz; AI often cuts off."""
    stft = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=SAMPLERATE)
    # Find index where freq > cutoff Hz
    high_freq_mask = freqs > cutoff
    if not np.any(high_freq_mask):
        return 0.0
    high_energy = np.mean(stft[high_freq_mask, :])
    total_energy = np.mean(stft)
    if total_energy == 0:
        return 0.0
    return float(high_energy / total_energy)


def get_pitch_jitter(y: np.ndarray) -> float:
    f0, _, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=SAMPLERATE,
    )
    f0_clean = f0[~np.isnan(f0)]
    if len(f0_clean) < 5:
        return float("nan")
    # Relative jitter (percentage) - more robust than absolute
    jitter = float(np.mean(np.abs(np.diff(f0_clean))) / np.mean(f0_clean) * 100)
    return jitter


def get_shimmer(y: np.ndarray) -> float:
    """Amplitude variation - AI voices often too consistent."""
    f0, _, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=SAMPLERATE,
    )
    # Use amplitude envelope
    envelope = np.abs(y)
    # Normalize
    envelope = envelope / (np.max(envelope) + 1e-10)
    # Calculate variation (shimmer-like)
    shimmer = float(np.mean(np.abs(np.diff(envelope))))
    return shimmer


def check_liveness_jitter(jitter: float) -> float:
    """
    Human voices have natural jitter 0.5% - 2.5%.
    AI voices often < 0.3% (too smooth) or unnaturally consistent.
    """
    if np.isnan(jitter):
        return 0.5  # neutral

    if jitter < 0.3:      # AI signature
        return 0.0
    elif jitter < 0.5:
        return 0.3
    elif jitter <= 2.5:   # Human range
        return 1.0
    else:                 # Too erratic (replay attack over speaker noise)
        return 0.0


def check_liveness_flatness(flatness: float) -> float:
    """
    AI/TTS voices often have higher spectral flatness (more noise-like).
    Real voices have harmonic structure (lower flatness).
    """
    if flatness > 0.12:   # Too noise-like = AI
        return 0.1
    elif flatness > 0.08:
        return 0.3
    elif flatness > 0.05:
        return 0.6
    else:                 # Harmonic = human
        return 1.0


def check_high_freq_presence(energy_ratio: float) -> float:
    """Real voices have energy in high frequencies; AI often filters them."""
    if energy_ratio < 0.01:    # Missing high freq - AI indicator
        return 0.0
    elif energy_ratio < 0.03:  # Reduced high freq
        return 0.4
    else:                      # Good high freq content
        return 1.0


def check_shimmer(shimmer: float) -> float:
    """Human voices have natural amplitude variation."""
    # Normalized shimmer values
    if shimmer < 0.005:   # Too consistent = AI
        return 0.1
    elif shimmer < 0.01:  # Borderline
        return 0.5
    else:                 # Normal range
        return 1.0


def compute_trust_score(
    jitter_score: float,
    flatness_score: float,
    high_freq_score: float,
    shimmer_score: float,
    mfcc_baseline_match: float,
) -> float:
    """
    LIVENESS detection weights:
    - Prioritize features that indicate biological speech production
    - MFCC match is secondary (identity, not liveness)
    """
    weights = {
        "jitter": 0.40,      # Most important for liveness
        "high_freq": 0.25,   # AI can't fake this easily
        "flatness": 0.20,    # Harmonic structure
        "shimmer": 0.10,     # Breath variation
        "mfcc_match": 0.05,  # Identity only, not liveness
    }

    score = (
        weights["jitter"] * jitter_score
        + weights["flatness"] * flatness_score
        + weights["high_freq"] * high_freq_score
        + weights["shimmer"] * shimmer_score
        + weights["mfcc_match"] * mfcc_baseline_match
    )
    final_score = float(np.clip(score, 0.0, 1.0))

    # STRICT METRIC VETO (User rule: anything < 0.65 means instant AI clone)
    if min(jitter_score, flatness_score, high_freq_score, shimmer_score) < 0.65:
        return min(final_score, 0.40)  # Tank score below threshold to force AI verdict
        
    return final_score


def verdict(score: float) -> str:
    if score >= THRESHOLD_REAL:
        return "VERIFIED - REAL HUMAN VOICE"
    elif score >= 0.45:
        return "UNCERTAIN - NEEDS REVIEW"
    return "FAKE - AI CLONE / SYNTHETIC VOICE"


def show_plot(
    baseline_spec: np.ndarray,
    test_spec: np.ndarray,
    score: float,
    result: str,
    scores: dict,
) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(14, 4))
    fig.suptitle(f"AURA SHIELD — {result}  |  Trust Score: {score:.3f}", fontsize=13)

    axes[0].imshow(baseline_spec, aspect="auto", origin="lower", cmap="magma")
    axes[0].set_title("Enrolled Voice")
    axes[0].set_xlabel("Time")
    axes[0].set_ylabel("Frequency")

    axes[1].imshow(test_spec, aspect="auto", origin="lower", cmap="magma")
    axes[1].set_title("Test Voice")
    axes[1].set_xlabel("Time")

    labels = ["Jitter\n(Liveness)", "Flatness\n(Harmonic)", "High Freq\n(Presence)",
              "Shimmer\n(Variation)", "MFCC Match\n(Identity)"]
    values = [
        scores["jitter"],
        scores["flatness"],
        scores["high_freq"],
        scores["shimmer"],
        scores["mfcc_match"],
    ]
    colors = ["#4CAF50" if v >= 0.7 else "#FF5722" if v < 0.5 else "#FF9800" for v in values]
    axes[2].barh(labels, values, color=colors)
    axes[2].set_xlim(0, 1)
    axes[2].axvline(x=0.7, color="green", linestyle="--", linewidth=1)
    axes[2].axvline(x=0.5, color="red", linestyle="--", linewidth=1)
    axes[2].set_title("Liveness Features")
    axes[2].legend(["Real threshold", "Fake threshold"], fontsize=8)

    plt.tight_layout()
    plt.show(block=False)
    plt.pause(0.001)


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("   AURA SHIELD — Voice Liveness Engine")
    print("   FIXED: Detects human biological signals, not content")
    print("=" * 55)
    print("\nSTEP 1: Enroll your voice (for identity reference only)")
    print("   Speak: 'My name is [name] and this is my real voice'")

    baseline_audio = record_audio("ENROLLING voice baseline")
    baseline_spec = get_spectrogram(baseline_audio)
    baseline_mfcc = get_mfcc(baseline_audio)

    print("\nBaseline enrolled successfully.")
    print("   This is for identity matching, NOT liveness detection.")
    print("\n" + "-" * 55)

    test_num = 0
    while True:
        test_num += 1
        print(f"\nSTEP 2 — Test #{test_num}")
        print("   Speak naturally (any content is fine)")

        test_audio = record_audio("Testing voice now")
        test_spec = get_spectrogram(test_audio)

        # Extract liveness features
        test_jitter = get_pitch_jitter(test_audio)
        test_flatness = get_spectral_flatness(test_audio)
        test_high_freq = get_high_freq_energy(test_audio)
        test_shimmer = get_shimmer(test_audio)
        test_mfcc = get_mfcc(test_audio)

        # Calculate liveness scores (NOT comparing to baseline)
        s_jitter = check_liveness_jitter(test_jitter)
        s_flatness = check_liveness_flatness(test_flatness)
        s_high_freq = check_high_freq_presence(test_high_freq)
        s_shimmer = check_shimmer(test_shimmer)

        # MFCC similarity (cosine) - for identity, not liveness
        mfcc_dot = np.dot(baseline_mfcc, test_mfcc)
        mfcc_norms = np.linalg.norm(baseline_mfcc) * np.linalg.norm(test_mfcc)
        s_mfcc = float(np.clip(mfcc_dot / (mfcc_norms + 1e-10), 0.0, 1.0))

        scores = {
            "jitter": s_jitter,
            "flatness": s_flatness,
            "high_freq": s_high_freq,
            "shimmer": s_shimmer,
            "mfcc_match": s_mfcc,
        }

        trust = compute_trust_score(s_jitter, s_flatness, s_high_freq, s_shimmer, s_mfcc)
        result = verdict(trust)

        print("\n" + "=" * 55)
        print(f"  {result}")
        print(f"  Trust Score : {trust:.3f}  ({trust*100:.1f}%)")
        print("-" * 55)
        print(f"  Jitter      : {s_jitter:.3f}  (raw: {test_jitter:.3f}%)")
        print(f"  Flatness    : {s_flatness:.3f}  (raw: {test_flatness:.5f})")
        print(f"  High Freq   : {s_high_freq:.3f}  (raw: {test_high_freq:.5f})")
        print(f"  Shimmer     : {s_shimmer:.3f}  (raw: {test_shimmer:.5f})")
        print(f"  MFCC Match  : {s_mfcc:.3f}  (identity check)")
        print("=" * 55)

        if trust < THRESHOLD_REAL:
            print("\n  DIAGNOSTIC WARNINGS:")
            if s_jitter < 0.4:
                print("  ⚠️  Jitter too low — voice is unnaturally smooth")
            if s_flatness < 0.4:
                print("  ⚠️  Too noise-like — possible synthesis")
            if s_high_freq < 0.4:
                print("  ⚠️  Missing high frequencies — AI filtering suspected")
            if s_shimmer < 0.4:
                print("  ⚠️  Amplitude too consistent — robotic signature")

        show_plot(baseline_spec, test_spec, trust, result, scores)
        time.sleep(0.5)
