/**
 * Transcribe — a file or a link becomes text.
 *
 * The two inputs are mutually exclusive on purpose: picking a file clears the
 * link and vice versa. Allowing both and silently preferring one is the kind of
 * thing that makes a person think the app ignored them.
 */
const Transcribe = (() => {
  const $ = (id) => document.getElementById(id);
  let uploadId = null;
  let polling = null;

  async function load() {
    let d;
    try { d = await API.transcribeModels(); }
    catch (e) { Studio.toast(e.message, "err"); return; }

    const sel = $("sttModel");
    sel.innerHTML = "";
    for (const m of d.models) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = `${m.label} · ${m.size}`;
      if (m.id === "base") o.selected = true;
      sel.appendChild(o);
    }
    $("sttReason").textContent = d.ready ? "" : d.reason;
    $("sttRun").disabled = !d.ready;
  }

  async function pickFile(file) {
    if (!file) return;
    $("sttUrl").value = "";
    $("sttFileName").textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB — reading…`;
    try {
      const dataUrl = await Studio.fileToDataUrl(file);
      const r = await API.upload(file.name, dataUrl);
      uploadId = r.id;
      $("sttFileName").textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB — ready`;
    } catch (e) {
      uploadId = null;
      $("sttFileName").textContent = "";
      Studio.toast(e.message, "err");
    }
  }

  function progress(on, stage, pct) {
    $("sttProgress").classList.toggle("on", !!on);
    if (!on) return;
    $("sttStage").textContent = stage || "Working";
    $("sttPct").textContent = (pct || 0) + "%";
    $("sttFill").style.width = (pct || 0) + "%";
  }

  async function run() {
    const url = $("sttUrl").value.trim();
    const mode = ($("sttMode") && $("sttMode").value) || "transcript";
    if (!url && !uploadId) { Studio.toast("Choose a file or paste a link."); return; }
    if (mode === "prompt" && !uploadId) { Studio.toast("Video → Prompt needs an uploaded video file."); return; }

    $("sttRun").disabled = true;
    $("sttResultPanel").classList.remove("on");
    progress(true, "Queued", 0);

    // A plain transcript of an uploaded AUDIO file still uses the local Whisper
    // route. Everything else — any link, or course/notes/video-prompt — goes
    // through the media-intelligence route (captions fast-path + Gemini).
    const useMedia = mode !== "transcript" || !!url;
    let job;
    try {
      job = useMedia
        ? await API.media({ mode, url, uploadId: url ? "" : uploadId })
        : await API.transcribe({ uploadId, url: "", model: $("sttModel").value, language: $("sttLang").value });
    } catch (e) {
      progress(false); $("sttRun").disabled = false; Studio.toast(e.message, "err"); return;
    }

    clearInterval(polling);
    polling = setInterval(async () => {
      let j;
      try { j = await API.job(job.job_id); }
      catch (e) { clearInterval(polling); progress(false); $("sttRun").disabled = false; Studio.toast(e.message, "err"); return; }

      progress(true, j.stage, j.progress);

      if (j.status === "done") {
        clearInterval(polling);
        progress(false);
        $("sttRun").disabled = false;
        $("sttResultPanel").classList.add("on");
        const body = j.output || j.markdown || j.transcript || "";
        $("sttOutput").value = body;
        const label = mode === "prompt" ? "video → prompt" : mode === "course" ? "course" : mode === "notes" ? "study notes" : (j.model || "transcript");
        $("sttMeta").textContent = `${label} · ${body.length} characters`;
        Studio.toast("Ready.", "ok");
      } else if (j.status === "error") {
        clearInterval(polling);
        progress(false);
        $("sttRun").disabled = false;
        Studio.toast(j.error || "Failed.", "err");
      }
    }, 1500);
  }

  function init() {
    $("sttFile").addEventListener("change", (e) => pickFile(e.target.files[0]));
    $("sttUrl").addEventListener("input", () => {
      // A link wins: clear the file so there is no doubt which one runs.
      if ($("sttUrl").value.trim()) { uploadId = null; $("sttFile").value = ""; $("sttFileName").textContent = ""; }
    });
    $("sttRun").addEventListener("click", run);

    $("sttCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("sttOutput").value); Studio.toast("Copied.", "ok"); }
      catch { Studio.toast("Could not copy — select the text instead.", "err"); }
    });

    $("sttDownload").addEventListener("click", () => {
      const blob = new Blob([$("sttOutput").value], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "transcript.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // The obvious next thing after reading a transcript is to have it spoken.
    $("sttToStudio").addEventListener("click", () => {
      document.getElementById("textEditor").value = $("sttOutput").value;
      Studio.switchView("studio");
      document.getElementById("textEditor").dispatchEvent(new Event("input"));
    });

    load();
  }

  return { init };
})();
