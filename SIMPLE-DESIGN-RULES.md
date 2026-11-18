# Simple design rules (apply to every screen)

The product owner finds the current screens too busy. Goal: **anyone should understand a screen in 5 seconds.**
**Keep every feature, route and service method** — only simplify how things are shown. If something advanced is hidden, it must still be reachable (toggle, "More filters", "Show details", "⋯" menu, or a tab).

## 1. Lists & feeds — one idea per row
- Each row = avatar or nothing + **one plain sentence** + at most **one** small item on the right (time, status pill or a single action).
- No second grey "meta" line under the text unless it is essential to understand the row.
- Use the shared `.simple-row` > `.avatar` + `.simple-text` (with `<b>` for the person and the thing) + `.simple-time` (in `task.css`, works inside `.pm-page` / `#task`).
- For activity entries use `TaskUi.simpleActivity(a)` → render `<b>{{ user }}</b> {{ s.Action }} <b>{{ s.Target }}</b> {{ s.After }}` (Angular `@let s = ui.simpleActivity(a);`). Example: **Rohit Mehta** moved **Quotation template** to In Progress · 2 hours ago.

## 2. Remove visual noise
- No decorative icon circles / emoji glyph badges in front of every row, no timeline connector lines (`.act-item`, `.act-icon`, `.ms-item` lines) in lists — use `.simple-row` instead.
- No colored dots unless they carry meaning. A single status pill is fine.
- Max one label chip per row/card (show "+2" for the rest).
- Avoid nested boxes inside boxes; one `card-box` level is enough.

## 3. Plain words, no codes or jargon
- Hide internal codes in lists and cards: task keys (CRM-12, SDA-3), request IDs (APR-1004), versions (v4) — show the human title. Keys may stay small in a detail header only. Use `TaskUi.stripKey(title)` when a title already contains a key.
- No abbreviations: use `TaskUi.ago(iso)` ("2 hours ago", "Yesterday"), `TaskUi.dueLabel(task)` ("3 days late", "Due tomorrow"), `TaskUi.formatMinutes(min)` ("1 hr 30 min").
  Write "story points" not "pts", "people" instead of "FTE", "late" instead of "overdue/breached" where natural, explain SLA once as "response time limit".
- Subtitles: one short sentence saying what the screen is for.

## 4. Fewer things at once
- **Max 4 KPI tiles** per screen. Keep the most useful; drop or move the rest.
- **Max 2 charts visible** per screen. Extra charts go under a collapsed "Show more charts" toggle (button `btn btn-outline btn-sm`, state in a component boolean).
- **Filters:** search box + at most 2 important filters visible. The rest go behind a "More filters" toggle (collapsed by default). Keep a "Clear" link only when filters are active.
- **Tables:** max ~6 columns. Merge/remove low-value columns. No chip lists inside cells.
- **Actions:** one primary button per screen header. Row actions: max 2 icon buttons; move the rest to a small "⋯" dropdown (Bootstrap `dropdown` with `data-bs-toggle="dropdown"`) or into the detail view.
- Forms: show required + common fields first; optional/advanced fields in a collapsed "More options" section.

## 5. Keep it consistent
- Same page skeleton, colors and components as before (see MODULE-CONVENTIONS.md). Do not introduce new design systems.
- Empty states: one sentence + one clear next-step button.
- Do not change behaviour, data or URLs. Do not edit shared files (`task-ui.ts`, `project-ui.ts`, `project.css`, `task.css`, services of other modules, `mock-directory.ts`, `styles.css`, app-routing, sidebar, header). Your own module's components, templates, `<module>-ui.ts` helpers and `<module>.css` are yours to edit.
- Remove CSS rules and TS fields that become unused in your files.

## Verify
From D:\Working\work\angular run `npx ngc -p tsconfig.app.json --noEmit` (templates are type-checked) and fix every error in your files. Do not run ng build / ng serve.

## Final report (under 150 words)
Per screen: one line of what you simplified. Anything you deliberately left as is and why.
