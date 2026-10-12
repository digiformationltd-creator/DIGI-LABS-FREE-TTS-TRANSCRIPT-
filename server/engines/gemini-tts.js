/**
 * Gemini TTS — the studio-quality voice.
 *
 * Lifted as-is from Digi Biz OS (server.ts:9701) because the behaviour here was
 * learned the hard way and is worth keeping exactly:
 *
 *   KEY ROTATION. Google allows roughly ten TTS REQUESTS per key per day — a
 *   single key dies after a handful of clips. Every configured key is tried in
 *   turn, so three keys mean three times the allowance at identical voice
 *   quality. Nine slots are read, which is deliberate headroom.
 *
 *   ONLY A QUOTA REFUSAL MOVES TO THE NEXT KEY. A bad prompt fails the same way
 *   on every key, so retrying it would silently burn the whole day's allowance
 *   for nothing. That distinction is the difference between a working studio and
 *   one that is mysteriously out of quota by lunchtime.
 *
 *   A STYLE PREFIX IS NOT READ ALOUD. "Say this like an excited promo:" shapes
 *   the delivery and does not appear in the audio — measured, not assumed: the
 *   styled clip comes back slightly SHORTER than the plain one.
 *
 * Gemini returns raw PCM (s16le, 24 kHz, mono), so ffmpeg converts it to MP3.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MODEL = () => process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

// Five slots — the owner asked for exactly five, no more. Each key adds a day's
// worth of allowance; a studio should not stop working because one hit its cap,
// but five is plenty of headroom and a shorter list is a simpler Settings page.
const KEY_SLOTS = [
  "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4", "GEMINI_API_KEY_5",
];

function keys() {
  return KEY_SLOTS
    .map((n) => (process.env[n] || "").trim())
    .filter((k, i, a) => k && a.indexOf(k) === i);
}

// Delivery tones, carried over from Digi Biz OS word for word so the voice
// sounds the same here. The empty "" tone is the important one: it is the plain
// Gemini voice with no instruction in front of it, and it is the DEFAULT. An
// earlier build defaulted to "promo", which is why the voice felt fast and
// salesy rather than natural — every clip was being read like an advert.
const STYLES = {
  "": "",
  business: "Say this in a confident, polished corporate voice — warm, clear and authoritative, like a brand advert:",
  promo: "Say this like an excited product promo — fast, punchy, high energy, selling it:",
  explainer: "Say this like a friendly expert explaining something simply — relaxed, clear and unhurried:",
  calm: "Say this calmly and slowly, like a narrator reading to someone at the end of the day:",
};

// How each tone reads in the UI — the full, descriptive labels from Digi Biz OS.
const STYLE_LABELS = {
  "": "Normal — natural voice",
  business: "Business — confident brand voice",
  promo: "Promo — fast & punchy",
  explainer: "Explainer — friendly & clear",
  calm: "Calm — slow narration",
};

const VOICES = [
  { id: "Charon", label: "Charon — deep, steady" },
  { id: "Puck", label: "Puck — bright, lively" },
  { id: "Fenrir", label: "Fenrir — weighty, serious" },
  { id: "Orus", label: "Orus — warm, even" },
];

// ── Daily budget ─────────────────────────────────────────────────────────────
// Google's own refusal names the limit, but nothing used to show it anywhere, so
// a day's allowance could vanish into five one-line clips with no warning. Usage
// is counted per key per calendar day and reported to the UI.
const DAILY_PER_KEY = 10;
const usage = new Map();
const today = () => new Date().toISOString().slice(0, 10);
const slot = (i) => `${today()}|${i}`;
const spend = (i) => usage.set(slot(i), (usage.get(slot(i)) || 0) + 1);
const exhaust = (i) => usage.set(slot(i), DAILY_PER_KEY);

function quota() {
  const n = keys().length;
  let used = 0;
  for (let i = 0; i < n; i++) used += Math.min(DAILY_PER_KEY, usage.get(slot(i)) || 0);
  const total = n * DAILY_PER_KEY;
  return { keys: n, total, used, remaining: Math.max(0, total - used), perRequestChars: 8000 };
}

function isQuotaRefusal(status, body) {
  return status === 429 || /quota|exhausted|rate.?limit|RESOURCE_EXHAUSTED/i.test(body || "");
}

/** Convert raw PCM to MP3. ffmpeg comes from the engines folder or the PATH. */
function pcmToMp3(ffmpeg, pcmPath, mp3Path) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpeg, ["-y", "-f", "s16le", "-ar", "24000", "-ac", "1",
                              "-i", pcmPath, "-b:a", "192k", mp3Path], { windowsHide: true });
    let err = "";
    ff.stderr.on("data", (d) => (err += d.toString().slice(-400)));
    ff.on("error", reject);
    ff.on("close", (c) => (c === 0 && fs.existsSync(mp3Path))
      ? resolve()
      : reject(new Error("Audio conversion failed. " + err.slice(-160))));
  });
}

/**
 * Speak one passage.
 * @returns {Promise<{buffer: Buffer, voice: string, keyUsed: number}>}
 */
async function speak({ text, voice, style, ffmpeg }) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("No text supplied.");

  const ks = keys();
  if (!ks.length) throw new Error("No Gemini key is configured for speech. Add one in Settings.");

  const pick = VOICES.some((v) => v.id === voice) ? voice : "Charon";
  const prefix = STYLES[String(style || "").trim()] || "";
  const line = prefix ? `${prefix} ${raw}` : raw;

  let res = null, lastWhy = "", keyUsed = 0;
  for (let i = 0; i < ks.length; i++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent?key=${ks[i]}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: line.slice(0, 8000) }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: pick } } },
          },
        }),
        signal: AbortSignal.timeout(120000),
      },
    );
    keyUsed = i + 1;
    if (res.ok) { spend(i); break; }
    lastWhy = (await res.clone().text()).slice(0, 220);
    if (!isQuotaRefusal(res.status, lastWhy)) break;   // not a quota problem — another key won't help
    exhaust(i);
  }

  if (!res || !res.ok) {
    if (isQuotaRefusal(res ? res.status : 0, lastWhy)) {
      const e = new Error(`Today's speech allowance is used up on all ${ks.length} key(s). Add another key in Settings, or use the Free Voice engine.`);
      e.quota = true;
      throw e;
    }
    throw new Error(`Speech engine ${res ? res.status : "unreachable"}: ${lastWhy.slice(0, 160)}`);
  }

  const d = await res.json();
  const parts = (d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  const b64 = (parts.find((p) => p && p.inlineData && p.inlineData.data) || {}).inlineData?.data;
  if (!b64) throw new Error("The engine returned no audio.");

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pcm = path.join(os.tmpdir(), `digilabs_${stamp}.pcm`);
  const mp3 = path.join(os.tmpdir(), `digilabs_${stamp}.mp3`);
  try {
    fs.writeFileSync(pcm, Buffer.from(b64, "base64"));
    await pcmToMp3(ffmpeg, pcm, mp3);
    return { buffer: fs.readFileSync(mp3), voice: pick, keyUsed };
  } finally {
    for (const p of [pcm, mp3]) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* temp file */ } }
  }
}

// Labelled, in display order, with Normal first so it is the default choice.
function styleList() {
  return Object.keys(STYLES).map((id) => ({ id, label: STYLE_LABELS[id] || id }));
}

module.exports = { speak, quota, VOICES, STYLES, styleList, keySlots: KEY_SLOTS, keyCount: () => keys().length };
