# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable product decisions

- The project owner selected Product Design direction 2, “Mobile Bazaar,” on 2026-10-02.
- The reference image is `docs/design-reference-mobile-bazaar.png`; match its warm sand canvas, turquoise hero, coral primary action, image-led category rail, editorial deal cards, and rounded utility-card geometry.
- `atlas dz` is a provisional working identity, not a cleared production brand. Preserve that caveat in documentation and do not expand it into trademark claims.
- French and Arabic are first-class. French is left-to-right; Arabic must switch the document direction and mirror directional composition where appropriate.
- The customer prototype must demonstrate a connected core journey rather than a homepage-only shell: home → discovery → product/offer → cart → COD checkout → confirmation → orders/tracking. Primary controls in that journey must navigate or change state.
- Synthetic cart and order state should survive refresh so deep-linked confirmation and tracking screens remain testable.
- This package is a visual and interaction prototype. Production implementation remains governed by the Phase 0 architecture package in `../../docs/phase-0/`.
