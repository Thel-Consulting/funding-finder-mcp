# Quartz design tokens

Quartz is a design system by Arlan Marat.

## Sources, in order of preference

1. Canonical source (MIT License, Copyright (c) 2026 Arlan Marat): https://github.com/arla6ka/skills/tree/main/systems/quartz,
   sparse-cloned read-only at commit `1aaaa1b47ba5a18b47b0ebcac684ade460c6823f` into `design/quartz-src/` (gitignored). `systems/quartz/tokens.css` is the token file.
2. Agent spec index: https://design.how/systems/quartz.md, saved as `design/quartz-spec.md`. Per-page specs fetched from
   `https://design.how/systems/quartz/<foundations|components>/<name>.md` and the `theme` registry item
   (https://design.how/r/quartz/theme.json) are saved in `design/quartz/` (gitignored).
3. Public site HTML and CSS at https://design.how/systems/quartz (first pass, before the sources above were available).

The website's copy-the-prompt email gate was never used. No email was entered and no form was submitted.

Cross-check: the values below were compared between the GitHub `tokens.css`, the registry `tokens.css` and the site CSS bundle.
`--ink-c`, `--paper-c`, `--grey-c`, `--canvas-c`, `--hue-3-*`, `--warn-text`, `--fail-text`, `--line-frame-alpha`,
`--radius-*`, `--font-sans` and `--font-mono` match exactly. Hex values in this file are our own OKLCH to sRGB conversions,
used only as fallbacks in SVG files for renderers without `oklch()` support.

Retrieved 2026-10-16.

Page sources used:

- https://design.how/systems/quartz/foundations/color (.md)
- https://design.how/systems/quartz/foundations/typography (.md)
- https://design.how/systems/quartz/foundations/space (.md)
- https://design.how/systems/quartz/foundations/radius (.md)
- https://design.how/systems/quartz/foundations/borders-and-lines (.md)
- https://design.how/systems/quartz/foundations/elevation (.md)
- https://design.how/systems/quartz/foundations/anti-slop (.md)
- https://design.how/systems/quartz/foundations/iconography (.md)
- https://design.how/systems/quartz/foundations/grid (.md)
- https://design.how/systems/quartz/components/table, status, badge, card, panel, timeline (.md)

## Base channels (light theme, `.quartz`)

| Token | Value | Hex (converted) |
| --- | --- | --- |
| `--ink-c` | `20% .024 262` | `#101621` |
| `--paper-c` | `99.7% .001 250` | `#fefeff` |
| `--grey-c` | `95.6% .004 255` | `#eff1f3` |
| `--canvas-c` | `99.1% .002 250` | `#fbfcfd` |
| `--text-on-field-c` | `20% .024 262` | `#101621` |
| `--shadow-alpha` | `.2` | |

Dark theme (`[data-theme=dark]`): `--ink-c: 96.5% .006 250`, `--paper-c: 18.5% .016 262`,
`--grey-c: 23.5% .018 262`, `--canvas-c: 15% .014 262`.

## Surfaces and text

- `--surface-canvas: oklch(var(--canvas-c))` (the fog behind cards)
- `--surface-page: var(--paper)` (paper: cards and frames)
- `--surface-card: oklch(var(--grey-c))` (grey field)
- `--surface-raised: var(--paper)`
- `--surface-hover: oklch(var(--ink-c) / 0.05)`, `--surface-selected: oklch(var(--ink-c) / 0.09)`
- `--surface-inverse: var(--ink)`
- `--text-1: var(--ink)`, `--text-2: oklch(var(--ink-c) / 0.80)`, `--text-3: oklch(var(--ink-c) / 0.66)`, `--text-disabled: oklch(var(--ink-c) / 0.40)`, `--text-inverse: var(--paper)`

## Kind hues (category, never status)

| Kind | Hue | mark | line | wash | label |
| --- | --- | --- | --- | --- | --- |
| Agent | hue-1 (195) | `oklch(86% 0.120 195)` | `oklch(60% 0.100 195)` | `oklch(96.5% 0.040 195)` | `oklch(38% 0.062 195)` |
| Key | hue-2 (320) | `oklch(82% 0.080 320)` | `oklch(58% 0.075 320)` | `oklch(96% 0.030 320)` | `oklch(38% 0.062 320)` |
| Run | hue-3 (250) | `oklch(72% 0.100 250)` | `oklch(52% 0.150 250)` | `oklch(94.5% 0.020 250)` | `oklch(38% 0.062 250)` |
| Deploy | hue-4 (290) | `oklch(72% 0.110 290)` | `oklch(54% 0.150 290)` | `oklch(95% 0.025 290)` | `oklch(38% 0.062 290)` |
| Model | hue-5 (160) | `oklch(75% 0.100 160)` | `oklch(52% 0.090 160)` | `oklch(96% 0.035 160)` | `oklch(38% 0.062 160)` |

Each hue also has `-field` and `-tint` steps (see color page). Mapping `data-kind=agent` to hue-1 and so on is from the CSS bundle.

Converted hex for hues used in this repo: hue-3 mark `#73a9e1`, hue-3 line `#006bbb`, hue-3 wash `#e3eefa`, hue-3 label `#274562`.

## Trouble colors (the only status colors)

| Token | Value | Hex |
| --- | --- | --- |
| `--warn-mark` | `oklch(80% 0.152 68)` | `#fda93f` |
| `--warn-line` | `oklch(62% 0.132 68)` | `#b97410` |
| `--warn-wash` | `oklch(96% 0.028 68)` | `#ffefde` |
| `--warn-text` | `oklch(49% 0.100 68)` | `#855412` |
| `--fail-mark` | `oklch(65.2% 0.219 26)` | `#f94341` |
| `--fail-line` | `oklch(60% 0.236 26)` | `#ec1627` |
| `--fail-wash` | `oklch(94.5% 0.027 26)` | `#ffe6e3` |
| `--fail-text` | `oklch(51% 0.180 26)` | `#b72728` |

## Status

Status words published: Idle, Queued, Running, OK, Warning, Failed, Waiting on you. The overview demo also shows "Limited" in the live activity table. Rules from the status page:

- OK is never colored green; only warn and fail take a text color (`--warn-text`, `--fail-text`).
- No colored dots or squares; the status word is the status. Running uses a small turning arc.
- Sort status columns by statusRank: fail 6, waiting 5, warn 4, running 3, queued 2, ok 1, idle 0.
- Words in sentence case, one to three words.

There is no published "OK" or "Limited" color token. We did not invent one.

## Typography

- `--font-sans: "Quartz Sans", ui-sans-serif, system-ui, sans-serif`
- `--font-mono: "Quartz Mono", ui-monospace, "SF Mono", Menlo, monospace`
- Quartz Sans and Quartz Mono are not bundled; the system fallbacks render instead.
- `--weight-body: 340`, `--weight-medium: 400`, `--features-data: "tnum", "zero", "ss04"`, `--tracking-display: -0.025em`
- Scale (size/line, weight): display-xl 80/80 400, display-lg 60/66, display 40/44, heading-lg 32/36, heading 24/28, heading-sm 20/24, heading-xs 16/20, body-lg 16/22 340, body 14/20 340, body-sm 13/18 380, label 14/16 400, label-sm 12/16, code 13/20 mono, code-sm 12/16 mono, stat 32/36.

## Space, radius, lines, elevation

- Space (4px steps): `--space-0-5 2px`, `-1 4px`, `-2 8px`, `-3 12px`, `-4 16px`, `-5 20px`, `-6 24px`, `-8 32px`, `-10 40px`, `-15 60px`, `-20 80px`, `-30 120px`. Card text inset 16px, rows 40px (56px with description), card header 40px, 12px between cards, 32px between sections.
- Radius: `--radius-0 0px`, `--radius-inner 4px`, `--radius-soft 6px`, `--radius-frame 10px`, `--radius-full 999px` (round means a person).
- Lines: `--line-hair 1px`, `--line-accent 2px`, `--line-focus 2px`, `--line-frame-alpha 0.14`, `--border-hair oklch(var(--ink-c) / 0.08)`, `--border-faint / 0.05`, `--border-strong / 0.12`, `--border-control / 0.50`, `--line-frame oklch(var(--ink-c) / 0.14)`, `--line-row / 0.08`.
- Elevation: `--elev-control 0 1px 2px -1px oklch(var(--text-on-field-c) / calc(var(--shadow-alpha) * 0.6))`, `--elev-overlay 0 0 0 1px var(--line-frame), 0 12px 24px -12px oklch(var(--text-on-field-c) / var(--shadow-alpha))`. Cards take no shadow.

## Component patterns observed

- Data table: header row in label type, mono only for ids (`run_8f2a91`), a Status column with the word, footer like "48 rows, sorted by Status worst first".
- Run trace / timeline: Step, Started at, Took, Status columns; one time unit per timeline.
- Rollout card: stages (Draft, Canary 10%, Evals, Everyone) each with a status word and duration; one primary action.
- Status pills: Quartz says not to round badges into pills; badges keep the 4px corner and status is the word.

## Anti-slop rules applied in this repo

Sentence case, no em dashes, no middle dots between facts, no eyebrow labels, no colored status dots, no tinted alert blocks, no glow or gradient art, mono only for code, ids and paths, round corners only for people.

## How this repo applies them

- `docs/vendor/quartz/tokens.css`: unchanged copy of the canonical `tokens.css` with its MIT `LICENSE`. Vendoring is allowed by that license.
- `docs/site.css`: layout for `docs/index.html` and `docs/privacy.html`. Every color, size, radius, line and type value is a `var(--token)` from that file (checked by script: no referenced token is missing). Patterns: `.quartz` on `<body>`; one frame per table (`--surface-page`, 1px `--line-frame`, `--radius-frame`); 40px header and rows (`--space-10`) with `--line-row` rules; `--type-label` headers in `--text-3`; a right-aligned status column (`--status-column`) holding the status word (`--type-state-word`, ink for OK, `--warn-text`/`--fail-text` only for trouble); mono only for tool names, endpoints and code; `--surface-card` well for code; `--surface-canvas` behind frames; no shadows, gradients, pills, dots or side bars.
- `assets/logo.svg` (draft, needs approval): square 128 viewBox rendered at 512px, a flat `--ink` plate with `--radius-frame` (10) corners, paper (`--paper-c`) search ring and handle, and three `--hue-3-mark` (run blue) bars. No warm hues, no gradient, glow or ring. Colors are written as `oklch()` in CSS with converted hex fallbacks.
- `assets/tools-table.svg` (README visual): a Quartz table frame of the five tools using `--surface-canvas`, `--surface-page`, `--line-frame`, `--line-row`, `--text-1`, `--text-3`, `--type-label`, `--type-body-sm` and `--type-code` values.
- No status pills: Quartz rules out pills and colored dots; the status word is used instead. No "OK" or "Limited" color tokens exist in Quartz, so none were invented. OK renders in ink.
- Fonts: Quartz Sans and Quartz Mono are not bundled with Quartz; the token stacks fall back to the platform UI sans and monospace.
