/**
 * Media Intelligence for DIGI LABS — link→transcript, transcript→course/notes,
 * and video→prompt.
 *
 * The logic is carried over from Digi Biz OS (media-understand.ts + the server's
 * caption fetch) so it behaves the same here, converted to plain CommonJS and
 * wired to this app's own Gemini keys (the same keys the TTS studio uses — one
 * key serves chat and vision as well as speech). Nothing in the existing DIGI
 * LABS studio/transcribe/effects is touched; this is additive.
 *
 * Engines reused: the bundled ffmpeg (engines/bin) for frames, the bundled
 * Python + yt-dlp + faster-whisper for the captionless fallback.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// ── Gemini upstream (chat + vision) from the app's own keys ──────────────────
const KEY_SLOTS = ["GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY", "GEMINI_OPENCODE_KEY"];
function geminiKeys() {
  return KEY_SLOTS.map((n) => (process.env[n] || "").trim().replace(/^['"]+|['"]+$/g, "")).filter((k, i, a) => k && a.indexOf(k) === i);
}
// These keys work on Gemini's NATIVE generateContent endpoint (the OpenAI-compat
// path 404s for them, and gemini-2.0/2.5-flash are "no longer available to new
// users"). gemini-flash-latest / -lite-latest are the current working models.
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CHAT_MODELS = () => [process.env.GEMINI_CHAT_MODEL, "gemini-flash-lite-latest", "gemini-flash-latest"].filter(Boolean);

// ── Cloudflare Workers AI (PRIMARY, keyless for the user) ────────────────────
// This is the SAME upstream Digi Biz OS runs its AI on: a real model served from
// the app's own Cloudflare account, OpenAI-compatible. It needs no per-user
// Gemini key, which is why notes / forms / video→prompt work out of the box here
// exactly as they do in Digi Biz OS. Gemini stays as a secondary fallback.
const cfAccount = () => (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const cfToken = () => (process.env.CLOUDFLARE_API_TOKEN || "").trim();
const CF_TEXT_MODEL = () => process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CF_VISION_MODEL = () => process.env.CLOUDFLARE_VISION_MODEL || "@cf/meta/llama-3.2-11b-vision-instruct";
function cfReady() { return !!(cfAccount() && cfToken()); }

/** One OpenAI-compatible completion on Cloudflare Workers AI. */
async function cfChatRaw(messages, { model, maxTokens = 4000, temperature = 0.4, timeoutMs = 150000 } = {}) {
  if (!cfReady()) return "";
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount()}/ai/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfToken()}` },
      body: JSON.stringify({ model: model || CF_TEXT_MODEL(), messages, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return "";
    const d = await r.json();
    return String(d?.choices?.[0]?.message?.content || "").trim();
  } catch { return ""; }
}

function parseJson(text) {
  const s = String(text || "").replace(/```(?:json)?/gi, "").trim();
  const a = s.search(/[{[]/); if (a < 0) return null;
  const open = s[a], close = open === "{" ? "}" : "]";
  const b = s.lastIndexOf(close); if (b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

function geminiText(d) {
  const parts = d?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p?.text || "").join("").trim();
}

/** One text completion — Cloudflare Workers AI first, then Gemini as fallback. */
async function chat(system, user, opts = {}) {
  // PRIMARY: Cloudflare Workers AI (the Digi Biz OS upstream — no user key needed).
  if (cfReady()) {
    const out = await cfChatRaw(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { maxTokens: opts.maxTokens ?? 4000, temperature: opts.temperature ?? 0.4, timeoutMs: opts.timeoutMs ?? 150000 },
    );
    if (out) return out;
  }
  // FALLBACK: Gemini native (only if keys are present and valid).
  const keys = geminiKeys();
  if (!keys.length) {
    if (cfReady()) throw new Error("AI busy — please try again.");
    throw new Error("No AI configured — add a Cloudflare or Gemini key in Settings.");
  }
  let lastErr = "";
  for (const model of CHAT_MODELS()) {
    for (const key of keys) {
      try {
        const r = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: opts.temperature ?? 0.4, maxOutputTokens: opts.maxTokens ?? 4000 },
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 150000),
        });
        if (!r.ok) { lastErr = `gemini ${r.status}`; continue; }
        const d = await r.json();
        if (d?.error) { lastErr = String(d.error.message || "").slice(0, 60); continue; }
        const out = geminiText(d);
        if (out) return out;
        lastErr = "empty";
      } catch (e) { lastErr = e?.name === "TimeoutError" ? "timeout" : (e?.message || "error"); }
    }
  }
  throw new Error(`AI busy (${lastErr})`);
}

