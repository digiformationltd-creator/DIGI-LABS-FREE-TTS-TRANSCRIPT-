"""
noise_ai.py — AI-assisted SELECTIVE noise removal for Digi Biz OS.

Removes only the categories it is asked to, and leaves every other sound (the
speaker's own voice, app/button sounds, music) untouched.

  --voices 1   Other people's voices in the background. Speech is found with the
               Silero VAD model bundled with faster-whisper. Each speech segment's
               loudness is measured ONLY in the voice band (300–3400 Hz), so wind,
               rumble and hum can't make a distant voice look loud; segments that
               are clearly below the dominant (closest-to-mic) speaker are ducked.
  --knocks 1   Knocks, hammering, taps and clicks. Detected in the band above
               1.5 kHz where an impact's crack is broadband and sudden; tonal sounds
               (beeps, notification tones) are protected by low spectral flatness,
               the speaker's plosives are protected inside speech, and the low
               "thump" tail after an impact is ducked too.

Only needs numpy + faster-whisper (both present in the app's own Python) and the
stdlib `wave` module, so it runs identically on the owner and client builds.

Usage:  python noise_ai.py IN.wav OUT.wav --voices 0|1 --knocks 0|1 [--margin 12]
Input must be 16-bit PCM WAV (the server converts first). Prints one JSON report
line on success, or a line starting with "ERR:" on failure.
"""
import argparse
import json
import sys
import wave

import numpy as np


def read_wav(path):
    with wave.open(path, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError("expected 16-bit PCM wav")
    a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    return a.reshape(-1, ch), sr


def write_wav(path, a, sr):
    pcm = (np.clip(a, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(a.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def to_16k(mono, sr):
    if sr == 16000:
        return mono.astype(np.float32)
    ratio = sr / 16000.0
    k = int(round(ratio))
    if k > 1:  # boxcar low-pass before decimation (enough for VAD)
        mono = np.convolve(mono, np.ones(k, dtype=np.float32) / k, mode="same")
    idx = np.arange(0, len(mono), ratio)
    return np.interp(idx, np.arange(len(mono)), mono).astype(np.float32)


def gain_envelope(n, spans, depth_db, ramp):
    """1.0 everywhere, `depth_db` inside spans, with linear ramps at the edges."""
    g = np.ones(n, dtype=np.float32)
    floor = np.float32(10 ** (depth_db / 20.0))
    for s, e in spans:
        s, e = max(0, int(s)), min(n, int(e))
        if e <= s:
            continue
        g[s:e] = np.minimum(g[s:e], floor)
        rs = max(0, s - ramp)
        if s > rs:
            g[rs:s] = np.minimum(g[rs:s], np.linspace(1.0, floor, s - rs, dtype=np.float32))
        re_ = min(n, e + ramp)
        if re_ > e:
            g[e:re_] = np.minimum(g[e:re_], np.linspace(floor, 1.0, re_ - e, dtype=np.float32))
    return g


def speech_segments(mono16):
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(threshold=0.45, min_speech_duration_ms=180, min_silence_duration_ms=200, speech_pad_ms=40)
    return [(t["start"], t["end"]) for t in get_speech_timestamps(mono16, opts)]


def band_db(x, sr, lo, hi):
    """Loudness (dB) of x restricted to [lo, hi] Hz."""
    if len(x) < 64:
        return -120.0
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)).astype(np.float32))) ** 2
    freqs = np.fft.rfftfreq(len(x), 1.0 / sr)
    band = (freqs >= lo) & (freqs <= hi)
    return 10.0 * np.log10(float(np.sum(spec[band])) / len(x) + 1e-12)


def _bandlimit_16k(x, lo=200.0, hi=4000.0):
    """Zero-phase FFT band-limit (chunked) — strips wind/rumble before the VAD."""
    out = np.empty_like(x)
    chunk = 16000 * 30
    for s in range(0, len(x), chunk):
        seg = x[s:s + chunk]
        spec = np.fft.rfft(seg)
        f = np.fft.rfftfreq(len(seg), 1.0 / 16000)
        spec[(f < lo) | (f > hi)] = 0
        out[s:s + len(seg)] = np.fft.irfft(spec, n=len(seg)).astype(np.float32)
    return out


