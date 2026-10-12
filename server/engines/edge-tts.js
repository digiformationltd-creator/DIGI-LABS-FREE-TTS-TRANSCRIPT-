/**
 * Edge-TTS — the free, unlimited voice.
 *
 * Lifted from Digi Biz OS (server.ts:9637). This is the engine that carries the
 * long work: a whole chapter, an audiobook, a narration. No key, no quota, no
 * per-request cap — it just needs the internet and the `edge-tts` package in the
 * studio's own Python.
 *
 * WHY RATE, PITCH AND VOLUME TRAVEL TOGETHER
 *   A promo read is not a narration played faster. It sits higher and louder as
 *   well, and changing only the rate produces something that sounds like a
 *   recording at double speed rather than someone who is excited. So a style
 *   here sets all three at once.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Urdu first, because that is what this studio is mostly for.
const VOICES = [
  { id: "ur-PK-AsadNeural", label: "Asad — Urdu (Pakistan)", lang: "ur" },
  { id: "hi-IN-MadhurNeural", label: "Madhur — Hindi (India)", lang: "hi" },
  { id: "en-US-AndrewMultilingualNeural", label: "Andrew — English (multilingual)", lang: "en" },
  { id: "en-US-BrianMultilingualNeural", label: "Brian — English (multilingual)", lang: "en" },
  { id: "en-GB-RyanNeural", label: "Ryan — English (UK)", lang: "en" },
  { id: "en-US-GuyNeural", label: "Guy — English (US)", lang: "en" },
  { id: "ar-SA-HamedNeural", label: "Hamed — Arabic", lang: "ar" },
];

// Delivery presets. Each one moves rate, pitch and volume together, for the
// reason in the header.
const STYLES = {
  natural: { rate: "", pitch: "", volume: "" },
  promo: { rate: "+18%", pitch: "+30Hz", volume: "+12%" },
  business: { rate: "+4%", pitch: "+5Hz", volume: "+6%" },
  explainer: { rate: "-6%", pitch: "", volume: "" },
  calm: { rate: "-14%", pitch: "-20Hz", volume: "-4%" },
};

function voiceFor(id, lang) {
  const hit = VOICES.find((v) => v.id === id);
  if (hit) return hit.id;
  const byLang = VOICES.find((v) => v.lang === String(lang || "").slice(0, 2));
  return (byLang || VOICES[0]).id;
}

/**
 * Narrate a passage.
 * @returns {Promise<{buffer: Buffer, voice: string, chars: number}>}
 */
async function speak({ text, voice, lang, style, speed, python }) {
  const body = String(text || "").trim();
  if (!body) throw new Error("No text supplied.");
  if (!python) throw new Error("The studio's Python is not installed yet. Open Settings and run the one-click setup.");

  const pick = voiceFor(voice, lang);
  const preset = STYLES[String(style || "").trim()] || STYLES.natural;

  // An explicit speed from the slider wins over the preset's rate: the person
  // moved it on purpose.
  let rate = preset.rate;
  const s = Number(speed);
  if (Number.isFinite(s) && s > 0 && Math.abs(s - 1) > 0.01) {
    const pct = Math.round((s - 1) * 100);
    rate = (pct >= 0 ? "+" : "") + pct + "%";
  }

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const txt = path.join(os.tmpdir(), `digilabs_${stamp}.txt`);
  const mp3 = path.join(os.tmpdir(), `digilabs_${stamp}.mp3`);

  try {
    fs.writeFileSync(txt, body, "utf-8");
    const args = ["-m", "edge_tts", "--file", txt, "--voice", pick, "--write-media", mp3];
    if (/^[+-]\d+%$/.test(rate)) args.push("--rate", rate);
    if (/^[+-]\d+Hz$/.test(preset.pitch)) args.push("--pitch", preset.pitch);
    if (/^[+-]\d+%$/.test(preset.volume)) args.push("--volume", preset.volume);

    await new Promise((resolve, reject) => {
      const c = spawn(python, args, { windowsHide: true });
      let err = "";
      c.stderr.on("data", (d) => (err += d.toString().slice(-600)));
      // Ten minutes: a long chapter is a legitimate request, not a hang.
      const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } reject(new Error("Narration timed out.")); }, 600000);
      c.on("error", reject);
      c.on("close", (code) => {
        clearTimeout(t);
        // A zero exit with a tiny file is still a failure — edge-tts writes an
        // empty media file when the voice name is rejected.
        if (code === 0 && fs.existsSync(mp3) && fs.statSync(mp3).size > 500) return resolve();
        reject(new Error(err.slice(-180) || "The free voice engine failed. Check the internet connection."));
      });
    });

    return { buffer: fs.readFileSync(mp3), voice: pick, chars: body.length };
  } finally {
    for (const p of [txt, mp3]) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* temp file */ } }
  }
}

const STYLE_LABELS = {
  natural: "Natural — plain read",
  business: "Business — confident",
  promo: "Promo — fast & punchy",
  explainer: "Explainer — clear",
  calm: "Calm — slow narration",
};

function styleList() {
  return Object.keys(STYLES).map((id) => ({ id, label: STYLE_LABELS[id] || id }));
}

module.exports = { speak, VOICES, STYLES, styleList };
