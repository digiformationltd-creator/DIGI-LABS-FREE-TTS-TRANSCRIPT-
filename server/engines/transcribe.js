/**
 * Transcription — audio or video in, text out.
 *
 * Two ways in, and they are genuinely different jobs:
 *
 *   A FILE the person has. FFmpeg strips it to 16 kHz mono WAV first, because
 *   faster-whisper wants that and handing it an MP4 means it does the same work
 *   less predictably.
 *
 *   A LINK. yt-dlp pulls ONLY the audio stream — not the video. That is the
 *   whole trick: a two-hour recording is a few megabytes of audio and hundreds
 *   of megabytes of pictures nobody is going to transcribe.
 *
 * The model runs locally, so there is no key, no quota and no upload. It is
 * downloaded once on first use, which is why the first transcription is slow
 * and every one after it is not — worth saying in the UI rather than letting
 * someone think it has hung.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Bigger is more accurate and slower. "base" is the balance that handles Urdu,
// Hindi and English acceptably; "small" is a real step up for accented speech.
const MODELS = [
  { id: "tiny", label: "Tiny — fastest, roughest", size: "~75 MB" },
  { id: "base", label: "Base — balanced (recommended)", size: "~145 MB" },
  { id: "small", label: "Small — slower, clearer", size: "~480 MB" },
  { id: "medium", label: "Medium — slowest, best", size: "~1.5 GB" },
];

function run(cmd, args, label, timeoutMs, onLine) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { windowsHide: true });
    let out = "", err = "";
    c.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      if (onLine) for (const line of s.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    });
    c.stderr.on("data", (d) => {
      const s = d.toString();
      err += s.slice(-1200);
      if (onLine) for (const line of s.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    });
    const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } reject(new Error(`${label} timed out.`)); }, timeoutMs);
    c.on("error", reject);
    c.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) return resolve(out);
      reject(new Error(`${label} failed. ${(err.trim().split(/\r?\n/).pop() || "").slice(0, 200)}`));
    });
  });
}

/** Strip any media file to the shape the model wants. */
async function toWav(ffmpeg, inputPath) {
  const wav = path.join(os.tmpdir(), `digistt_${Date.now()}.wav`);
  await run(ffmpeg, ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", wav], "Audio extraction", 600000);
  return wav;
}

/**
 * Transcribe a local file.
 * @returns {Promise<{text: string, model: string}>}
 */
async function fromFile({ inputPath, model, language, python, ffmpeg, pyDir, onStage }) {
  if (!python) throw new Error("Transcription needs the studio's Python.");
  if (!ffmpeg) throw new Error("FFmpeg is missing — it extracts the audio.");
  const script = path.join(pyDir, "stt_file.py");
  if (!fs.existsSync(script)) throw new Error("The transcription engine file is missing.");

  const pick = MODELS.some((m) => m.id === model) ? model : "base";
  onStage && onStage("Extracting the audio", 20);
  const wav = await toWav(ffmpeg, inputPath);

  try {
    onStage && onStage("Transcribing — the first run also downloads the model", 50);
    const args = [script, wav, pick];
    if (language) args.push(language);
    const text = await run(python, args, "Transcription", 1800000);
    const clean = String(text || "").trim();
    if (!clean || clean.startsWith("ERR:")) {
      throw new Error(clean.startsWith("ERR:") ? clean.slice(4).trim() : "Nothing was transcribed.");
    }
    return { text: clean, model: pick };
  } finally {
    try { fs.unlinkSync(wav); } catch { /* temp */ }
  }
}

/**
 * Transcribe from a link. yt-dlp takes the audio only.
 * @returns {Promise<{text: string, model: string}>}
 */
async function fromUrl({ url, model, python, pyDir, onStage }) {
  if (!python) throw new Error("Transcription needs the studio's Python.");
  const script = path.join(pyDir, "media_transcribe.py");
  if (!fs.existsSync(script)) throw new Error("The media transcription engine file is missing.");
  if (!/^https?:\/\//i.test(url)) throw new Error("That does not look like a link.");

  const pick = MODELS.some((m) => m.id === model) ? model : "base";
  onStage && onStage("Fetching the audio track", 25);

  // yt-dlp prints its progress to stderr; the percentage is worth surfacing
  // because a long download with a silent UI reads as a hang.
  let lastPct = 25;
  const text = await run(python, [script, url, pick], "Transcription", 2700000, (line) => {
    const m = /(\d{1,3}(?:\.\d)?)%/.exec(line);
    if (m && onStage) {
      const pct = 25 + Math.min(40, parseFloat(m[1]) * 0.4);
      if (pct > lastPct) { lastPct = pct; onStage("Fetching the audio track", pct); }
    } else if (/transcrib/i.test(line) && onStage) {
      onStage("Transcribing", 70);
    }
  });

  const clean = String(text || "").trim();
  if (!clean || clean.startsWith("ERR:")) {
    throw new Error(clean.startsWith("ERR:") ? clean.slice(4).trim() : "Nothing was transcribed.");
  }
  return { text: clean, model: pick };
}

module.exports = { fromFile, fromUrl, MODELS };
