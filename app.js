import { generateNames } from "./engine.js";

const $ = (id) => document.getElementById(id);
const CACHE_KEY = "gitnym-checks-v1";
const TTL = 24 * 60 * 60 * 1000;
let wordlists = null;
let favorites = new Set(JSON.parse(localStorage.getItem("gitnym-favorites") || "[]"));
let checksRemaining = 0;
let lastScored = [];

// Custom character limit: preset select, or "Custom…" + a number input (4–32).
// Returns { maxLength, clamped } where clamped is true if the user's number
// was outside 4–32 and had to be clamped. The engine also clamps, but the
// UI reports the clamp explicitly instead of silently changing the input.
function effectiveMaxLength() {
  const preset = $("maxLen").value;
  if (preset !== "custom") return { maxLength: Number(preset), clamped: false };
  const raw = Number($("customMax").value);
  if (!Number.isFinite(raw)) return { maxLength: 16, clamped: false, missing: true };
  const clamped = Math.max(4, Math.min(32, Math.floor(raw)));
  return { maxLength: clamped, clamped: clamped !== raw };
}
function syncCustomInput() {
  const isCustom = $("maxLen").value === "custom";
  $("customMax").disabled = !isCustom;
  if (isCustom && !$("customMax").value) $("customMax").value = "10";
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* storage full/blocked: checks just re-run */ } }

function setChecksRemaining(n) {
  checksRemaining = n;
  $("checksRemaining").textContent = n > 0 ? `Live checks remaining: ${n}` : "Live checks complete (or cached).";
}
function tickCheck() { setChecksRemaining(Math.max(0, checksRemaining - 1)); }

async function fetchStatus(url) {
  // Returns: "available" (404), "taken" (200), "unchecked" (anything else / failure).
  // One retry with backoff on 403/429, then unchecked — never a guessed checkmark.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 404) return "available";
      if (res.status === 200) return "taken";
      if ((res.status === 403 || res.status === 429) && attempt === 0) { await sleep(1000); continue; }
      return "unchecked";
    } catch {
      if (attempt === 0) { await sleep(500); continue; }
      return "unchecked";
    }
  }
  return "unchecked";
}

async function checkOne(name, source) {
  const cache = loadCache();
  const key = `${source}:${name}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.at < TTL) { tickCheck(); return hit.value; }
  let value = "unchecked";
  try {
    if (source === "npm") value = await fetchStatus(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    else if (source === "pypi") value = await fetchStatus(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    else if (source === "github") {
      // Account-name check ONLY — not a repo-uniqueness check.
      value = await fetchStatus(`https://api.github.com/users/${encodeURIComponent(name)}`);
      // For GitHub, "taken" means an account with that name exists.
      value = value === "taken" ? "account-exists" : value === "available" ? "no-account" : "unchecked";
    } else if (source === "domain") {
      // DNS-over-HTTPS hint only. Attempted, not guaranteed: CORS/network failure => unchecked.
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}.com&type=A`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) value = "unchecked";
        else {
          const data = await res.json();
          value = (data.Answer && data.Answer.length) ? "resolves-hint" : "no-resolve-hint";
        }
      } catch { value = "unchecked"; }
    }
  } catch { value = "unchecked"; }
  cache[key] = { at: Date.now(), value };
  saveCache(cache);
  tickCheck();
  return value;
}

function badge(label, value, manualUrl) {
  const cls = value === "taken" || value === "account-exists" || value === "resolves-hint" ? "taken"
    : value === "available" || value === "no-account" || value === "no-resolve-hint" ? "ok" : "unchecked";
  const text = {
    taken: "taken", available: "available", unchecked: "unchecked",
    "account-exists": "account exists", "no-account": "no account",
    "resolves-hint": "resolves (hint only)", "no-resolve-hint": "does not resolve (hint only)",
  }[value] || "unchecked";
  return `<span class="badge ${cls}">${label}: ${text}</span> <a href="${manualUrl}" target="_blank" rel="noopener">check manually</a>`;
}

function renderFavorites() {
  const ul = $("favorites");
  ul.innerHTML = favorites.size ? "" : "<li>No favorites yet. Star a name below to save it here.</li>";
  for (const f of favorites) {
    const li = document.createElement("li");
    li.textContent = f + " ";
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "secondary"; btn.textContent = "Copy";
    btn.addEventListener("click", () => navigator.clipboard?.writeText(f).catch(() => {}));
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function renderResults(scored) {
  const ol = $("results");
  ol.innerHTML = "";
  scored.forEach((s) => {
    const li = document.createElement("li");
    li.className = "card";
    const fav = favorites.has(s.name) ? "★ Favorited" : "☆ Favorite";
    li.innerHTML = `<div class="name">${s.name} <span class="small">(${s.name.length} chars)</span></div>
      <div class="score">Score ${s.total}/100</div>
      <div class="breakdown">Length ${s.parts.length} (25%) · Pronounceability ${s.parts.pronounceability} (25%) · Typo-resistance ${s.parts.typoResistance} (20%) · Searchability ${s.parts.searchability} (15%) · Memorability ${s.parts.memorability} (15%, SUBJECTIVE)</div>
      <div class="badges" aria-label="Availability checks for ${s.name}">Checking…</div>
      <div><button type="button" class="fav secondary" aria-label="Favorite ${s.name}">${fav}</button>
      <button type="button" class="copy secondary">Copy</button></div>`;
    li.querySelector(".fav").addEventListener("click", (e) => {
      if (favorites.has(s.name)) favorites.delete(s.name); else favorites.add(s.name);
      localStorage.setItem("gitnym-favorites", JSON.stringify([...favorites]));
      e.target.textContent = favorites.has(s.name) ? "★ Favorited" : "☆ Favorite";
      renderFavorites();
    });
    li.querySelector(".copy").addEventListener("click", () => navigator.clipboard?.writeText(s.name).catch(() => {}));
    ol.appendChild(li);
  });
  return [...ol.querySelectorAll(".badges")];
}

async function runChecks(scored) {
  const badgeEls = renderResults(scored);
  const sources = ["npm", "pypi", "github", "domain"];
  setChecksRemaining(scored.length * sources.length);
  // Sequential queue with a small delay — respects rate limits, shows progress.
  for (let i = 0; i < scored.length; i++) {
    const name = scored[i].name;
    const parts = [];
    for (const src of sources) {
      const v = await checkOne(name, src);
      const manual = src === "npm" ? `https://www.npmjs.com/package/${name}`
        : src === "pypi" ? `https://pypi.org/project/${name}/`
        : src === "github" ? `https://github.com/${name}`
        : `https://domains.google.com/registrar/search?searchTerm=${name}.com`;
      const label = src === "github" ? "GitHub account (NOT repo uniqueness)"
        : src === "domain" ? "Domain .com (hint only)" : src;
      parts.push(badge(label, v, manual));
      await sleep(150);
    }
    badgeEls[i].innerHTML = parts.join(" ");
  }
  setChecksRemaining(0);
}

