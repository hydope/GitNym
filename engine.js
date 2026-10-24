// GitNym engine — pure logic, no DOM, no network. Shared by app.js and gitnym.mjs.
// Scoring is a transparent heuristic, NOT measured user data and NOT "proof".
// Weights (published in the UI): Length 25%, Pronounceability 25%,
// Typo-resistance 20%, Searchability 15%, Memorability 15% (SUBJECTIVE).

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

function cleanWord(w) {
  return String(w || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseKeywords(text, stopwords) {
  const stop = new Set(stopwords || []);
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s,]/g, " ")
    .split(/[\s,]+/).map(cleanWord).filter((w) => w.length >= 2 && !stop.has(w));
}

function dropVowels(w) {
  if (w.length < 5) return w;
  return w[0] + w.slice(1).replace(/[aeiou]/g, "");
}

function scoreLength(name) {
  const n = name.length;
  if (n >= 6 && n <= 12) return 100;
  if (n === 4 || n === 5) return 80;
  if (n >= 13 && n <= 16) return 70;
  if (n >= 17 && n <= 20) return 50;
  if (n < 4) return 40;
  return 30;
}

function scorePronounceability(name) {
  const vowels = (name.match(/[aeiou]/g) || []).length;
  const ratio = vowels / Math.max(1, name.length);
  let s = ratio >= 0.3 && ratio <= 0.6 ? 100 : ratio >= 0.2 && ratio < 0.7 ? 75 : 45;
  // Penalise long consonant runs.
  const runs = name.match(/[^aeiou]+/g) || [];
  const maxRun = Math.max(0, ...runs.map((r) => r.length));
  if (maxRun >= 5) s -= 30; else if (maxRun === 4) s -= 15;
  return Math.max(0, Math.min(100, s));
}

function scoreTypoResistance(name) {
  let s = 100;
  const doubles = (name.match(/(.)\1/g) || []).length;
  s -= doubles * 10;
  if (name.includes("q") && !name.includes("qu")) s -= 15;
  if (/ii|uu/.test(name)) s -= 10;
  if (name.length > 16) s -= 10;
  return Math.max(0, s);
}

function scoreSearchability(name, popular) {
  for (const p of popular || []) {
    if (name === p) return 0;
    if (editDistance(name, p) === 1) return 20;
  }
  for (const p of popular || []) {
    if (editDistance(name, p) === 2) return 50;
    if (name.includes(p) || p.includes(name)) return 40;
  }
  return 95;
}

function scoreMemorability(name, keywords, roots) {
  // SUBJECTIVE heuristic only: familiar keyword / known root + short = easier to recall.
  // This is not measured recall data.
  let s = 55;
  if ((keywords || []).some((k) => k.length >= 3 && name.includes(k))) s = 90;
  else if ((roots || []).some((r) => name.includes(r))) s = 80;
  else if (name.length <= 8) s = 70;
  if (name.length <= 8) s += 10;
  return Math.max(0, Math.min(100, s));
}

export function scoreName(name, keywords, roots, popular) {
  const parts = {
    length: scoreLength(name),
    pronounceability: scorePronounceability(name),
    typoResistance: scoreTypoResistance(name),
    searchability: scoreSearchability(name, popular),
    memorability: scoreMemorability(name, keywords, roots),
  };
  const total = Math.round(
    parts.length * 0.25 + parts.pronounceability * 0.25 +
    parts.typoResistance * 0.20 + parts.searchability * 0.15 +
    parts.memorability * 0.15);
  return { name, total, parts };
}

const VIBE_SUFFIXES = {
  playful: ["ly", "pop", "loop", "nest", "drop"],
  serious: ["base", "stack", "port", "lab", "grid"],
  hacker: ["forge", "grid", "sync", "shift", "hub"],
  minimal: ["ly", "lab", "port", "lens", "flow"],
  brandable: ["ly", "ify", "hub", "wave", "mind"],
  cli: ["hub", "sync", "grid", "port", "flow"],
  ai: ["mind", "lab", "flow", "lens", "forge"],
};

export function generateNames(description, options, wordlists) {
  const opts = options || {};
  const vibe = opts.vibe || "brandable";
  const maxLength = Math.max(4, Math.min(40, Number(opts.maxLength) || 16));
  const keywords = parseKeywords(description, wordlists.stopwords);
  const include = parseKeywords(opts.include || "", wordlists.stopwords);
  const avoid = parseKeywords(opts.avoid || "", wordlists.stopwords);
  const roots = [...include, ...keywords];
  const seedInput = [description, vibe, opts.include || "", opts.avoid || "", maxLength].join("|").toLowerCase();
  const rand = mulberry32(hashSeed(seedInput));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const suffixes = VIBE_SUFFIXES[vibe] || VIBE_SUFFIXES.brandable;
  const candidates = new Set();
  const add = (raw) => {
    const n = cleanWord(raw);
    if (n.length < 4 || n.length > maxLength) return;
    if (avoid.some((a) => a && n.includes(a))) return;
    candidates.add(n);
  };

  for (const k of roots) {
    for (const s of suffixes.slice(0, 3)) add(k + s);
    add(dropVowels(k));
    add(k + "ify");
    for (const p of wordlists.prefixes.slice(0, 6)) add(p + k);
  }
  for (const r of wordlists.roots) {
    for (const s of suffixes.slice(0, 2)) add(r + s);
  }
  for (let i = 0; i < keywords.length; i++) {
    for (let j = 0; j < keywords.length; j++) {
      if (i === j) continue;
      const a = keywords[i], b = keywords[j];
      add(a.slice(0, 4) + b.slice(-4));
      add(a.slice(0, 3) + b);
    }
  }
  for (const k of keywords) {
    add(k.replace(/ph/g, "f").replace(/y$/, "i"));
    add(k.replace(/c/g, "k"));
  }
  // Coinages, sized to fit maxLength.
  let guard = 0;
  while (candidates.size < 40 && guard++ < 200) {
    const syllables = 2 + Math.floor(rand() * 2);
    let coin = "";
    for (let i = 0; i < syllables; i++) coin += pick(wordlists.syllables);
    add(coin);
    if (roots.length) add(pick(roots).slice(0, 3) + pick(wordlists.syllables) + pick(wordlists.syllables));
  }
  // Deterministic shuffle of the pool, then score-sort (alphabetical tie-break).
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const scored = pool.map((n) => scoreName(n, keywords, wordlists.roots, wordlists.popular));
  scored.sort((a, b) => b.total - a.total || (a.name < b.name ? -1 : 1));
  // Prefer include-keyword names at the top if include words were given.
  if (include.length) {
    const withInc = scored.filter((s) => include.some((k) => s.name.includes(k)));
    const rest = scored.filter((s) => !include.some((k) => s.name.includes(k)));
    return [...withInc, ...rest].slice(0, 10);
  }
  return scored.slice(0, 10);
}
