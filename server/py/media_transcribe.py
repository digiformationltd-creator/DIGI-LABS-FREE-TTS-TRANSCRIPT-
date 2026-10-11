#!/usr/bin/env python3
"""
Digi Media Transcribe — the fallback for videos that have NO captions.

Instead of downloading the (possibly 25-hour) video, we pull ONLY the audio
stream with yt-dlp — that's tiny — then transcribe it locally with
faster-whisper. This is exactly the pipeline the user's other tool used:
yt-dlp (audio) → Whisper → text. Fully free & offline (after the model
downloads once).

Usage:  media_transcribe.py <video-url> [model]
        model defaults to "base" (good Hindi/English balance; "tiny" = faster).
Prints the transcript to stdout, or "ERR: ..." on failure.
"""
import os
import sys
import tempfile
import glob


def main():
    if len(sys.argv) < 2:
        print("ERR: usage: media_transcribe.py <url> [model]"); return
    url = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WHISPER_MODEL", "base")

    tmp = tempfile.mkdtemp(prefix="digi_media_")
    out_tmpl = os.path.join(tmp, "audio.%(ext)s")

    # 1) Grab ONLY the best audio stream (small), re-encode to 16k mono mp3.
    try:
        from yt_dlp import YoutubeDL
    except Exception as e:
        print("ERR: yt-dlp not installed: %s" % e); return
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        # The default web client gets 403 from datacenter IPs; the android/ios
        # players still serve the streams.
        "extractor_args": {"youtube": {"player_client": ["android", "ios", "web"]}},
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "64",
        }],
        "postprocessor_args": ["-ar", "16000", "-ac", "1"],
    }
    try:
        with YoutubeDL(opts) as ydl:
            ydl.download([url])
    except Exception as e:
        print("ERR: could not fetch audio: %s" % str(e)[:200]); return

    files = glob.glob(os.path.join(tmp, "audio.*"))
    audio = next((f for f in files if f.lower().endswith(".mp3")), files[0] if files else None)
    if not audio or not os.path.exists(audio):
        print("ERR: audio download produced no file."); return

    # 2) Transcribe locally with faster-whisper.
    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        print("ERR: faster-whisper not installed: %s" % e); return
    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(audio, beam_size=1)
        text = " ".join(s.text.strip() for s in segments).strip()
    except Exception as e:
        print("ERR: transcription failed: %s" % str(e)[:200]); return
    finally:
        for f in files:
            try: os.remove(f)
            except Exception: pass
        try: os.rmdir(tmp)
        except Exception: pass

    print(text if text else "(no speech detected)")


if __name__ == "__main__":
    main()
