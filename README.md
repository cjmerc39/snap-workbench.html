# Snap Workbench — self-hosting kit

Same app that runs as a Claude artifact, packaged to live on your own URL so
iOS treats it as a real home-screen app (your icon, standalone, full screen).

## Files

- `snap-workbench.html` — the app (rename to `index.html` in your repo)
- `manifest.webmanifest`, `icon-512.png`, `icon-192.png`, `icon-180.png` — PWA identity
- `snap-workbench-worker.js` — optional Cloudflare Worker (one-tap card refresh + AI coach)

## Stage 1 — GitHub Pages (phone-friendly, ~10 min)

1. github.com -> New repository -> name it `snap-workbench`, Public.
2. Add file -> Upload files -> upload everything above. Rename
   `snap-workbench.html` to `index.html` during or after upload.
3. Repo Settings -> Pages -> Source: `main` branch, root. Save.
4. Wait a minute, open `https://<you>.github.io/snap-workbench/` in Safari.
5. Share button -> Add to Home Screen. Your icon, your name, done.

What works at this stage: full builder, art, deck codes, collection,
localStorage persistence, clipboard-based DB update.
What doesn't yet: one-tap refresh and the AI coach (they need the worker,
because outside Claude an API key has to live somewhere that isn't the page).

## Stage 2 — Cloudflare Worker (laptop, ~15 min)

1. dash.cloudflare.com -> Workers & Pages -> Create Worker -> paste
   `snap-workbench-worker.js` -> Deploy. Copy the worker URL.
2. Worker Settings -> Variables:
   - Secret `ANTHROPIC_API_KEY` = your key from console.anthropic.com
   - Variable `ALLOWED_ORIGIN` = `https://<you>.github.io` (locks CORS to your site)
3. Edit `index.html` in your repo, near the top of the script:
   - `const REFRESH_URL = 'https://<your-worker>.workers.dev/cards';`
   - `const COACH_URL   = 'https://<your-worker>.workers.dev/coach';`
4. Reload the app. Settings now has **Refresh card list** (one tap, edge-cached
   an hour), and the Coach tab works, billed to your key at Sonnet prices.

## Notes

- The same `index.html` still works as a Claude artifact: with both constants
  empty it auto-uses Claude storage and Claude's built-in API access.
- Storage is per-browser when self-hosted. If you ever want cross-device sync,
  that's a small worker extension — ask Claude.
- Data source is the marvelsnapzone community feed; be a good citizen
  (the worker caches for an hour so you will be).
