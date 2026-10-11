/**
 * The audio player. A plain <audio> element does the work; this wraps it so the
 * waveform, the seek bar and the time read from one source of truth instead of
 * drifting apart.
 */
const Player = (() => {
  const audio = new Audio();
  let els = null;

  function mmss(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  }

  function sync() {
    if (!els) return;
    const d = audio.duration || 0;
    const t = audio.currentTime || 0;
    els.time.textContent = mmss(t) + " / " + mmss(d);
    // Do not fight the person while they are dragging the handle.
    if (!els.seek.matches(":active")) {
      els.seek.value = d ? String(Math.round((t / d) * 1000)) : "0";
    }
    Wave.paint(d ? t / d : 0);
  }

  function attach(nodes) {
    els = nodes;

    els.play.addEventListener("click", () => {
      if (audio.paused) audio.play().catch(() => Studio.toast("This clip could not be played.", "err"));
      else audio.pause();
    });

    els.seek.addEventListener("input", () => {
      if (audio.duration) audio.currentTime = (Number(els.seek.value) / 1000) * audio.duration;
    });

    audio.addEventListener("play", () => { els.play.textContent = "❚❚"; els.play.setAttribute("aria-label", "Pause"); });
    audio.addEventListener("pause", () => { els.play.textContent = "▶"; els.play.setAttribute("aria-label", "Play"); });
    audio.addEventListener("ended", () => { els.play.textContent = "▶"; Wave.paint(0); });
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
  }

  async function load(url) {
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    await Wave.load(url);
    sync();
  }

  return { attach, load, url: () => audio.src, play: () => audio.play().catch(() => {}) };
})();