async function loadWordlists() {
  if (wordlists) return wordlists;
  try {
    const res = await fetch("data/words.json");
    if (!res.ok) throw new Error("words fetch failed");
    wordlists = await res.json();
  } catch {
    // Offline / file-protocol fallback: minimal list so scoring still works.
    wordlists = { prefixes: ["neo", "mini"], suffixes: ["ly", "hub", "lab"], roots: ["atlas", "echo"], syllables: ["ka", "lo", "mi"], popular: ["react", "vue"], stopwords: ["a", "the", "app"] };
  }
  return wordlists;
}

function readParams() {
  const p = new URLSearchParams(location.search);
  return { desc: p.get("desc") || "", vibe: p.get("vibe") || "brandable", include: p.get("include") || "", avoid: p.get("avoid") || "", maxLength: p.get("max") || "16" };
}
function writeParams(o) {
  const p = new URLSearchParams({ desc: o.desc, vibe: o.vibe, include: o.include, avoid: o.avoid, max: String(o.maxLength) });
  history.replaceState(null, "", `?${p.toString()}`);
}

async function generate(e) {
  if (e) e.preventDefault();
  const desc = $("desc").value.trim().slice(0, 500);
  if (!desc) { $("status").textContent = "Type a one-line description first."; $("results").innerHTML = ""; return; }
  const eff = effectiveMaxLength();
  if (eff.missing) { $("status").textContent = "Choose a custom max length (4–32) or pick a preset."; return; }
  const opts = { vibe: $("vibe").value, include: $("include").value, avoid: $("avoid").value, maxLength: eff.maxLength };
  writeParams({ desc, ...opts });
  const wl = await loadWordlists();
  const scored = generateNames(desc, opts, wl);
  lastScored = scored;
  const overLimit = scored.filter((s) => s.name.length > eff.maxLength);
  $("status").textContent = `Generated ${scored.length} names for “${desc}”, all ≤ ${eff.maxLength} chars. Same inputs always give the same order.` +
    (eff.clamped ? ` Custom limit was clamped to ${eff.maxLength} (allowed range 4–32).` : "") +
    (overLimit.length ? ` WARNING: ${overLimit.length} names exceed the limit — this should not happen; please report it.` : "");
  await runChecks(scored);
}

function initTheme() {
  const saved = localStorage.getItem("gitnym-theme");
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    document.body.classList.toggle("dark", t === "dark");
    $("themeBtn").textContent = `Dark mode: ${t}`;
  };
  let theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  apply(theme);
  $("themeBtn").addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("gitnym-theme", theme);
    apply(theme);
  });
}

$("form").addEventListener("submit", generate);
$("maxLen").addEventListener("change", syncCustomInput);
$("copyAll").addEventListener("click", () => {
  if (!lastScored.length) { $("status").textContent = "Generate names first, then Copy all will copy them."; return; }
  const text = lastScored.map((s) => `${s.name} — ${s.total}/100`).join("\n");
  navigator.clipboard?.writeText(text).then(() => { $("status").textContent = `Copied ${lastScored.length} names.`; }).catch(() => { $("status").textContent = "Copy failed — your browser blocked clipboard access."; });
});
$("clearFavs").addEventListener("click", () => {
  favorites.clear();
  localStorage.setItem("gitnym-favorites", "[]");
  renderFavorites();
  document.querySelectorAll(".fav").forEach((b) => { b.textContent = "☆ Favorite"; });
});
renderFavorites();
initTheme();
syncCustomInput();

// Shareable URL state: auto-generate on load if a description is in the URL.
// A max value outside the presets restores as Custom + that number.
const params = readParams();
if (params.desc) {
  $("desc").value = params.desc.slice(0, 500);
  $("vibe").value = params.vibe;
  $("include").value = params.include;
  $("avoid").value = params.avoid;
  if (["12", "16", "20", "24"].includes(params.maxLength)) {
    $("maxLen").value = params.maxLength;
  } else {
    $("maxLen").value = "custom";
    $("customMax").value = params.maxLength;
  }
  syncCustomInput();
  loadWordlists().then((wl) => {
    const scored = generateNames(params.desc, { vibe: params.vibe, include: params.include, avoid: params.avoid, maxLength: Number(params.maxLength) }, wl);
    lastScored = scored;
    $("status").textContent = `Loaded from shared link: ${scored.length} names, all ≤ ${params.maxLength} chars.`;
    runChecks(scored);
  });
}
