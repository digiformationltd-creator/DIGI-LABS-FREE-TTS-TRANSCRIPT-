/**
 * Audio effects — clean it up, or change the voice.
 *
 * The filter chains come from Digi Biz OS (server.ts:9218) and are kept to the
 * letter, because they were tuned by ear and a "tidier" chain sounds worse.
 *
 * TWO KINDS OF WORK LIVE HERE AND THEY ARE NOT THE SAME
 *   Repair — hum, hiss, clipping, echo, uneven level. These are fixes: the
 *   listener should not be able to tell they happened.
 *   Voice change — deep, child, robot, telephone. These are effects: the whole
 *   point is that the listener can tell.
 *
 * PITCH WITHOUT CHIPMUNK
 *   A naive pitch shift speeds the audio up. The chain here is
 *   `aresample → asetrate → aresample → atempo`: asetrate moves the pitch and
 *   drags the tempo with it, and atempo puts the tempo back by the exact
 *   inverse. Resampling to a fixed 44.1 kHz on both sides is what makes it
 *   correct for a source at any rate — without it, the shift is wrong for
 *   anything that is not 44.1 kHz to begin with.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

/** Pitch shift that holds the tempo. `extra` adds a tone filter after it. */
function pitch(semitones, extra) {
  const f = Math.pow(2, semitones / 12);
  const chain = `aresample=44100,asetrate=${Math.round(44100 * f)},aresample=44100,atempo=${(1 / f).toFixed(5)}`;
  return extra ? `${chain},${extra}` : chain;
}

// Everything the studio can do to a clip, grouped the way a person thinks about
// it rather than the way ffmpeg does.
const EFFECTS = {
  // ── Repair ────────────────────────────────────────────────────────────────
  enhance: {
    group: "Repair", label: "Enhance", hint: "Cut mud, add presence, even out the level.",
    filter: "equalizer=f=200:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=4,acompressor=threshold=-18dB:ratio=3:attack=10:release=200,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  denoise: {
    group: "Repair", label: "Remove noise", hint: "Steady hiss and rumble.",
    filter: "highpass=f=90,afftdn=nf=-25,adeclip,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  echoremove: {
    group: "Repair", label: "Remove echo", hint: "Gate the decaying tail in a hard room.",
    filter: "highpass=f=100,afftdn=nf=-30:nr=15,agate=threshold=0.015:ratio=2:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  reverbremove: {
    group: "Repair", label: "Remove reverb", hint: "Heavier than echo removal — for a very live room.",
    filter: "highpass=f=90,afftdn=nf=-28:nr=12,compand=attacks=0.005:decays=0.05:points=-80/-80|-45/-60|-27/-20|0/0,agate=threshold=0.02:ratio=3:release=80,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  normalize: {
    group: "Repair", label: "Even the level", hint: "Broadcast loudness, no clipping.",
    filter: "loudnorm=I=-14:TP=-1.0:LRA=11,dynaudnorm=g=7:p=0.9",
  },
  vocalextract: {
    group: "Repair", label: "Isolate the voice", hint: "Keep the speech, drop what sits outside it.",
    filter: "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=120,lowpass=f=8000,loudnorm=I=-16:TP=-1.5",
  },
  vocalremove: {
    group: "Repair", label: "Remove the voice", hint: "Centre-channel cancel — leaves the backing.",
    filter: "pan=stereo|c0=c0-c1|c1=c1-c0",
  },

  // ── Voice changer ─────────────────────────────────────────────────────────
  deep: { group: "Voice", label: "Deep", hint: "Lower and weightier.", filter: pitch(-5, "equalizer=f=120:t=q:w=1:g=3") },
  male: { group: "Voice", label: "Male", hint: "A few semitones down.", filter: pitch(-3) },
  female: { group: "Voice", label: "Female", hint: "Up, with added air.", filter: pitch(4, "equalizer=f=3000:t=q:w=1:g=2") },
  child: { group: "Voice", label: "Child", hint: "Higher and lighter.", filter: pitch(7) },
  chipmunk: { group: "Voice", label: "Chipmunk", hint: "Comic.", filter: pitch(10) },
  monster: { group: "Voice", label: "Monster", hint: "Low, with a short echo.", filter: pitch(-9, "aecho=0.8:0.6:40:0.3") },
  alien: { group: "Voice", label: "Alien", hint: "Shifted, with a wobble.", filter: pitch(3, "vibrato=f=6:d=0.4") },
  robot: { group: "Voice", label: "Robot", hint: "Flattened and metallic.", filter: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75" },
  radio: { group: "Voice", label: "Old radio", hint: "Narrow band, pushed.", filter: "highpass=f=400,lowpass=f=3000,acompressor=threshold=-20dB:ratio=6,volume=1.6" },
  telephone: { group: "Voice", label: "Telephone", hint: "Narrower still.", filter: "highpass=f=500,lowpass=f=2800,volume=1.4" },

  // ── Shape ─────────────────────────────────────────────────────────────────
  reverse: { group: "Shape", label: "Reverse", hint: "Play it backwards.", filter: "areverse" },
  fade: { group: "Shape", label: "Fade in and out", hint: "Two seconds at each end.", filter: "afade=t=in:st=0:d=2,areverse,afade=t=in:st=0:d=2,areverse" },
  bass: { group: "Shape", label: "Bass only", hint: "Keep the low end.", filter: "lowpass=f=200,lowpass=f=200,volume=2.2" },
};

/** Effects that take a number from the UI rather than a fixed chain. */
const PARAMETRIC = {
  speed: { group: "Shape", label: "Speed", hint: "0.5× to 2×, pitch unchanged.", param: "factor", min: 0.5, max: 2, step: 0.05, def: 1.25 },
  volume: { group: "Shape", label: "Volume", hint: "Gain, in multiples.", param: "gain", min: 0.2, max: 4, step: 0.1, def: 1.5 },
  echo: { group: "Shape", label: "Echo", hint: "Delay in milliseconds.", param: "delay", min: 60, max: 1500, step: 20, def: 800 },
};

function catalogue() {
  const rows = [];
  for (const [id, e] of Object.entries(EFFECTS)) {
    rows.push({ id, group: e.group, label: e.label, hint: e.hint, parametric: false });
  }
  for (const [id, e] of Object.entries(PARAMETRIC)) {
    rows.push({ id, group: e.group, label: e.label, hint: e.hint, parametric: true,
                param: e.param, min: e.min, max: e.max, step: e.step, def: e.def });
  }
  // "Remove noise with AI" is listed separately: it is the only one that runs a
  // model rather than a filter, and it is slow enough that it should not look
  // like the others.
  rows.push({ id: "ai_noise", group: "Repair", label: "AI noise removal",
              hint: "Finds hum, hiss, knocks and background voices, then removes only what it found.",
              parametric: false, slow: true });
  return rows;
}

function runFfmpeg(ff, args, label) {
  return new Promise((resolve, reject) => {
    const c = spawn(ff, args, { windowsHide: true });
    let err = "";
    c.stderr.on("data", (d) => (err += d.toString().slice(-800)));
    const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } reject(new Error(`${label} timed out.`)); }, 600000);
    c.on("error", reject);
    c.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) return resolve();
      // ffmpeg's last line is the useful one; the rest is banner noise.
      const last = err.trim().split(/\r?\n/).pop() || "";
      reject(new Error(`${label} failed. ${last.slice(0, 180)}`));
    });
  });
}

