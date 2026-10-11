/**
 * Clean & Effects — repair a recording, or change the voice in it.
 *
 * The effects are listed by group, not alphabetically: repair and voice-change
 * are different intentions and mixing them in one list makes a person hunt.
 *
 * "Use this as the new input" exists because real work is a chain — remove the
 * noise, then even the level, then deepen the voice — and re-uploading the
 * result each time is the kind of friction that makes people stop at one step.
 */
const Effects = (() => {
  const $ = (id) => document.getElementById(id);

  const state = { uploadId: null, effect: null, spec: null, lastUrl: null, polling: null };
  const audio = new Audio();

  async function load() {
    let d;
    try { d = await API.effects(); }
    catch (e) { Studio.toast(e.message, "err"); return; }

    $("fxReason").textContent = d.ready ? "" : d.reason;
    $("fxRun").disabled = !d.ready;

    const groups = {};
    for (const e of d.effects) (groups[e.group] = groups[e.group] || []).push(e);

    const box = $("fxList");
    box.innerHTML = "";
    for (const [group, items] of Object.entries(groups)) {
      const h = document.createElement("div");
      h.className = "field";
      h.innerHTML = `<label>${group}</label><div class="engines" data-group="${group}"></div>`;
      box.appendChild(h);
      const holder = h.querySelector(".engines");

      for (const e of items) {
        const b = document.createElement("button");
        b.className = "engine";
        b.type = "button";
        b.dataset.id = e.id;
        b.setAttribute("aria-pressed", "false");
        if (e.id === "ai_noise" && !d.ai_ready) b.disabled = true;
        b.innerHTML =
          `<div class="engine-top">
             <div class="engine-name">${e.label}</div>
             ${e.slow ? '<span class="chip warn">slow</span>' : ""}
           </div>
           <div class="engine-for">${e.hint}</div>`;
        b.addEventListener("click", () => select(e));
        holder.appendChild(b);
      }
    }
  }

  function select(e) {
    state.effect = e.id;
    state.spec = e;
    for (const b of $("fxList").querySelectorAll(".engine")) {
      b.setAttribute("aria-pressed", String(b.dataset.id === e.id));
    }

    // Only a parametric effect shows a slider, and it arrives already set to the
    // value the server would use by default.
    const field = $("fxParamField");
    if (e.parametric) {
      const r = $("fxParam");
      r.min = e.min; r.max = e.max; r.step = e.step; r.value = e.def;
      $("fxParamVal").textContent = String(e.def);
      field.style.display = "";
    } else {
      field.style.display = "none";
    }
  }

  async function pickFile(file) {
    if (!file) return;
    $("fxFileName").textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB — reading…`;
    try {
      const dataUrl = await Studio.fileToDataUrl(file);
      const r = await API.upload(file.name, dataUrl);
      state.uploadId = r.id;
      $("fxFileName").textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB — ready`;
    } catch (e) {
      state.uploadId = null;
      $("fxFileName").textContent = "";
      Studio.toast(e.message, "err");
    }
  }

  function progress(on, stage, pct) {
    $("fxProgress").classList.toggle("on", !!on);
    if (!on) return;
    $("fxStage").textContent = stage || "Working";
    $("fxPct").textContent = (pct || 0) + "%";
    $("fxFill").style.width = (pct || 0) + "%";
  }

  async function run() {
    if (!state.uploadId) { Studio.toast("Choose a clip first."); return; }
    if (!state.effect) { Studio.toast("Pick an effect."); return; }

    $("fxRun").disabled = true;
    $("fxResultPanel").classList.remove("on");
    progress(true, "Queued", 0);

    let job;
    try {
      job = await API.applyEffect({
        uploadId: state.uploadId,
        effect: state.effect,
        value: state.spec && state.spec.parametric ? Number($("fxParam").value) : undefined,
      });
    } catch (e) {
      progress(false); $("fxRun").disabled = false; Studio.toast(e.message, "err"); return;
    }

    clearInterval(state.polling);
    state.polling = setInterval(async () => {
      let j;
      try { j = await API.job(job.job_id); }
      catch (e) { clearInterval(state.polling); progress(false); $("fxRun").disabled = false; Studio.toast(e.message, "err"); return; }

      progress(true, j.stage, j.progress);

      if (j.status === "done") {
        clearInterval(state.polling);
        progress(false);
        $("fxRun").disabled = false;
        state.lastUrl = j.url;
        $("fxResultPanel").classList.add("on");
        $("fxApplied").textContent = `${j.text || ""} · ${j.duration_seconds || "?"}s`;
        audio.src = j.url;
        audio.currentTime = 0;
        Studio.toast("Done.", "ok");
      } else if (j.status === "error") {
        clearInterval(state.polling);
        progress(false);
        $("fxRun").disabled = false;
        Studio.toast(j.error || "That effect failed.", "err");
      }
    }, 1200);
  }

  function mmss(s) {
    if (!isFinite(s) || s < 0) s = 0;
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  }

  function init() {
    $("fxFile").addEventListener("change", (e) => pickFile(e.target.files[0]));
    $("fxParam").addEventListener("input", (e) => { $("fxParamVal").textContent = e.target.value; });
    $("fxRun").addEventListener("click", run);

    $("fxPlay").addEventListener("click", () => {
      if (audio.paused) audio.play().catch(() => Studio.toast("This clip could not be played.", "err"));
      else audio.pause();
    });
    $("fxSeek").addEventListener("input", () => {
      if (audio.duration) audio.currentTime = (Number($("fxSeek").value) / 1000) * audio.duration;
    });
    audio.addEventListener("play", () => ($("fxPlay").textContent = "❚❚"));
    audio.addEventListener("pause", () => ($("fxPlay").textContent = "▶"));
    audio.addEventListener("timeupdate", () => {
      const d = audio.duration || 0, t = audio.currentTime || 0;
      $("fxTime").textContent = mmss(t) + " / " + mmss(d);
      if (!$("fxSeek").matches(":active")) $("fxSeek").value = d ? String(Math.round((t / d) * 1000)) : "0";
    });

    $("fxSave").addEventListener("click", async () => {
      if (!state.lastUrl) return;
      await Studio.saveAudioFrom(state.lastUrl, "digi-audio.mp3");
    });

    // Chain one effect into the next without going back to the file picker.
    $("fxAgain").addEventListener("click", async () => {
      if (!state.lastUrl) return;
      try {
        const blob = await fetch(state.lastUrl).then((r) => r.blob());
        const dataUrl = await Studio.blobToDataUrl(blob);
        const r = await API.upload("chained.mp3", dataUrl);
        state.uploadId = r.id;
        $("fxFileName").textContent = "Using the last result as the input";
        $("fxResultPanel").classList.remove("on");
        Studio.toast("Ready for the next effect.", "ok");
      } catch (e) { Studio.toast(e.message, "err"); }
    });

    load();
  }

  return { init };
})();
