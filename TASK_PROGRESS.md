# Atlas DZ checkpoint — 2026-11-15

- State: launch-ready behind owner switches (live COD needs `ATLAS_LIVE_CHECKOUT`,
  `ATLAS_LEGAL_REVIEWED`, legal facts, SMTP). Migrations 000001–000029 (checksum-locked).
- Redesign (approved canvas https://claude.ai/artifact/AJ5F9bMj9rcGwcjGBwhnVS, blue direction):
  A foundations+nav done (88c5051), B shop done (d8f7b1a). Next: C native customer app
  (fonts via @expo-google-fonts + Text wrapper, home/tabs), D seller web+app, E admin/support.
  Shop styles: globals.css + redesign.css (tokens, header, cart groups). Seller: theme.css.
  Seller Center browser checks need explicit user approval (not given yet).
- Tests: e2e.mjs shop 11/11 (needs prod build on 3001; local checkout only for demo
  customer; restart API if 429 on /local/session), mobile-app.mjs 20/20, mobile-seller.mjs 11/11.
- Resume: pnpm via `npx -y pnpm@11.19.0 --dir <repo>` from outside the repo; Expo needs Node 24.
- Remaining: owner legal/VPS/domain/SMTP; EAS build → Play; push, multi-photo, specs,
  per-commune prices before checkout, which seller fails DELIVERY_UNAVAILABLE, admin offer titles.
