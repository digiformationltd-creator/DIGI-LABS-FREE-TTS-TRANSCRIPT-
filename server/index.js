/**
 * DIGI LABS — the studio server.
 *
 * One job: turn text into speech, well, and keep a record of it. Nothing else
 * lives here. It is deliberately not the Digi Biz OS server: no CRM, no agents,
 * no brain, no WhatsApp — the audio engines were worth keeping and the rest was
 * not.
 *
 * The front end speaks an async, job-based API, so a long narration can run for
 * minutes while the page shows which stage it reached. Two engines sit behind it:
 * Gemini for studio quality on short pieces (rate-limited per key) and Edge-TTS
 * for unlimited long-form work.
 */
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const gemini = require("./engines/gemini-tts");
const fx = require("./engines/audio-fx");
const stt = require("./engines/transcribe");
const jobsStore = require("./jobs");

const ROOT = path.join(__dirname, "..");
const WEB = path.join(ROOT, "web");
const DATA = process.env.DIGILABS_DATA || path.join(ROOT, "data");
const AUDIO = path.join(DATA, "audio");
const UPLOADS = path.join(DATA, "uploads");
const PY_DIR = path.join(__dirname, "py");
const PORT = Number(process.env.PORT || 4300);

// Load .env without a dependency: the studio ships as a desktop app and a
// missing file is normal on a first run, not an error.
(function loadEnv() {
  for (const p of [path.join(ROOT, ".env"), path.join(DATA, ".env")]) {
    try {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!m || line.trim().startsWith("#")) continue;
        const v = m[2].replace(/^["']|["']$/g, "");
        if (!process.env[m[1]]) process.env[m[1]] = v;
      }
    } catch { /* unreadable .env is not fatal */ }
  }
})();

// ── Tool discovery ───────────────────────────────────────────────────────────
// The studio prefers its OWN bundled tools, then whatever is on the PATH. It
// never silently pretends a tool exists: /api/engines reports the truth and the
// UI shows it, because "generate" failing with a stack trace is far worse than
// a button that says what is missing.
function findFirst(candidates) {
  for (const c of candidates) {
    if (!c) continue;
    try { if (fs.existsSync(c)) return c; } catch { /* keep looking */ }
  }
  return null;
}

function onPath(exe) {
  try { execFileSync(exe, ["-version"], { stdio: "ignore", windowsHide: true }); return exe; } catch { /* not there */ }
  try { execFileSync(exe, ["--version"], { stdio: "ignore", windowsHide: true }); return exe; } catch { /* not there */ }
  return null;
}

function python() {
  return findFirst([
    process.env.DIGILABS_PYTHON,
    path.join(DATA, "engines", "py", "python.exe"),
    path.join(ROOT, "engines", "py", "python.exe"),
  ]) || onPath("python") || onPath("py") || null;
}

function ffmpeg() {
  return findFirst([
    process.env.DIGILABS_FFMPEG,
    path.join(DATA, "engines", "bin", "ffmpeg.exe"),
    path.join(ROOT, "engines", "bin", "ffmpeg.exe"),
  ]) || onPath("ffmpeg") || null;
}

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(WEB));
fs.mkdirSync(AUDIO, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });
app.use("/api/audio", express.static(AUDIO, { maxAge: "1h" }));

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "DIGI LABS",
    version: require(path.join(ROOT, "package.json")).version,
    python: !!python(),
    ffmpeg: !!ffmpeg(),
    gemini_keys: gemini.keyCount(),
    edge_ready: false,
  });
});

// ── What can actually run right now ──────────────────────────────────────────
// Each engine reports `ready` plus, when it is not, the one sentence that says
// what to do about it. An engine card that is greyed out with no reason is the
// thing people file support tickets about.
app.get("/api/engines", (_req, res) => {
  const py = python();
  const ff = ffmpeg();
  const q = gemini.quota();
  res.json({
    ok: true,
    engines: [
      {
        id: "studio",
        name: "Studio Voice",
        subtitle: "Gemini · highest quality",
        kind: "cloud",
        ready: q.keys > 0 && !!ff && q.remaining > 0,
        reason: q.keys === 0 ? "No Gemini key yet — add one in Settings."
          : !ff ? "FFmpeg is missing — it converts the engine's raw audio."
          : q.remaining <= 0 ? "Today's allowance is used up. Add another key or use Free Voice."
          : "",
        voices: gemini.VOICES,
        styles: gemini.styleList(),
        quota: q,
        best_for: "Short, polished pieces — adverts, intros, product lines. Male voices only.",
      },
    ],
  });
});

app.get("/api/quota", (_req, res) => res.json({ ok: true, ...gemini.quota() }));

