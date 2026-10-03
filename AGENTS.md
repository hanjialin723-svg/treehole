# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

## User-approved direction · 2026-10-03

- Desktop full-bleed, expanded horizontal blue oil-pastel illustration. Preserve the supplied picture's warm yellow glow, coarse strokes, black bob-haired girl and standing doorway-book.
- Use layered raster art, perspective, lighting and subtle cursor parallax for 2.5D depth.
- Initially the girl crouches, the upright book shows its dim page surface and three large stars are dim. Clicking the book plays rise/walk/illuminate, then automatically navigates to the mood diary.
- Stars brighten and scale up on hover/focus, restoring their scene-dependent appearance on leave; each links to its own placeholder.
- Mood diary now uses a spread-open notebook overview. Each entry shows a blue date, gray content excerpt and pink mood weather. The upper-right Add Diary action and clickable entries open matching creation/editing views. Dates and short text are editable; weather is inferred from text and can be manually adjusted. The user confirmed local browser persistence for this phase; do not add accounts or sync. Star destinations remain placeholders.
- Keep local Git history. Runtime art is optimized WebP; preserve original PNGs and generation prompts under docs/design.
- Latest correction: the front-facing area circled by the user is the page surface of an upright book, not a black front cover. Remove ALL cover/page opening and closing animation. Use the same stationary page-visible book art in both dim and bright states. Only after the girl approaches should the page light, projected light and stars brighten. Keep automatic diary navigation and star interactions.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