def quiet_speech_segments(mono16, main_segs16):
    """Second VAD pass for DISTANT voices the first pass misses. Everything outside
    the main speaker's speech is band-limited (wind/rumble removed) and quiet parts
    are lifted to a normal level, then speech is searched for there."""
    x = _bandlimit_16k(mono16)
    keep = np.ones(len(x), dtype=bool)
    pad = int(0.15 * 16000)
    for s, e in main_segs16:
        keep[max(0, s - pad):min(len(x), e + pad)] = False
    x = np.where(keep, x, 0.0).astype(np.float32)
    frame, target = 8000, 0.05  # 0.5 s frames lifted towards a normal speech level
    gains = np.ones(len(x), dtype=np.float32)
    for s in range(0, len(x), frame):
        seg = x[s:s + frame]
        rms = float(np.sqrt(np.mean(seg * seg)) + 1e-9)
        gains[s:s + frame] = min(30.0, max(1.0, target / rms)) if rms > 1e-4 else 1.0
    gains = np.convolve(gains, np.ones(1600, dtype=np.float32) / 1600, mode="same")
    y = np.clip(x * gains, -1.0, 1.0).astype(np.float32)
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(threshold=0.4, min_speech_duration_ms=300, min_silence_duration_ms=250, speech_pad_ms=60)
    segs = [(t["start"], t["end"]) for t in get_speech_timestamps(y, opts)]
    return [(s, e) for s, e in segs if keep[min(len(keep) - 1, (s + e) // 2)]]


def _subtract(spans, blocks):
    """Remove every [bs, be) block from the [s, e) spans."""
    out = []
    for s, e in spans:
        cur = [(s, e)]
        for bs, be in blocks:
            nxt = []
            for cs, ce in cur:
                if be <= cs or bs >= ce:
                    nxt.append((cs, ce))
                else:
                    if bs > cs:
                        nxt.append((cs, bs))
                    if be < ce:
                        nxt.append((be, ce))
            cur = nxt
        out.extend(cur)
    return out


def tonal_blocks(mono, sr, s, e):
    """Steady pure tones inside [s, e) — beeps, notification and app sounds. One
    frequency sticking far out of the spectrum and holding still for ≥ ~80 ms is a
    tone, not speech, so these stretches are always left untouched."""
    win, hop = int(0.04 * sr), int(0.02 * sr)
    x = mono[s:e]
    if len(x) < win:
        return []
    freqs = np.fft.rfftfreq(win, 1.0 / sr)
    band = (freqs >= 300) & (freqs <= 4000)
    bf = freqs[band]
    w = np.hanning(win).astype(np.float32)
    peaks, tonal = [], []
    for i in range(0, len(x) - win + 1, hop):
        spec = np.abs(np.fft.rfft(x[i:i + win] * w))[band] ** 2 + 1e-12
        k = int(np.argmax(spec))
        peaks.append(float(bf[k]))
        # A tone puts almost ALL its energy in one spot; a voice spreads it over
        # several harmonics (f0, 2f0, 3f0 …). A "how tall is the peak" test fails on a
        # quiet floor (a distant voice then towers over silence), so measure how much
        # of the band's energy sits right around the single strongest peak instead.
        lo_k, hi_k = max(0, k - 2), min(len(spec), k + 3)
        tonal.append(float(spec[lo_k:hi_k].sum()) / float(spec.sum()) > 0.7)
    blocks, j = [], 0
    while j < len(tonal):
        if not tonal[j]:
            j += 1
            continue
        k = j
        while k + 1 < len(tonal) and tonal[k + 1] and abs(peaks[k + 1] - peaks[j]) <= 10.0:
            k += 1
        if k - j + 1 >= 3:
            blocks.append((s + j * hop - int(0.03 * sr), s + k * hop + win + int(0.03 * sr)))
        j = k + 1
    return blocks


def background_voice_spans(mono, sr, segs16, margin_db, mono16=None):
    """Other people's speech: (a) detected speech segments clearly quieter than the
    main speaker, plus (b) distant speech the first VAD pass missed entirely."""
    segs = [(int(s * sr / 16000), int(e * sr / 16000)) for s, e in segs16]
    segs = [(s, e) for s, e in segs if e - s >= int(0.15 * sr)]
    win = int(0.4 * sr)
    seg_level, all_windows = [], []
    for s, e in segs:
        levels = [band_db(mono[w:min(e, w + win)], sr, 300, 3400)
                  for w in range(s, e, win) if min(e, w + win) - w >= int(0.15 * sr)]
        if not levels:
            continue
        all_windows.extend(levels)
        seg_level.append((s, e, float(np.median(levels))))
    if not all_windows:
        return [], None
    ref = float(np.percentile(all_windows, 85))  # the closest / dominant speaker
    spans = [(s, e) for s, e, lvl in seg_level if len(seg_level) >= 2 and lvl < ref - margin_db]
    if mono16 is not None:
        try:
            for s16, e16 in quiet_speech_segments(mono16, segs16):
                s, e = int(s16 * sr / 16000), int(e16 * sr / 16000)
                chunk = mono[s:e]
                if len(chunk) < int(0.25 * sr):
                    continue
                if band_db(chunk, sr, 300, 3400) < ref - margin_db:
                    spans.append((s, e))
        except Exception:
            pass
    # Cover each whole background utterance incl. its room echo, join close pieces,
    # then carve out the main speaker's speech and any steady tone (beeps, app
    # sounds) so those are never touched.
    pad_pre, pad_post, gap = int(0.2 * sr), int(0.35 * sr), int(0.4 * sr)
    spans = sorted((max(0, s - pad_pre), min(len(mono), e + pad_post)) for s, e in spans)
    merged = []
    for s, e in spans:
        if merged and s - merged[-1][1] <= gap:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    guard = int(0.05 * sr)
    main_blocks = [(max(0, s - guard), e + guard) for s, e, lvl in seg_level if lvl >= ref - margin_db]
    out = []
    for piece in _subtract(merged, main_blocks):
        for ps, pe in _subtract([piece], tonal_blocks(mono, sr, piece[0], piece[1])):
            if pe - ps >= int(0.08 * sr):
                out.append((ps, pe))
    return out, ref


def knock_spans(mono, sr, segs16):
    """Sudden broadband bursts above 1.5 kHz; tonal sounds and plosives protected."""
    hop, win = max(1, int(0.005 * sr)), int(0.02 * sr)
    n = len(mono)
    frames = (n - win) // hop
    if frames < 20:
        return []
    window = np.hanning(win).astype(np.float32)
    freqs = np.fft.rfftfreq(win, 1.0 / sr)
    hi = freqs >= 1500.0
    energy = np.empty(frames, dtype=np.float32)
    flat = np.empty(frames, dtype=np.float32)
    for c0 in range(0, frames, 2000):
        c1 = min(frames, c0 + 2000)
        idx = np.arange(win)[None, :] + hop * np.arange(c0, c1)[:, None]
        spec = (np.abs(np.fft.rfft(mono[idx] * window[None, :], axis=1)) ** 2)[:, hi] + 1e-12
        energy[c0:c1] = 10.0 * np.log10(np.mean(spec, axis=1))
        flat[c0:c1] = np.exp(np.mean(np.log(spec), axis=1)) / np.mean(spec, axis=1)
    half = int(0.3 * sr / hop)  # local floor over ±300 ms
    padded = np.pad(energy, (half, half), mode="edge")
    floor = np.median(np.lib.stride_tricks.sliding_window_view(padded, 2 * half + 1), axis=1).astype(np.float32)

    in_speech = np.zeros(frames, dtype=bool)
    for s, e in segs16:
        fs, fe = int(s * sr / 16000) // hop, int(e * sr / 16000) // hop
        in_speech[max(0, fs):min(frames, fe)] = True

    onset = (energy > floor + 12.0) & (flat > 0.25)
    onset &= ~in_speech | ((energy > floor + 20.0) & (flat > 0.45))

    spans, i = [], 0
    max_len = int(0.4 * sr / hop)
    while i < frames:
        if not onset[i]:
            i += 1
            continue
        j = i
        while j < frames and energy[j] > floor[j] + 5.0 and j - i <= max_len:
            j += 1
        if j - i <= max_len:  # longer than 400 ms is not a knock — leave it alone
            tail = int((0.12 if not in_speech[i] else 0.04) * sr)  # cover the low "thump"
            spans.append((i * hop - int(0.003 * sr), j * hop + win + tail))
        i = j + 1
    return spans


def hum_prominence(x, sr, f0=50.0):
    """How sharply the mains-hum family (50/100/150 Hz) sticks out of its own
    neighbourhood, in dB. A hum is a pure tone, so even under loud wind/rumble it
    shows as a narrow spike; broadband noise does not. Welch-averaged long FFT
    (~0.7 Hz resolution) over up to 30 s."""
    seg = x[: min(len(x), sr * 30)].astype(np.float32)
    nfft = 1 << 16
    if len(seg) < nfft:
        seg = np.pad(seg, (0, nfft - len(seg)))
    win = np.hanning(nfft).astype(np.float32)
    acc, count = None, 0
    for s in range(0, len(seg) - nfft + 1, nfft // 2):
        p = np.abs(np.fft.rfft(seg[s:s + nfft] * win)) ** 2
        acc = p if acc is None else acc + p
        count += 1
    psd = acc / max(1, count)
    freqs = np.fft.rfftfreq(nfft, 1.0 / sr)
    best = -99.0
    for h in (1, 2, 3):
        f = f0 * h
        peak = psd[(freqs >= f - 0.8) & (freqs <= f + 0.8)]
        ring = psd[((freqs >= f - 8) & (freqs <= f - 2.5)) | ((freqs >= f + 2.5) & (freqs <= f + 8))]
        if peak.size and ring.size:
            best = max(best, 10.0 * np.log10(float(peak.max()) / (float(np.median(ring)) + 1e-20) + 1e-20))
    return float(best)


def analyze_metrics(mono, sr, segs16, margin_db, mono16=None):
    """Measurements the editor's AI reasons over (no audio is written)."""
    n = len(mono)
    mask = np.zeros(n, dtype=bool)
    for s, e in segs16:
        mask[int(s * sr / 16000):int(e * sr / 16000)] = True
    speech = mono[mask] if mask.sum() > sr * 0.3 else mono
    quiet = mono[~mask] if (~mask).sum() > sr * 0.5 else mono
    cap = lambda x: x[: min(len(x), sr * 60)]  # the first minute is enough to judge
    sp, qu = cap(speech), cap(quiet)
    rms = float(np.sqrt(np.mean(mono * mono)) + 1e-9)
    spans, _ = background_voice_spans(mono, sr, segs16, margin_db, mono16)
    return {
        "speech_ratio": round(float(mask.sum()) / max(1, n), 3),
        "background_voice_segments": len(spans),
        "background_voice_seconds": round(sum(e - s for s, e in spans) / sr, 2),
        # Narrow 50/100/150 Hz spike over its own neighbourhood (tone vs noise).
        "hum_prominence_db": round(hum_prominence(mono, sr), 1),
        "wind_low_vs_voice_db": round(max(band_db(qu, sr, 20, 120) - band_db(qu, sr, 300, 3400), band_db(sp, sr, 20, 120) - band_db(sp, sr, 300, 3400)), 1),
        "hiss_air_vs_speech_db": round(band_db(qu, sr, 4000, 8000) - band_db(sp, sr, 300, 3400), 1),
        "knocks": len(knock_spans(mono, sr, segs16)),
        "rms_db": round(20.0 * np.log10(rms), 1),
        "peak_db": round(20.0 * np.log10(float(np.max(np.abs(mono))) + 1e-9), 1),
        "clipping_ratio": round(float(np.mean(np.abs(mono) > 0.99)), 5),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp")
    ap.add_argument("out")
    ap.add_argument("--voices", default="0")
    ap.add_argument("--knocks", default="0")
    ap.add_argument("--margin", type=float, default=12.0)
    ap.add_argument("--analyze", default="0")
    args = ap.parse_args()
    want_voices, want_knocks = args.voices == "1", args.knocks == "1"

    a, sr = read_wav(args.inp)
    mono = a.mean(axis=1).astype(np.float32)
    n = len(mono)
    report = {"seconds": round(n / sr, 2)}

    segs16 = []
    mono16 = None
    try:
        mono16 = to_16k(mono, sr)
        segs16 = speech_segments(mono16)
    except Exception as ex:  # VAD unavailable → knocks still work, voices cannot
        report["vad_error"] = str(ex)[:160]
    report["speech_segments"] = len(segs16)

    if args.analyze == "1":
        report.update(analyze_metrics(mono, sr, segs16, args.margin, mono16))
        print(json.dumps(report))
        return

    g = np.ones(n, dtype=np.float32)
    if want_voices:
        if not segs16 and "vad_error" in report:
            report["voices"] = "skipped: speech detector unavailable"
        else:
            spans, _ref = background_voice_spans(mono, sr, segs16, args.margin, mono16)
            report["background_voice_segments"] = len(spans)
            report["background_voice_seconds"] = round(sum(e - s for s, e in spans) / sr, 2)
            g = np.minimum(g, gain_envelope(n, spans, -30.0, int(0.04 * sr)))
    if want_knocks:
        spans = knock_spans(mono, sr, segs16)
        report["knocks_removed"] = len(spans)
        g = np.minimum(g, gain_envelope(n, spans, -24.0, int(0.004 * sr)))

    write_wav(args.out, a * g[:, None], sr)
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERR: {exc}")
        sys.exit(1)
