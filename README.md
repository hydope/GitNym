# GitNym v4

Live: https://hydope.github.io/GitNym/

**Tagline:** Names that are searchable — and actually available on npm, PyPI and domains.

A static name generator: type a one-line description, get 10 ranked names with a transparent score breakdown. Vanilla JS ES modules + one CSS file, no build step, no backend, no secrets, no key required.

## What it checks

For the final 10 names only, queued with backoff and cached in `localStorage` for 24 hours:

- **npm** — exact name via `registry.npmjs.org` (404 = available, 200 = taken)
- **PyPI** — exact name via `pypi.org/pypi/<name>/json`
- **GitHub account** — exact name via `api.github.com/users/<name>`. This checks whether a GitHub **account** (user/org) exists. It is **not** a repo-uniqueness check.
- **Domain .com** — DNS-over-HTTPS hint only, via `dns.google/resolve`. **Resolves does not mean available.** If the DoH request fails in the browser, the badge becomes "unchecked" and that check is cut for the session, not guessed.

Any failed, rate-limited, or CORS-failed check shows **"unchecked"** with a manual link — never a guessed checkmark.

## What it does NOT claim

- It does **not** claim GitHub repo names are globally unique. They are unique per owner only. A name another owner uses can still be created under your account — what matters is npm, PyPI, domains, and search confusion.
- Scores are **heuristics, not proof**: Length 25%, Pronounceability 25%, Typo-resistance 20%, Searchability 15%, Memorability 15% (**SUBJECTIVE** — a heuristic, not measured recall). No score predicts success or virality.
- Searchability only warns about similarity to a small popular-names list in `data/words.json`. It never marks a GitHub repo name "Taken".
- No AI / BYOK mode in v1. Generation is deterministic: the same description, vibe, include/avoid words, and max length always give the same top 10 in the same order.
- No canvas share image, no popularity panels, no compare mode in v1 — those were cut in the v4 plan.

## Cut in this build, with reasons

- **Domain check is conditional, not guaranteed.** It is attempted via DoH in the page, but this build environment has no live browser to verify DoH CORS from a real browser origin, so the page treats any DoH failure as "unchecked" rather than claiming the check works. If DoH fails consistently in a real browser, cut the domain badge entirely per the v4 kill rule.
- **No giant popular-repo index.** Replaced by the small warning list in `data/words.json` plus live checks, per the v4 plan (Search API limits make a full index infeasible).
- **GitHub Pages deployment** is via `.github/workflows/pages.yml` (static Pages deploy on push to main).

## Run locally

```bash
cd gitnym
python3 -m http.server 8000
# open http://localhost:8000/
```

Or `npx serve .` — any static server works. Opening via `file://` may block the `data/words.json` fetch; the page then falls back to a minimal built-in list so scoring still works.

## CLI (same engine, same wordlists, same order)

```bash
node gitnym.mjs "ai notes app"
node gitnym.mjs "ai notes app" --vibe playful --include note --avoid bot --max 16
node gitnym.mjs "ai notes app" --check   # also runs live npm / PyPI / GitHub-account checks
```

The CLI reads `data/words.json` and imports `engine.js`, the same module the page imports, so page and CLI return the same top 10 for the same inputs.

## Name check note (2026-10-24)

GitNym checked 2026-10-24 via the GitHub API: **0 exact GitHub repo matches, `hydope/GitNym` free, npm `gitnym` free, PyPI `gitnym` free.** Recheck at creation — a check is not a reservation. **Close to Nym** (the `nymtech/nym` privacy network): the trademark/confusion check is still open. **Do not claim the name is cleared.**

## Files

- `index.html` — page, form, weights, honest-limits section
- `styles.css` — the one CSS file, mobile-first
- `app.js` — UI, URL state, favorites, live-check queue + cache
- `engine.js` — pure scoring/generation, shared by page and CLI
- `gitnym.mjs` — Node CLI, no dependencies
- `data/words.json` — small wordlists + popular-names warning list
