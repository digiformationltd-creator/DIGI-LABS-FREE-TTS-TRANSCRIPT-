/**
 * Waveform. Draws the real decoded samples, not a decorative animation — the
 * point of a waveform in a voice studio is to SEE where the speech and the
 * silences are, so a fake one would be worse than none.
 *
 * Decoding happens once per clip and the peaks are cached; redrawing on every
 * progress tick only repaints.
 */
const Wave = (() => {
  let peaks = null;
  let canvas = null;

  function attach(el) { canvas = el; }

  async function load(url) {
    peaks = null;
    paint(0);
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const buckets = 260;
      const step = Math.floor(data.length / buckets) || 1;
      const out = new Float32Array(buckets);
      for (let i = 0; i < buckets; i++) {
        let peak = 0;
        const start = i * step;
        for (let j = 0; j < step; j += 4) {
          const v = Math.abs(data[start + j] || 0);
          if (v > peak) peak = v;
        }
        out[i] = peak;
      }
      peaks = out;
      ctx.close();
    } catch {
      // A clip we cannot decode still plays; it simply gets a flat bar instead
      // of a waveform. Not worth an error message.
      peaks = null;
    }
    paint(0);
  }

  function paint(progress) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 900;
    const h = 72;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const mid = h / 2;
    const n = peaks ? peaks.length : 1;
    const barW = Math.max(1.5, (w / n) * 0.62);
    const gap = w / n;
    const played = (progress || 0) * w;

    for (let i = 0; i < n; i++) {
      const x = i * gap + (gap - barW) / 2;
      const peak = peaks ? peaks[i] : 0.06;
      const bar = Math.max(2, peak * (h * 0.82));
      g.fillStyle = x <= played ? "#38BDF8" : "rgba(255,255,255,0.13)";
      g.fillRect(x, mid - bar / 2, barW, bar);
    }
  }

  return { attach, load, paint };
})();
