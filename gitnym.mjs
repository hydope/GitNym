#!/usr/bin/env node
// GitNym CLI — no dependencies. Uses the same engine.js and data/words.json as the page.
// Usage: node gitnym.mjs "ai notes app" [--vibe playful] [--include note] [--avoid bot] [--max 16] [--check]
// --check does live npm / PyPI / GitHub-account checks from Node (no CORS issue there).
// Without --check, output is offline scoring only. Scores are heuristics, not proof.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateNames } from "./engine.js";

const dir = dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(readFileSync(join(dir, "data", "words.json"), "utf8"));

const args = process.argv.slice(2);
const desc = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!desc) {
  console.error('Usage: node gitnym.mjs "ai notes app" [--vibe playful] [--include note] [--avoid bot] [--max 16] [--check]');
  process.exit(1);
}
const opts = {
  vibe: opt("--vibe", "brandable"),
  include: opt("--include", ""),
  avoid: opt("--avoid", ""),
  maxLength: Number(opt("--max", "16")),
};
const scored = generateNames(desc.slice(0, 500), opts, words);
console.log(`GitNym — top 10 for "${desc}" (vibe: ${opts.vibe}, max: ${opts.maxLength})`);
console.log("Weights: Length 25% · Pronounceability 25% · Typo-resistance 20% · Searchability 15% · Memorability 15% (SUBJECTIVE)");
for (const s of scored) {
  console.log(`\n${s.name} — ${s.total}/100`);
  console.log(`  Length ${s.parts.length} · Pronounceability ${s.parts.pronounceability} · Typo ${s.parts.typoResistance} · Searchability ${s.parts.searchability} · Memorability ${s.parts.memorability} (SUBJECTIVE)`);
}

if (args.includes("--check")) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function status(url) {
    for (let a = 0; a < 2; a++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.status === 404) return "available";
        if (res.status === 200) return "taken";
        if ((res.status === 403 || res.status === 429) && a === 0) { await sleep(1000); continue; }
        return "unchecked";
      } catch { if (a === 0) await sleep(500); else return "unchecked"; }
    }
    return "unchecked";
  }
  console.log("\nLive checks (GitHub = account-name check ONLY, not repo uniqueness):");
  for (const s of scored) {
    const npm = await status(`https://registry.npmjs.org/${s.name}`);
    const pypi = await status(`https://pypi.org/pypi/${s.name}/json`);
    const gh = await status(`https://api.github.com/users/${s.name}`);
    console.log(`  ${s.name}: npm=${npm} pypi=${pypi} github-account=${gh === "taken" ? "exists" : gh === "available" ? "no-account" : "unchecked"}`);
    await sleep(150);
  }
} else {
  console.log("\nLive checks skipped. Re-run with --check, or use the web page for badges.");
}