/**
 * Apply one effect to one file.
 * @returns {Promise<{buffer: Buffer, applied: string}>}
 */
async function apply({ inputPath, effect, value, ffmpeg, python, pyDir, onStage }) {
  if (!ffmpeg) throw new Error("FFmpeg is missing — it does the audio work.");
  const out = path.join(os.tmpdir(), `digifx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);

  try {
    if (effect === "ai_noise") {
      if (!python) throw new Error("AI noise removal needs the studio's Python.");
      const script = path.join(pyDir, "noise_ai.py");
      if (!fs.existsSync(script)) throw new Error("The AI noise engine file is missing.");
      // noise_ai.py reads with Python's `wave` module, which only accepts WAV —
      // hand it an MP3 and it fails with "file does not start with RIFF id". So
      // the clip is decoded to 16-bit PCM WAV first, exactly as Digi Biz OS does.
      onStage && onStage("Preparing the audio", 15);
      const wav = path.join(os.tmpdir(), `digifx_${Date.now()}_in.wav`);
      await runFfmpeg(ffmpeg, ["-y", "-i", inputPath, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", wav], "Audio preparation");
      onStage && onStage("Listening for noise", 35);
      let gated;
      try {
        gated = await runNoiseAi(python, script, wav);
        onStage && onStage("Polishing", 78);
        // The model removes what it found; this pass only levels the result.
        await runFfmpeg(ffmpeg, ["-y", "-i", gated, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", out], "Levelling");
      } finally {
        try { fs.unlinkSync(wav); } catch { /* temp */ }
        try { if (gated && gated !== wav) fs.unlinkSync(gated); } catch { /* temp */ }
      }
      return { buffer: fs.readFileSync(out), applied: "AI noise removal" };
    }

    let filter;
    let label;
    if (EFFECTS[effect]) {
      filter = EFFECTS[effect].filter;
      label = EFFECTS[effect].label;
    } else if (PARAMETRIC[effect]) {
      const spec = PARAMETRIC[effect];
      const v = Math.max(spec.min, Math.min(spec.max, num(value, spec.def)));
      filter = effect === "speed" ? `atempo=${v.toFixed(3)}`
             : effect === "volume" ? `volume=${v.toFixed(2)}`
             : `aecho=0.8:0.88:${Math.round(v)}:0.4`;
      label = `${spec.label} ${v}`;
    } else {
      throw new Error(`Unknown effect "${effect}".`);
    }

    onStage && onStage("Processing", 45);
    await runFfmpeg(ffmpeg, ["-y", "-i", inputPath, "-af", filter, "-b:a", "192k", out], label);
    return { buffer: fs.readFileSync(out), applied: label };
  } finally {
    try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch { /* temp */ }
  }
}

/** The AI pass prints the path of the cleaned file on its last line. */
function runNoiseAi(python, script, inputPath) {
  const out = path.join(os.tmpdir(), `dignoise_${Date.now()}.wav`);
  return new Promise((resolve, reject) => {
    const c = spawn(python, [script, inputPath, out], { windowsHide: true });
    let o = "", e = "";
    c.stdout.on("data", (d) => (o += d.toString()));
    c.stderr.on("data", (d) => (e += d.toString().slice(-600)));
    const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } reject(new Error("The AI noise pass timed out.")); }, 600000);
    c.on("error", reject);
    c.on("close", () => {
      clearTimeout(t);
      const last = o.trim().split(/\r?\n/).pop() || "";
      if (last.startsWith("ERR:")) return reject(new Error(last.slice(4).trim()));
      if (fs.existsSync(out)) return resolve(out);
      if (last && fs.existsSync(last)) return resolve(last);
      reject(new Error(`The AI noise pass produced nothing. ${e.slice(-160)}`));
    });
  });
}

module.exports = { apply, catalogue, EFFECTS, PARAMETRIC };
