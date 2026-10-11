/**
 * The studio itself — state, events, and the one polling loop.
 *
 * Two decisions worth stating:
 *
 *   The engine list is built from what the SERVER says is ready, never from a
 *   hardcoded list. An engine whose key is missing arrives disabled with the
 *   reason attached, so the person is told what to do instead of discovering it
 *   when Generate fails.
 *
 *   Generation polls a job rather than holding a request open. A chapter takes
 *   minutes, and the stage name ("Speaking 4 of 11") is the difference between
 *   waiting and wondering whether it has hung.
 */
const Studio = (() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    engines: [],
    engineId: null,
    voice: "",
    style: "",
    speed: 1,
    rtl: false,
    polling: null,
  };

  const SAMPLE = "DigiFormation Ltd builds software that does the quiet work: the reports nobody wants to write, the follow-ups nobody remembers to send, and the paperwork that keeps a company compliant. This clip was produced in Digi Labs.";
  const SAMPLE_UR = "ڈیجی فارمیشن لمیٹڈ وہ سافٹ ویئر بناتا ہے جو خاموشی سے کام کرتا ہے۔ یہ آواز ڈیجی وائس اسٹوڈیو میں تیار کی گئی ہے۔";

  // ── Toasts ────────────────────────────────────────────────────────────────
  function toast(message, kind) {
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), kind === "err" ? 7000 : 4000);
  }

  // ── Header status ─────────────────────────────────────────────────────────
  async function refreshStatus() {
    const pill = $("statusPill"), text = $("statusText");
    try {
      const h = await API.health();
      pill.className = "status-pill online";
      text.textContent = h.gemini_keys
        ? `Studio online · ${h.gemini_keys} key${h.gemini_keys === 1 ? "" : "s"}`
        : "Studio online";
      // No plumbing names here either — just the product line.
      $("aboutText").textContent = `DIGI LABS ${h.version} · DigiFormation Ltd`;
      // No Gemini key → show the banner so Studio Voice has an obvious way in.
      // Free Voice still works, so this is an invitation, not a block.
      $("keyBanner").classList.toggle("on", !h.gemini_keys);
    } catch {
      pill.className = "status-pill offline";
      text.textContent = "Studio offline";
    }
  }

  // ── Engines ───────────────────────────────────────────────────────────────
  async function loadEngines() {
    let data;
    try { data = await API.engines(); }
    catch (e) { toast(e.message, "err"); return; }

    state.engines = data.engines || [];
    const list = $("engineList");
    list.innerHTML = "";

    for (const e of state.engines) {
      const b = document.createElement("button");
      b.className = "engine";
      b.type = "button";
      b.dataset.id = e.id;
      b.setAttribute("aria-pressed", "false");
      if (!e.ready) b.disabled = true;

      const quotaChip = e.quota
        ? `<span class="chip ${e.quota.remaining > 0 ? "ok" : "warn"}">${e.quota.remaining}/${e.quota.total} left today</span>`
        : `<span class="chip ok">unlimited</span>`;

      b.innerHTML =
        `<div class="engine-top">
           <div>
             <div class="engine-name">${e.name}</div>
             <div class="engine-sub">${e.subtitle}</div>
           </div>
           ${quotaChip}
         </div>
         <div class="engine-for">${e.best_for}</div>` +
        (e.ready ? "" : `<div class="engine-why">${e.reason}</div>`);

      b.addEventListener("click", () => selectEngine(e.id));
      list.appendChild(b);
    }

    // Open on the first engine that can actually run, not simply the first one.
    const firstReady = state.engines.find((e) => e.ready);
    if (firstReady) selectEngine(firstReady.id);
    else {
      $("generateBtn").disabled = true;
      toast("No voice engine is ready yet — open Settings.", "err");
    }
  }

  function selectEngine(id) {
    const engine = state.engines.find((e) => e.id === id);
    if (!engine || !engine.ready) return;
    state.engineId = id;

    for (const b of document.querySelectorAll(".engine")) {
      b.setAttribute("aria-pressed", String(b.dataset.id === id));
    }

    const voice = $("voiceSelect");
    voice.innerHTML = "";
    for (const v of engine.voices || []) {
      const o = document.createElement("option");
      o.value = v.id; o.textContent = v.label;
      voice.appendChild(o);
    }
    // An Urdu body of text should not default to an English voice.
    if (state.rtl) {
      const ur = (engine.voices || []).find((v) => v.lang === "ur");
      if (ur) voice.value = ur.id;
    }
    state.voice = voice.value;

    const style = $("styleSelect");
    style.innerHTML = "";
    // Styles now arrive as {id, label}; the first one (Normal / Natural) is the
    // default, which is the plain voice rather than an advert read.
    for (const s of engine.styles || []) {
      const o = document.createElement("option");
      o.value = typeof s === "string" ? s : s.id;
      o.textContent = typeof s === "string" ? (s.charAt(0).toUpperCase() + s.slice(1)) : s.label;
      style.appendChild(o);
    }
    state.style = style.value;

    // Only the free engine takes a speed; sending one to Gemini would be ignored
    // silently, so the control is disabled rather than lying.
    const speedOn = id === "free";
    $("speedSlider").disabled = !speedOn;
    $("speedReset").disabled = !speedOn;
    $("generateBtn").disabled = false;
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  function counts() {
    const t = $("textEditor").value;
    $("charCount").textContent = String(t.length);
    $("wordCount").textContent = String((t.trim().match(/\S+/g) || []).length);
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async function generate() {
    const text = $("textEditor").value.trim();
    if (!text) { toast("Type or paste some text first."); return; }
    if (!state.engineId) { toast("Pick a voice engine first."); return; }

    const btn = $("generateBtn");
    btn.disabled = true;
    showProgress("Queued", 0);
    $("resultPanel").classList.remove("on");

    const engine = state.engines.find((e) => e.id === state.engineId);
    const voiceMeta = (engine.voices || []).find((v) => v.id === state.voice);

    let job;
    try {
      job = await API.generate({
        engine: state.engineId,
        text,
        voice: state.voice,
        language: (voiceMeta && voiceMeta.lang) || (state.rtl ? "ur" : "en"),
        style: state.style,
        speed: state.speed,
      });
    } catch (e) {
      hideProgress(); btn.disabled = false; toast(e.message, "err"); return;
    }

    poll(job.job_id);
  }

  function poll(id) {
    clearInterval(state.polling);
    state.polling = setInterval(async () => {
      let j;
      try { j = await API.job(id); }
      catch (e) {
        clearInterval(state.polling); hideProgress();
        $("generateBtn").disabled = false; toast(e.message, "err"); return;
      }

      showProgress(j.stage, j.progress);

      if (j.status === "done") {
        clearInterval(state.polling);
        hideProgress();
        $("generateBtn").disabled = false;
        await showResult(j);
        toast("Voice ready.", "ok");
        loadHistory();
        loadEngines();                 // the quota moved
      } else if (j.status === "error") {
        clearInterval(state.polling);
        hideProgress();
        $("generateBtn").disabled = false;
        toast(j.error || "Generation failed.", "err");
      }
    }, 1200);
  }

  function showProgress(stage, pct) {
    $("progress").classList.add("on");
    $("progressStage").textContent = stage || "Working";
    $("progressPct").textContent = (pct || 0) + "%";
    $("progressFill").style.width = (pct || 0) + "%";
  }
  function hideProgress() { $("progress").classList.remove("on"); }

  async function showResult(j) {
    $("resultPanel").classList.add("on");
    $("resultHint").textContent = j.engine_display_name || "";
    $("resultMeta").innerHTML =
      [`${j.voice || "—"}`, `${j.duration_seconds ? j.duration_seconds + "s" : "—"}`,
       `${(j.output_format || "mp3").toUpperCase()}`,
       new Date(j.created_at).toLocaleTimeString()]
        .map((x) => `<span class="chip">${x}</span>`).join("");
    await Player.load(j.url);
    $("resultPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── History ───────────────────────────────────────────────────────────────
  async function loadHistory() {
    const box = $("historyList");
    let items = [];
    try { items = (await API.history()).items || []; }
    catch { /* an empty history and an unreachable one look the same to the person */ }

    if (!items.length) {
      box.innerHTML =
        `<div class="empty"><div class="empty-mark">♪</div>
         <div>Nothing here yet</div>
         <p>Clips you generate will be listed here.</p></div>`;
      return;
    }

    box.innerHTML = "";
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "hist";
      row.innerHTML =
        `<button class="play-btn" aria-label="Play">▶</button>
         <div class="hist-body">
           <div class="hist-text"></div>
           <div class="hist-meta">${it.engine_display_name} · ${it.voice || "—"} · ${it.duration_seconds || "?"}s · ${new Date(it.created_at).toLocaleString()}</div>
         </div>
         <button class="btn btn-ghost btn-sm" data-act="del">Delete</button>`;
      // textContent, not innerHTML: this string came from whatever was typed.
      row.querySelector(".hist-text").textContent = it.text;

      row.querySelector(".play-btn").addEventListener("click", async () => {
        await Player.load(it.url);
        Player.play();
        switchView("studio");
        $("resultPanel").classList.add("on");
        $("resultHint").textContent = it.engine_display_name;
        $("resultMeta").innerHTML = [it.voice || "—", (it.duration_seconds || "?") + "s", "MP3"]
          .map((x) => `<span class="chip">${x}</span>`).join("");
      });

      row.querySelector('[data-act="del"]').addEventListener("click", async () => {
        try { await API.removeHistory(it.id); loadHistory(); }
        catch (e) { toast(e.message, "err"); }
      });

      box.appendChild(row);
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  async function loadSettings() {
    let s;
    try { s = await API.settings(); }
    catch (e) { toast(e.message, "err"); return; }

    const box = $("slotList");
    box.innerHTML = "";
    s.slots.forEach((slot, i) => {
      const row = document.createElement("div");
      row.className = "slot";
      // A friendly label, not the raw env-var name — the customer sees
      // "Gemini key 1", never GEMINI_API_KEY_1.
      row.innerHTML =
        `<span class="slot-name">Gemini key ${i + 1}</span>
         <div class="grow"><input type="password" placeholder="${slot.filled ? "•••••••• saved" : "paste a key"}"></div>
         <button class="btn btn-sm">Save</button>` +
        (slot.filled ? `<button class="btn btn-ghost btn-sm" data-act="clear">Remove</button>` : "");

      const input = row.querySelector("input");
      row.querySelector(".btn").addEventListener("click", async () => {
        const v = input.value.trim();
        if (!v) { toast("Paste a key first."); return; }
        try {
          await API.saveKey(slot.name, v);
          input.value = "";
          toast("Key saved.", "ok");
          loadSettings(); loadEngines(); refreshStatus();
        } catch (e) { toast(e.message, "err"); }
      });

      const clear = row.querySelector('[data-act="clear"]');
      if (clear) clear.addEventListener("click", async () => {
        try { await API.saveKey(slot.name, ""); toast("Key removed."); loadSettings(); loadEngines(); refreshStatus(); }
        catch (e) { toast(e.message, "err"); }
      });

      box.appendChild(row);
    });
    // The engine paths (Python, FFmpeg, voice package) are deliberately NOT
    // shown — a customer never needs the plumbing, and naming it only invites
    // confusion. If an engine is missing, the relevant tab says so in plain
    // words at the point of use instead.
  }

  // ── Views ─────────────────────────────────────────────────────────────────
  function switchView(name) {
    for (const t of document.querySelectorAll(".tab")) {
      t.setAttribute("aria-selected", String(t.dataset.view === name));
    }
    for (const v of document.querySelectorAll(".view")) {
      v.classList.toggle("active", v.id === "view-" + name);
    }
    if (name === "history") loadHistory();
    if (name === "settings") loadSettings();
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  function init() {
    Wave.attach($("wave"));
    Player.attach({ play: $("playBtn"), seek: $("seek"), time: $("timeLabel") });

    // Window controls — only present in the desktop shell.
    const win = window.studio || {};
    $("wcMin") && $("wcMin").addEventListener("click", () => win.minimize && win.minimize());
    $("wcMax") && $("wcMax").addEventListener("click", () => win.maximize && win.maximize());
    $("wcClose") && $("wcClose").addEventListener("click", () => win.close && win.close());

    // The key banner's two buttons: open Google AI Studio, or jump to Settings.
    $("kbGet") && $("kbGet").addEventListener("click", () => {
      const url = "https://aistudio.google.com/apikey";
      if (win.openExternal) win.openExternal(url); else window.open(url, "_blank");
    });
    $("kbAdd") && $("kbAdd").addEventListener("click", () => switchView("settings"));

    for (const t of document.querySelectorAll(".tab")) {
      t.addEventListener("click", () => switchView(t.dataset.view));
    }

    $("textEditor").addEventListener("input", counts);
    $("clearBtn").addEventListener("click", () => { $("textEditor").value = ""; counts(); });
    $("sampleBtn").addEventListener("click", () => {
      $("textEditor").value = state.rtl ? SAMPLE_UR : SAMPLE;
      counts();
    });

    $("urduToggle").addEventListener("click", (e) => {
      state.rtl = !state.rtl;
      e.currentTarget.setAttribute("aria-pressed", String(state.rtl));
      $("textEditor").classList.toggle("rtl", state.rtl);
      if (state.engineId) selectEngine(state.engineId);   // re-pick a matching voice
    });

    $("voiceSelect").addEventListener("change", (e) => { state.voice = e.target.value; });
    $("styleSelect").addEventListener("change", (e) => { state.style = e.target.value; });

    $("speedSlider").addEventListener("input", (e) => {
      state.speed = Number(e.target.value);
      $("speedVal").textContent = state.speed.toFixed(2) + "×";
    });
    $("speedReset").addEventListener("click", () => {
      state.speed = 1; $("speedSlider").value = "1"; $("speedVal").textContent = "1.00×";
    });

    $("generateBtn").addEventListener("click", generate);

    $("saveBtn").addEventListener("click", async () => {
      const url = Player.url();
      if (!url) { toast("Generate something first."); return; }
      await saveAudioFrom(url, "digi-labs.mp3");
    });

    $("folderBtn").addEventListener("click", () => {
      if (window.studio && window.studio.openFolder) window.studio.openFolder();
      else toast("The audio folder is only available in the desktop app.");
    });

    $("clearHistoryBtn").addEventListener("click", async () => {
      try { await API.clearHistory(); loadHistory(); toast("History cleared."); }
      catch (e) { toast(e.message, "err"); }
    });

    window.addEventListener("resize", () => Wave.paint(0));

    counts();
    refreshStatus();
    loadEngines();
    loadHistory();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  const fileToDataUrl = (file) => blobToDataUrl(file);

  /** Save any clip the studio holds. Uses the desktop Save dialog where there
   *  is one; a browser only gets the download link. */
  async function saveAudioFrom(url, name) {
    if (window.studio && window.studio.saveAudio) {
      const dataUrl = await fetch(url).then((r) => r.blob()).then(blobToDataUrl);
      const r = await window.studio.saveAudio(name, dataUrl);
      if (r && r.ok) toast("Saved.", "ok");
      else if (r && !r.canceled) toast(r.error || "Could not save.", "err");
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    Transcribe.init();
    Effects.init();
  });
  return { toast, switchView, blobToDataUrl, fileToDataUrl, saveAudioFrom };
})();