/** Vision over one image (data URI) via Gemini native inlineData. */
async function describeImage(dataUri, instruction, maxTokens = 1000) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUri || "");
  if (!m) return null;
  // PRIMARY: Cloudflare Workers AI vision (OpenAI-compatible image_url).
  if (cfReady()) {
    const out = await cfChatRaw(
      [{ role: "user", content: [{ type: "text", text: instruction }, { type: "image_url", image_url: { url: dataUri } }] }],
      { model: CF_VISION_MODEL(), maxTokens, temperature: 0.2, timeoutMs: 90000 },
    );
    if (out) return { text: out, model: CF_VISION_MODEL() };
  }
  const keys = geminiKeys();
  for (const model of CHAT_MODELS()) {
    for (const key of keys) {
      try {
        const r = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: instruction }, { inlineData: { mimeType: m[1], data: m[2] } }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
          }),
          signal: AbortSignal.timeout(90000),
        });
        if (!r.ok) continue;
        const d = await r.json();
        if (d?.error) continue;
        const text = geminiText(d);
        if (text) return { text, model };
      } catch { /* next */ }
    }
  }
  return null;
}

// ── Link → transcript (captions fast-path, else yt-dlp+whisper, else page) ────
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" };
const YT_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const YT_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";
const decodeEnt = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n));

async function ytTranscript(id) {
  const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": YT_UA },
    body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en", gl: "US" } }, videoId: id }),
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json().catch(() => ({}));
  const tracks = d?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error("no-captions");
  const pick = tracks.find((t) => /^en/i.test(t.languageCode) && t.kind !== "asr") || tracks.find((t) => /^en/i.test(t.languageCode)) || tracks[0];
  if (!pick?.baseUrl) throw new Error("no-captions");
  const xml = await (await fetch(pick.baseUrl, { headers: { "User-Agent": YT_UA }, signal: AbortSignal.timeout(60000) })).text();
  const parts = [...xml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decodeEnt(m[1].replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function webPageText(u) {
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(45000) });
  let body = await r.text();
  if (/json/i.test(r.headers.get("content-type") || "")) return body.slice(0, 60000);
  body = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<(article|main)[^>]*>([\s\S]*?)<\/\1>/i.exec(body);
  const html = main ? main[2] : body;
  const text = decodeEnt(html.replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  if (!text) throw new Error("Nothing readable at that URL.");
  return text;
}

/** yt-dlp audio → faster-whisper (the captionless fallback). */
function whisperFromUrl(url, python, pyDir) {
  return new Promise((resolve, reject) => {
    const script = path.join(pyDir, "media_transcribe.py");
    if (!fs.existsSync(script)) return reject(new Error("media_transcribe.py missing"));
    const c = spawn(python, [script, url, process.env.WHISPER_MODEL || "base"], { windowsHide: true });
    let o = "", e = "";
    c.stdout.on("data", (d) => (o += d.toString())); c.stderr.on("data", (d) => (e += d.toString()));
    const t = setTimeout(() => { try { c.kill(); } catch { /* */ } reject(new Error("transcription timed out")); }, 900000);
    c.on("error", reject);
    c.on("close", () => { clearTimeout(t); const s = o.trim(); if (s.startsWith("ERR:")) return reject(new Error(s.slice(4).trim())); if (!s) return reject(new Error(e.slice(-160) || "no transcript")); resolve(s); });
  });
}

async function linkTranscript(rawUrl, python, pyDir) {
  const u = rawUrl.trim();
  const yt = /(?:youtube\.com|youtu\.be)/i.test(u) || /^[A-Za-z0-9_-]{11}$/.test(u);
  if (yt) {
    const id = (/[?&]v=([A-Za-z0-9_-]{11})/.exec(u) || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u) || /^([A-Za-z0-9_-]{11})$/.exec(u) || [])[1];
    if (id) { try { return await ytTranscript(id); } catch { /* fall to whisper */ } }
    if (python) { try { return await whisperFromUrl(/^https?:/i.test(u) ? u : `https://${u}`, python, pyDir); } catch { /* */ } }
    throw new Error("Could not read captions or audio for that video.");
  }
  const platform = /(facebook|fb\.watch|instagram|tiktok|twitter|\bx\.com|vimeo|dailymotion|reddit|twitch|rumble|streamable)/i.test(u);
  if (platform) { if (python) { try { return await whisperFromUrl(/^https?:/i.test(u) ? u : `https://${u}`, python, pyDir); } catch { /* */ } } throw new Error("That video has no readable speech, or the platform blocked it."); }
  return webPageText(/^https?:/i.test(u) ? u : `https://${u}`);
}

// ── Course / Notes (map → reduce) — carried from media-understand.ts ─────────
function chunkText(text, size = 3500, overlap = 300) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const out = []; let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) { const dot = clean.lastIndexOf(". ", end); if (dot > i + size * 0.6) end = dot + 1; }
    out.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}