// ── Generate ─────────────────────────────────────────────────────────────────
// Answers 202 with a job id straight away and does the work behind it. The page
// polls /api/jobs/:id. Long text on the Studio engine is split into chunks,
// because that engine takes 8,000 characters per request and a chapter is more.
app.post("/api/generate", (req, res) => {
  const text = String(req.body && req.body.text || "").trim();
  const engineId = String(req.body && req.body.engine || "studio");
  if (!text) return res.status(400).json({ ok: false, message: "Type or paste some text first." });
  if (!["studio"].includes(engineId)) {
    return res.status(400).json({ ok: false, message: `Unknown engine "${engineId}".` });
  }

  const job = jobsStore.create({
    engine: engineId,
    engineName: "Studio Voice (Gemini)",
    text,
    voice: String(req.body.voice || ""),
    language: String(req.body.language || ""),
    style: String(req.body.style || ""),
    speed: Number(req.body.speed) || 1,
  });

  res.status(202).json({ job_id: job.job_id, status: job.status, stage: job.stage });

  // Deliberately not awaited: the response has already gone.
  void run(job).catch((e) => jobsStore.fail(job.job_id, e && e.message));
});

async function run(job) {
  const id = job.job_id;
  try {
    // Studio engine. Gemini accepts 8,000 characters per request, but a chunk
    // that large produces minutes of audio in one call and overruns the 120s
    // request timeout — measured: 1,500 chars is ~24s, so a 7,000-char chunk
    // does not come back in time. Chunks are kept to 2,500 so each call stays
    // well inside the limit, and the clips are joined with ffmpeg afterwards.
    // (For anything genuinely long, the Free engine is the right tool — it has
    // no per-request cap at all.) Splitting on sentence ends, not a hard count,
    // keeps a word from being cut in half at the seam.
    const ff = ffmpeg();
    if (!ff) throw new Error("FFmpeg is missing — it converts the engine's raw audio.");
    const chunks = splitForSpeech(job.text, 2500);
    const parts = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        jobsStore.stage(id, chunks.length > 1 ? `Speaking ${i + 1} of ${chunks.length}` : "Speaking",
                        10 + (i / chunks.length) * 75);
        const out = await gemini.speak({ text: chunks[i], voice: job.voice, style: job.style, ffmpeg: ff });
        job.voice = out.voice;
        const p = path.join(os.tmpdir(), `digilabs_${id}_${i}.mp3`);
        fs.writeFileSync(p, out.buffer);
        parts.push(p);
      }
      jobsStore.stage(id, "Joining the clips", 90);
      const buffer = parts.length === 1 ? fs.readFileSync(parts[0]) : await concat(ff, parts, id);
      jobsStore.finish(id, buffer, AUDIO);
    } finally {
      for (const p of parts) { try { fs.unlinkSync(p); } catch { /* temp */ } }
    }
  } catch (e) {
    jobsStore.fail(id, e && e.message);
  }
}

/** Split on sentence ends, never mid-word. Falls back to a hard cut only for a
 *  passage with no sentence breaks at all. */
function splitForSpeech(text, limit) {
  if (text.length <= limit) return [text];
  const out = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("۔"),
                       window.lastIndexOf("!"), window.lastIndexOf("?"), window.lastIndexOf("\n"));
    if (cut < limit * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = limit;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

function concat(ff, parts, id) {
  const list = path.join(os.tmpdir(), `digilabs_${id}.txt`);
  const out = path.join(os.tmpdir(), `digilabs_${id}_joined.mp3`);
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"), "utf-8");
  return new Promise((resolve, reject) => {
    const c = spawn(ff, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out], { windowsHide: true });
    c.on("error", reject);
    c.on("close", (code) => {
      try { fs.unlinkSync(list); } catch { /* temp */ }
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error("Could not join the clips."));
      const buf = fs.readFileSync(out);
      try { fs.unlinkSync(out); } catch { /* temp */ }
      resolve(buf);
    });
  });
}

// ── Job status ───────────────────────────────────────────────────────────────
app.get("/api/jobs/:id", (req, res) => {
  const j = jobsStore.get(req.params.id);
  if (!j) return res.status(404).json({ ok: false, message: "That job is no longer in the queue." });
  res.json({
    job_id: j.job_id, status: j.status, stage: j.stage, progress: j.progress,
    engine: j.engine, engine_display_name: j.engine_display_name, voice: j.voice,
    output_format: j.output_format, duration_seconds: j.duration_seconds,
    created_at: j.created_at, error: j.error,
    url: j.file ? `/api/audio/${j.file}` : null,
    transcript: j.transcript || null, model: j.model || null,
    output: j.output || null, markdown: j.markdown || null, promptJson: j.promptJson || null,
  });
});

