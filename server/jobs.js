/**
 * Job store — the async contract the studio front end speaks.
 *
 * WHY A JOB AT ALL
 *   Digi Biz OS's speech route was synchronous: one HTTP request held open until
 *   the audio existed. That is fine for a one-line clip and useless for a
 *   chapter, because the browser gives up long before edge-tts does. So a
 *   request here returns a job id immediately and the page polls it.
 *
 *   It also means a stage can be reported. "Working…" for ninety seconds tells
 *   the person nothing; "Narrating 4 of 11" tells them it is alive and roughly
 *   how long is left.
 *
 * Jobs live in memory and the finished audio lives on disk under data/audio, so
 * history survives a restart while the queue does not — which is the right way
 * round: a half-finished job after a crash should not be resumed silently.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_LIVE = 200;        // trim the in-memory list, not the files
const jobs = new Map();      // id -> job
const order = [];            // insertion order, for trimming

function newId() {
  return "job_" + Date.now().toString(36) + "_" + crypto.randomBytes(3).toString("hex");
}

function create(input) {
  const id = newId();
  const job = {
    job_id: id,
    status: "queued",           // queued | running | done | error
    stage: "Queued",
    progress: 0,
    engine: input.engine,
    engine_display_name: input.engineName || input.engine,
    text: input.text,
    voice: input.voice || "",
    language: input.language || "",
    style: input.style || "",
    speed: input.speed || 1,
    output_format: "mp3",
    created_at: new Date().toISOString(),
    duration_seconds: null,
    file: null,                 // relative path under data/audio
    bytes: null,
    error: null,
  };
  jobs.set(id, job);
  order.push(id);
  while (order.length > MAX_LIVE) {
    const old = order.shift();
    jobs.delete(old);
  }
  return job;
}

function get(id) {
  return jobs.get(String(id || "")) || null;
}

function stage(id, label, progress) {
  const j = jobs.get(id);
  if (!j) return;
  j.status = "running";
  j.stage = label;
  if (typeof progress === "number") j.progress = Math.max(0, Math.min(100, Math.round(progress)));
}

function fail(id, message) {
  const j = jobs.get(id);
  if (!j) return;
  j.status = "error";
  j.stage = "Failed";
  j.progress = 100;
  // Trim, because an upstream stack trace in a toast is noise, not help.
  j.error = String(message || "Something went wrong.").slice(0, 300);
}

/** Store the finished audio and mark the job done. */
function finish(id, buffer, audioDir) {
  const j = jobs.get(id);
  if (!j) return null;
  fs.mkdirSync(audioDir, { recursive: true });
  const name = `${id}.mp3`;
  fs.writeFileSync(path.join(audioDir, name), buffer);
  j.status = "done";
  j.stage = "Ready";
  j.progress = 100;
  j.file = name;
  j.bytes = buffer.length;
  // 192 kbps CBR, so bytes give a close enough length without decoding the file.
  j.duration_seconds = +(buffer.length / (192000 / 8)).toFixed(1);
  return j;
}

/** What the page shows in its history list. Newest first. */
function history(audioDir, limit = 60) {
  const rows = order
    .map((id) => jobs.get(id))
    .filter((j) => j && j.status === "done")
    .reverse()
    .slice(0, limit)
    .map((j) => ({
      id: j.job_id,
      text: j.text.slice(0, 400),
      engine: j.engine,
      engine_display_name: j.engine_display_name,
      voice: j.voice,
      duration_seconds: j.duration_seconds,
      output_format: j.output_format,
      created_at: j.created_at,
      url: `/api/audio/${j.file}`,
    }));
  return rows;
}

function remove(id, audioDir) {
  const j = jobs.get(String(id || ""));
  if (!j) return false;
  if (j.file) {
    try { fs.unlinkSync(path.join(audioDir, j.file)); } catch { /* already gone */ }
  }
  jobs.delete(j.job_id);
  const i = order.indexOf(j.job_id);
  if (i >= 0) order.splice(i, 1);
  return true;
}

function clear(audioDir) {
  let n = 0;
  for (const id of [...order]) if (remove(id, audioDir)) n++;
  return n;
}

module.exports = { create, get, stage, fail, finish, history, remove, clear };
