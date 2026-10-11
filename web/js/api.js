/**
 * The studio's one connection to its server. Everything that talks HTTP goes
 * through here, so a change to the contract is a change in one file.
 *
 * Errors are turned into plain sentences before they leave this layer: the UI
 * should never have to decide what an HTTP status means, and a person should
 * never be shown one.
 */
const API = (() => {
  async function call(path, options) {
    let res;
    try {
      res = await fetch(path, options);
    } catch {
      throw new Error("The studio server is not responding.");
    }
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (!res.ok) {
      throw new Error(body.message || body.error || `The studio returned ${res.status}.`);
    }
    return body;
  }

  const json = (path, method, payload) => call(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  return {
    health: () => call("/api/health"),
    engines: () => call("/api/engines"),
    quota: () => call("/api/quota"),
    generate: (payload) => json("/api/generate", "POST", payload),
    job: (id) => call("/api/jobs/" + encodeURIComponent(id)),
    history: () => call("/api/history"),
    removeHistory: (id) => json("/api/history/" + encodeURIComponent(id), "DELETE"),
    clearHistory: () => json("/api/history", "DELETE"),
    upload: (name, dataUrl) => json("/api/upload", "POST", { name, dataUrl }),
    effects: () => call("/api/effects"),
    applyEffect: (payload) => json("/api/effects/apply", "POST", payload),
    transcribeModels: () => call("/api/transcribe/models"),
    transcribe: (payload) => json("/api/transcribe", "POST", payload),
    media: (payload) => json("/api/media/start", "POST", payload),
    settings: () => call("/api/settings"),
    saveKey: (name, value) => json("/api/settings/key", "POST", { name, value }),
  };
})();
