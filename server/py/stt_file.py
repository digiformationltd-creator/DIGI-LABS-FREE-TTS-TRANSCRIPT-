"""
Transcribe a LOCAL audio file with faster-whisper — no download, no yt-dlp, no
urllib. Used by the dictation mic (/api/stt): the app records the mic, converts
the clip to wav, and calls this on the file path. Prints the transcript to stdout
(or an "ERR: ..." line the server turns into a clean error).

  python stt_file.py <path-to-audio> [model_name]
"""
import sys
import os


def main():
    if len(sys.argv) < 2:
        print("ERR: no file given")
        return
    path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WHISPER_MODEL", "base")
    if not os.path.exists(path):
        print("ERR: file not found")
        return
    try:
        from faster_whisper import WhisperModel
    except Exception as e:  # noqa: BLE001
        print("ERR: faster-whisper not installed: %s" % e)
        return
    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(path, beam_size=1)
        text = " ".join(s.text.strip() for s in segments).strip()
    except Exception as e:  # noqa: BLE001
        print("ERR: transcription failed: %s" % str(e)[:200])
        return
    print(text if text else "")


if __name__ == "__main__":
    main()