// ── History ──────────────────────────────────────────────────────────────────
app.get("/api/history", (_req, res) => res.json({ ok: true, items: jobsStore.history(AUDIO) }));
app.delete("/api/history/:id", (req, res) => {
  const gone = jobsStore.remove(req.params.id, AUDIO);
  res.status(gone ? 200 : 404).json({ ok: gone });
});
app.delete("/api/history", (_req, res) => res.json({ ok: true, removed: jobsStore.clear(AUDIO) }));

// ── Upload ───────────────────────────────────────────────────────────────────
// A file arrives as a data URL from the page and is written to data/uploads.
// It is kept, not streamed through: the effects and transcription routes both
// need a real path on disk, and ffmpeg cannot seek a stream it is being fed.
app.post("/api/upload", (req, res) => {
  const dataUrl = String(req.body && req.body.dataUrl || "");
  const name = String(req.body && req.body.name || "clip");
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ ok: false, message: "That file could not be read." });
  const ext = (name.match(/\.([a-z0-9]{2,5})$/i) || [, "mp3"])[1].toLowerCase();
  const id = `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  try {
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length) return res.status(400).json({ ok: false, message: "That file is empty." });
    fs.writeFileSync(path.join(UPLOADS, id), buf);
    res.json({ ok: true, id, name, bytes: buf.length });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e && e.message || e).slice(0, 200) });
  }
});

// ── Effects ──────────────────────────────────────────────────────────────────
app.get("/api/effects", (_req, res) => {
  res.json({ ok: true, effects: fx.catalogue(), ready: !!ffmpeg(), ai_ready: !!python(),
             reason: !ffmpeg() ? "FFmpeg is missing — it does the audio work." : "" });
});

app.post("/api/effects/apply", (req, res) => {
  const uploadId = String(req.body && req.body.uploadId || "");
  const effect = String(req.body && req.body.effect || "");
  const value = req.body && req.body.value;
  const src = path.join(UPLOADS, path.basename(uploadId));
  if (!uploadId || !fs.existsSync(src)) return res.status(400).json({ ok: false, message: "Upload a clip first." });
  if (!effect) return res.status(400).json({ ok: false, message: "Pick an effect." });

  const job = jobsStore.create({
    engine: "effects", engineName: "Audio effects",
    text: effect, voice: "", language: "", style: "", speed: 1,
  });
  res.status(202).json({ job_id: job.job_id, status: job.status, stage: job.stage });

  void (async () => {
    try {
      const out = await fx.apply({
        inputPath: src, effect, value,
        ffmpeg: ffmpeg(), python: python(), pyDir: PY_DIR,
        onStage: (label, pct) => jobsStore.stage(job.job_id, label, pct),
      });
      job.text = out.applied;
      jobsStore.stage(job.job_id, "Writing the file", 92);
      jobsStore.finish(job.job_id, out.buffer, AUDIO);
    } catch (e) {
      jobsStore.fail(job.job_id, e && e.message);
    }
  })();
});

// ── Transcription ────────────────────────────────────────────────────────────
app.get("/api/transcribe/models", (_req, res) => {
  res.json({ ok: true, models: stt.MODELS, ready: !!python() && !!ffmpeg(),
             reason: !python() ? "Transcription needs the studio's Python."
                   : !ffmpeg() ? "FFmpeg is missing — it extracts the audio." : "" });
});

app.post("/api/transcribe", (req, res) => {
  const uploadId = String(req.body && req.body.uploadId || "");
  const url = String(req.body && req.body.url || "").trim();
  const model = String(req.body && req.body.model || "base");
  const language = String(req.body && req.body.language || "").trim();
  if (!uploadId && !url) return res.status(400).json({ ok: false, message: "Upload a file or paste a link." });

  const job = jobsStore.create({
    engine: "transcribe", engineName: "Transcription",
    text: url || uploadId, voice: "", language, style: "", speed: 1,
  });
  job.output_format = "txt";
  res.status(202).json({ job_id: job.job_id, status: job.status, stage: job.stage });

  void (async () => {
    try {
      const onStage = (label, pct) => jobsStore.stage(job.job_id, label, pct);
      const out = url
        ? await stt.fromUrl({ url, model, python: python(), pyDir: PY_DIR, onStage })
        : await stt.fromFile({
            inputPath: path.join(UPLOADS, path.basename(uploadId)),
            model, language, python: python(), ffmpeg: ffmpeg(), pyDir: PY_DIR, onStage,
          });
      // A transcript is text, not audio, so it is finished by hand rather than
      // through the audio path — otherwise it would be written as an .mp3.
      job.status = "done"; job.stage = "Ready"; job.progress = 100;
      job.transcript = out.text; job.model = out.model;
      job.duration_seconds = null;
    } catch (e) {
      jobsStore.fail(job.job_id, e && e.message);
    }
  })();
});

// ── Media Intelligence (link→transcript, course, notes, video→prompt) ─────────
// Carried from Digi Biz OS, wired to this app's Gemini keys. Job-based so long
// tasks (video→prompt ~2 min) do not time out the browser; poll /api/jobs/:id.
const mediaIntel = require("./engines/media-intel");

app.post("/api/media/start", (req, res) => {
  const mode = String(req.body && req.body.mode || "transcript"); // transcript | course | notes | prompt
  const url = String(req.body && req.body.url || "").trim();
  const uploadId = String(req.body && req.body.uploadId || "");
  const pastedText = String(req.body && req.body.text || "").trim();
  if (!url && !uploadId && !pastedText) return res.status(400).json({ ok: false, message: "Paste a link, upload a video, or paste text." });

  const job = jobsStore.create({ engine: "media", engineName: "Media Intelligence", text: url || uploadId || "text", voice: "", language: "", style: "", speed: 1 });
  job.output_format = mode === "prompt" ? "json" : "txt";
  res.status(202).json({ ok: true, job_id: job.job_id, status: job.status, stage: job.stage });

  void (async () => {
    try {
      const onStage = (label) => jobsStore.stage(job.job_id, label, 50);
      const srcFile = uploadId ? path.join(UPLOADS, path.basename(uploadId)) : "";

      // VIDEO → PROMPT (needs a video file or a link we can download)
      if (mode === "prompt") {
        let videoFile = srcFile;
        if (!videoFile && url) throw new Error("For Video → Prompt, upload the video file (link download isn't available in this app).");
        if (!videoFile || !fs.existsSync(videoFile)) throw new Error("Upload a video file.");
        const pkg = await mediaIntel.videoToPrompt(ffmpeg(), videoFile, "", { title: path.basename(videoFile) }, onStage);
        job.status = "done"; job.stage = "Ready"; job.progress = 100;
        job.output = String(pkg.master_prompt || ""); job.promptJson = pkg;
        return;
      }

      // Get the transcript/source text first.
      let transcript = pastedText;
      if (!transcript && url) { onStage("Reading the link"); transcript = await mediaIntel.linkTranscript(url, python(), PY_DIR); }
      if (!transcript && srcFile && fs.existsSync(srcFile)) { onStage("Transcribing the file"); const r = await stt.fromFile({ inputPath: srcFile, model: "base", python: python(), ffmpeg: ffmpeg(), pyDir: PY_DIR, onStage }); transcript = r.text; }
      if (!transcript) throw new Error("Could not get any text from that source.");

      if (mode === "transcript") { job.status = "done"; job.stage = "Ready"; job.progress = 100; job.transcript = transcript; job.output = transcript; return; }

      // COURSE / NOTES
      const doc = await mediaIntel.transcriptToDoc(mode, transcript, url || (srcFile ? path.basename(srcFile) : ""), onStage);
      job.status = "done"; job.stage = "Ready"; job.progress = 100;
      job.transcript = transcript; job.markdown = doc.markdown; job.output = doc.markdown;
    } catch (e) {
      jobsStore.fail(job.job_id, e && e.message);
    }
  })();
});

app.get("/api/media/ready", (_req, res) => res.json({ ok: true, gemini_keys: mediaIntel.geminiKeyCount(), python: !!python(), ffmpeg: !!ffmpeg() }));

// ── Settings ─────────────────────────────────────────────────────────────────
// Keys are written to data/.env, which is the studio's own file. Values are
// never echoed back — the UI is told only how many slots are filled.
app.get("/api/settings", (_req, res) => {
  res.json({
    ok: true,
    slots: gemini.keySlots.map((n) => ({ name: n, filled: !!(process.env[n] || "").trim() })),
    python: python() || null,
    ffmpeg: ffmpeg() || null,
    edge_ready: false,
  });
});

app.post("/api/settings/key", (req, res) => {
  const name = String(req.body && req.body.name || "");
  const value = String(req.body && req.body.value || "").trim();
  if (!gemini.keySlots.includes(name)) return res.status(400).json({ ok: false, message: "Unknown key slot." });
  try {
    const file = path.join(DATA, ".env");
    const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/) : [];
    const kept = lines.filter((l) => !new RegExp(`^\\s*${name}\\s*=`).test(l));
    if (value) kept.push(`${name}=${value}`);
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(file, kept.filter((l) => l.trim()).join("\n") + "\n", "utf-8");
    if (value) process.env[name] = value; else delete process.env[name];
    res.json({ ok: true, filled: !!value });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e && e.message || e).slice(0, 200) });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[DIGI LABS] listening on http://127.0.0.1:${PORT}`);
  console.log(`  python : ${python() || "not found"}`);
  console.log(`  ffmpeg : ${ffmpeg() || "not found"}`);
  console.log(`  gemini : ${gemini.keyCount()} key(s)`);
});

module.exports = app;