const MAP_SYSTEM = `You are an expert instructional designer extracting teachable content from ONE part of a longer transcript. Capture EVERYTHING taught — do not summarise it away. Output ONLY JSON: {"topics":[{"title":"","key_points":["complete sentences"],"definitions":[{"term":"","meaning":""}],"steps":["ordered procedure if any"],"examples":[""]}]}. Drop filler; fix transcription errors; keep real facts, numbers and tool names.`;
const COURSE_SYSTEM = `You are a senior instructional designer building a REAL course (Udemy/Coursera quality), not a summary, from ordered topic extractions. Output ONE complete course in Markdown with: # title, > one-line promise, ## Course Overview (audience, prerequisites, 5-8 measurable outcomes, duration), ## Course Map (table), then for each module ## Module N, ### Lesson N.M (Why it matters / Key concepts / Step-by-step / Example / Common mistakes / #### Lesson recap), ### Module Practice, ### Module Quiz (with answers). Finish with ## Final Project, ## Glossary, ## Cheat Sheet, ## Next Steps. Cover 100% of the content, de-duplicate, simple English, no invented facts.`;
const NOTES_SYSTEM = `You are an expert note-taker producing COMPLETE study notes from ordered topic extractions. Output Markdown: # title, **In one paragraph:** overview, ## Table of Contents, then one ## section per topic in order (every key point, keep details, no over-shortening), with **Key terms:**, **Steps:**, **Example:**, **Remember:** where relevant. Finish with ## Summary of Key Takeaways, ## Quick Revision Checklist, ## Glossary. Cover every part, merge repeats, no invention.`;

async function transcriptToDoc(mode, transcript, title, onProgress) {
  const chunks = chunkText(transcript);
  if (!chunks.length) throw new Error("Nothing to work from.");
  const extractions = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress && onProgress(`Reading part ${i + 1}/${chunks.length}`);
    try {
      const raw = await chat(MAP_SYSTEM, `PART ${i + 1} of ${chunks.length}:\n${chunks[i]}`, { temperature: 0.2, maxTokens: 3000 });
      const j = parseJson(raw);
      extractions.push(j && Array.isArray(j.topics) ? j : { topics: [{ title: `Part ${i + 1}`, key_points: [raw.slice(0, 2500)] }] });
    } catch { extractions.push({ topics: [{ title: `Part ${i + 1}`, key_points: [chunks[i].slice(0, 2500)] }] }); }
  }
  const outline = extractions.flatMap((e) => (e.topics || []).map((t) => t.title)).filter(Boolean);
  onProgress && onProgress(mode === "course" ? "Designing the course" : "Building the notes");
  const sys = mode === "course" ? COURSE_SYSTEM : NOTES_SYSTEM;
  const md = await chat(sys, `${title ? `Source: ${title}\n` : ""}TOPIC EXTRACTIONS (in order):\n${JSON.stringify(extractions).slice(0, 50000)}\n\nOutline:\n${outline.join("\n")}`, { temperature: 0.3, maxTokens: 8000, timeoutMs: 200000 });
  return { markdown: md.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim(), parts: chunks.length };
}

