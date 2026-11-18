# What is in `angular/.claude/` and where it came from

Copied on 2026-10-14 from the OM.HRMS web checkout (`C:\Working\hrms\web\.claude`) so this app has
the same tooling. Two tiers live side by side — know which one you are reading.

## Tier 1 — Official, unmodified (trust these first)

| Path | Source | License |
| --- | --- | --- |
| `skills/angular-developer/` | github.com/angular/skills @ `8e47411` | MIT — Copyright 2026 Google LLC |
| `skills/angular-new-app/` | github.com/angular/skills @ `8e47411` | MIT — Angular Team @ Google |
| `context/best-practices.md` | angular.dev/assets/context/best-practices.md | Angular / Google |
| `context/guidelines.md` | angular.dev/assets/context/guidelines.md | Angular / Google |
| `context/llms.txt` | angular.dev/llms.txt | Angular / Google |

Re-sync commands: `skills/VENDORED.md`, `context/SOURCES.md`.

## Tier 2 — Community / personal skills (from the OM.HRMS owner's profile)

Not official Angular, Google or Anthropic material.

Angular-specific (4): `angular`, `angular-best-practices`, `angular-state-management`,
`angular-ui-patterns`

Design / UI (18): `frontend-design`, `design-brief`, `design-flow`, `design-review`,
`design-tokens`, `design-taste-frontend`, `information-architecture`, `minimalist-ui`,
`high-end-visual-design`, `industrial-brutalist-ui`, `redesign-existing-projects`,
`review-animations`, `emil-design-eng`, `gpt-taste`, `image-to-code`, `imagegen-frontend-web`,
`brandkit`, `stitch-design-taste`

### Before relying on them

1. **They target standalone + signals (Angular v20+ style).** This app is Angular 22 but
   **NgModule + Eager change detection + RxJS services**. Where they disagree with `AGENTS.md` or
   `MODULE-CONVENTIONS.md`, **this repo wins** (`AGENTS.md` §3).
2. **Design skills vs `SIMPLE-DESIGN-RULES.md`.** Skills like `high-end-visual-design`,
   `industrial-brutalist-ui` or `gpt-taste` push bold redesigns. The product owner wants simple,
   consistent screens. Use them for ideas only, and only when the user asks for a redesign.
3. Documentation only — no executables. Keep it that way; review any script before adding it.
4. `review-animations` is manual-invoke only (`disable-model-invocation: true`).
5. Some assume external tooling (image generation, headless browsers) a teammate may not have.

## `agents/` — written for this app

`frontend-architect`, `frontend-coder`, `frontend-code-reviewer`, `frontend-designer`,
`frontend-security-auditor`, `frontend-tester` — rewritten from the OM.HRMS versions against this
repo (verified 2026-10-14). Main differences from the HRMS originals:

- **Bootstrap 5 + shared PM CSS** (`src/assets/css/project.css`, `task.css`) instead of Angular Material.
- Services in `src/app/services/<Area>/`, interfaces in `src/app/Interface/<area>.ts`.
- `src/environments/environment.ts` **exists** (`baseUrl` → `../API` on `:5192`).
- Real API = .NET 10 `../API` with **PascalCase JSON** and 200-with-`Success` auth responses; no
  refresh tokens, no interceptors, no guards today.
- New PM modules ship without specs (`MODULE-CONVENTIONS.md`); 22 existing specs.

## Not copied

HRMS-only docs (`docs/API-CONTRACT-FOR-WEB.md`, roadmap, Gate-0, PHASE-LOG) — they don't exist here.
