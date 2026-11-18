# Work web frontend (Angular) — agent instructions

Instructions for humans and AI coding agents working in `angular/`. This file is the single source
of truth; `CLAUDE.md` just imports it. Backend lives in `../API` (see `../API/CLAUDE.md`).

---

## 1. What this repo actually is (verified 2026-10-14)

| Fact | Value |
| --- | --- |
| Angular | **22.2.x** (`@angular/cli` ^22.2.2, TypeScript ~6.0.3), builder `@angular-devkit/build-angular:application`, **zone.js** |
| Component style | **NgModules** — 22 `*.module.ts`; components declare `standalone: false` and `changeDetection: ChangeDetectionStrategy.Eager` |
| Templates | New control flow (`@if`, `@for … track`, `@switch`, `@let`); `strictTemplates` on; TS `strict` |
| Styling | **Bootstrap 5** + custom CSS. **No Angular Material.** Shared CSS in `src/assets/css/*.css` (`project.css`, `task.css`, one per module), imported by `src/styles.css`; Poppins font; primary blue `#0043E0`; light/dark theme (`dark.css`, `services/Theme/`) |
| Icons | icomoon spans (`icomoon icon-*`) and `@fortawesome/angular-fontawesome` |
| Charts | `ng-apexcharts` (already installed) |
| Forms | Reactive forms; control names `txtName`, `drpStatus`, `chkActive`; `@ng-select/ng-select` |
| Routing | `app-routing.module.ts` — every feature lazy-loaded via `loadChildren` (dashboard, projects, tasks, team, agile, workflows, reports, settings, workspace, admin). **No route guards** |
| HTTP | `HttpClientModule` in `app.module.ts`, **no interceptors**. Base URL `environment.baseUrl` (`src/environments/environment.ts` → `http://localhost:5192/api/`) |
| Data | Auth/login/signup/forgot/change-password/profile services call the real API. **PM modules** (`Project`, `Task`, `Agile`, `Home`, `Team`, `Reports`, `Settings`, `Workflow`, `Workspace`) are **in-memory mocks** (`of(...).pipe(delay(...))`), shared demo data in `services/Shared/mock-directory.ts` |
| Tests | Karma + Jasmine, **22** `.spec.ts` files (mostly "should be created" smoke tests) |
| Not a git repo | only `.gitignore` |

## 2. Read before working

1. **This file.**
2. `MODULE-CONVENTIONS.md` — page skeleton, component decorator, shared CSS catalogue, reference
   implementations (`task/task-list`, `task/task-form`, `project/project-health` …), notifications /
   loader APIs. **This is the authority for any new PM screen.**
3. `SIMPLE-DESIGN-RULES.md` — the product owner's "understand a screen in 5 seconds" rules
   (max 4 KPI tiles, max 2 charts, ≤6 table columns, one primary button …).

Where the bundled Angular skills (`.claude/skills/angular*`, `.claude/context/*`) disagree with this
file or `MODULE-CONVENTIONS.md`, **this repo wins** — see §3.

## 3. How to apply the bundled Angular guidance

The official `angular-developer` skill and `context/best-practices.md` push standalone components,
signals, `inject()`, OnPush and Signal Forms. This app is **NgModule + Eager change detection +
RxJS services + reactive forms** by choice.

- Match the surrounding file. Don't convert NgModule → standalone, constructor DI → `inject()`,
  RxJS → signals, or Eager → OnPush inside a feature change. That is a migration — propose it
  separately if asked.
- New-style template syntax (`@if`/`@for`/`@let`) **is** used here — use it, don't add `*ngIf`/`*ngFor`.
- Use the Angular skills for API facts (router, forms, HttpClient, testing, CLI), not for structure.

## 4. Hard guardrails

1. **Mock-first, live per endpoint.** A mock service is replaced with `HttpClient` calls **only**
   when the matching endpoint exists in `../API` (check `../API/MyApp.Api/Controllers/`). Keep the
   method signature and returned interface identical, so components don't change.
2. **API JSON is PascalCase** (`Success`, `Token`, `User`, `ID`, `Name`). Interfaces in
   `src/app/Interface/*.ts` use the same casing. Never camelCase a field that comes from the API.
3. **Auth responses are always HTTP 200** — branch on `response.Success`, show `response.Message`.
4. **URLs:** always `${environment.baseUrl}<Controller>/...`. Never hard-code a host. No new
   external URLs / CDNs (Google Fonts is the one existing exception).
5. **No new npm packages** without asking. Charts = ng-apexcharts, drag & drop = native HTML5.
6. **Don't edit shared files** in a feature change: `services/Shared/mock-directory.ts`,
   `project/project-ui.ts`, `task/task-ui.ts`, `assets/css/project.css`, `assets/css/task.css`,
   `styles.css`, `app-routing.module.ts`, sidebar, header. Ask first.
7. **Security:** the JWT and user profile sit in `localStorage` (`services/Auth/auth.service.ts`) —
   known, don't add more sensitive keys. One `bypassSecurityTrustResourceUrl` exists
   (`workspace/document-library`, guarded to `blob:` PDFs) — don't add new ones without proving the
   source is safe. No `innerHTML =`, no `eval`.
8. **Files:** write with the Write/Edit tools (UTF-8). Don't write source through PowerShell
   `Set-Content`/`Out-File` — it breaks non-ASCII characters.
9. No `console.log` / `debugger` committed.

## 5. Tests

`MODULE-CONVENTIONS.md` says new PM modules ship **without** `.spec.ts`. Outside those modules,
follow the existing smoke-test pattern when you add a service or component. Don't add E2E tooling.

## 6. Commands (run from `angular/`)

```bash
npm ci
npm start                          # ng serve (launch config uses port 4300)
npx ngc -p tsconfig.app.json --noEmit   # fast type-check incl. templates
npm run build                      # full build — the gate before "done"
npm test -- --watch=false          # Karma, one run
```

## 7. Agents and skills in `.claude/`

Agents: `frontend-architect`, `frontend-coder`, `frontend-code-reviewer`, `frontend-designer`,
`frontend-security-auditor`, `frontend-tester`. Skills: official Angular skills + design skills —
see `.claude/PROVENANCE.md`.