// ── Video → Prompt (frames → vision → synthesis) — carried over ──────────────
const FRAME_INSTRUCTION = `You are a senior film analyst breaking down ONE frame of a video for recreation. Report ONLY what is visible, be specific. Return ONLY JSON: {"shot_type":"","camera":{"angle":"","lens_look":"","depth_of_field":"","apparent_motion":""},"subjects":[{"who":"","clothing":"","action":"","position_in_frame":""}],"objects":[{"what":"","colour":"","state":""}],"environment":{"location_type":"","time_of_day":"","lighting":""},"colour_grade":{"palette":[""],"look":""},"effects":{"vfx":"","graphics_or_ui":""},"on_screen_text":[""],"mood":"","notable_details":[""]}`;
const VIDEO_PROMPT_SYSTEM = `You are a world-class AI-video prompt engineer (Veo 3, Kling, Sora, Runway). From a FRAME-BY-FRAME breakdown + transcript, reverse-engineer the video into a production-grade prompt package. Cover every shot, subject, action, camera move, lighting, transition, text and sound; concrete nouns/colours/directions; keep subject identities consistent; build a timed shot list; never invent what the evidence does not show. Output ONLY JSON: {"title":"","summary":"","format":{"duration_sec":0,"aspect_ratio":"","fps_feel":"","realism":""},"style":{"genre":"","visual_style":"","colour_grade":"","lighting":""},"shots":[{"n":1,"start":0,"end":0,"shot_size":"","camera_movement":"","action":"","on_screen_text":"","prompt":"self-contained prompt for this shot"}],"audio":{"music":"","voice":""},"master_prompt":"one rich paragraph 150-300 words","model_variants":{"veo3":"","kling":"","sora":"","runway":""},"negative_prompt":"","assumptions":[""]}`;
const fmtT = (s) => { const m = Math.floor(s / 60); const r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, "0")}`; };

function probeDuration(ffmpeg, file) {
  return new Promise((resolve) => {
    const c = spawn(ffmpeg, ["-hide_banner", "-i", file], { windowsHide: true });
    let e = ""; c.stderr.on("data", (d) => (e += d.toString()));
    c.on("close", () => { const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(e); resolve(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0); });
    c.on("error", () => resolve(0));
  });
}
function ff1(ffmpeg, args) { return new Promise((resolve, reject) => { const c = spawn(ffmpeg, args, { windowsHide: true }); c.on("error", reject); c.on("close", (code) => resolve(code)); setTimeout(() => { try { c.kill(); } catch { /* */ } resolve(1); }, 60000); }); }

async function extractFrames(ffmpeg, file, maxFrames = 12) {
  const duration = await probeDuration(ffmpeg, file);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digilabs_frames_"));
  const n = Math.max(6, Math.min(maxFrames, duration > 0 ? Math.ceil(duration / 4) : 8));
  const times = [];
  for (let i = 0; i < n; i++) times.push(duration > 0 ? (duration * (i + 0.5)) / n : i * 4);
  const frames = [];
  for (let i = 0; i < times.length; i++) {
    const out = path.join(dir, `f_${String(i).padStart(2, "0")}.jpg`);
    await ff1(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", times[i].toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=w='min(768\\,iw)':h='min(768\\,ih)':force_original_aspect_ratio=decrease", "-q:v", "4", "-y", out]);
    if (fs.existsSync(out) && fs.statSync(out).size > 1000) frames.push({ t: times[i], file: out });
  }
  return { frames, duration, dir };
}

async function videoToPrompt(ffmpeg, file, transcript, meta, onProgress) {
  onProgress && onProgress("Extracting frames");
  const { frames, duration, dir } = await extractFrames(ffmpeg, file, 12);
  try {
    if (!frames.length) throw new Error("Could not read frames (ffmpeg).");
    onProgress && onProgress(`Watching ${frames.length} frames`);
    const analysed = [];
    for (let i = 0; i < frames.length; i++) {
      const uri = `data:image/jpeg;base64,${fs.readFileSync(frames[i].file).toString("base64")}`;
      const d = await describeImage(uri, FRAME_INSTRUCTION, 900);
      if (d) analysed.push({ t: frames[i].t, at: fmtT(frames[i].t), analysis: parseJson(d.text) || { description: d.text } });
    }
    if (!analysed.length) throw new Error("No vision model answered — check the Gemini key.");
    onProgress && onProgress("Engineering the prompt");
    const evidence = { meta: { ...meta, duration_sec: Math.round(duration) }, frames: analysed, transcript: String(transcript || "").slice(0, 10000) };
    const raw = await chat(VIDEO_PROMPT_SYSTEM, `EVIDENCE (JSON):\n${JSON.stringify(evidence).slice(0, 55000)}\n\nBuild the prompt package. JSON only.`, { temperature: 0.3, maxTokens: 6000, timeoutMs: 200000 });
    const pkg = parseJson(raw) || { master_prompt: raw };
    pkg.frames_analysed = analysed.length;
    return pkg;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
}

module.exports = {
  linkTranscript, transcriptToDoc, videoToPrompt,
  geminiKeyCount: () => geminiKeys().length,
  // AI is ready if EITHER Cloudflare Workers AI (primary) or a Gemini key is set.
  aiReady: () => cfReady() || geminiKeys().length > 0,
  cfReady,
};
