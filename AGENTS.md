# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

## User-approved direction · 2026-10-03

- Desktop full-bleed, expanded horizontal blue oil-pastel illustration. Preserve the supplied picture's warm yellow glow, coarse strokes, black bob-haired girl and standing doorway-book.
- Use layered raster art, perspective, lighting and subtle cursor parallax for 2.5D depth.
- Initially the girl crouches, the book is closed and three large stars are dim. Clicking the book plays rise/walk/open/illuminate, then automatically navigates to the mood diary.
- Stars brighten and scale up on hover/focus, restoring their scene-dependent appearance on leave; each links to its own placeholder.
- Mood diary is the next part of this same app; currently only a destination placeholder. Do not invent diary functionality until the user provides the next requirements.
- Keep local Git history. Runtime art is optimized WebP; preserve original PNGs and generation prompts under docs/design.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
