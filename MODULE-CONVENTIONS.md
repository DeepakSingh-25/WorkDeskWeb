# Conventions for new PM modules (Angular app in D:\Working\work\angular)

Angular 22, **NgModule based** (not standalone), Bootstrap 5 + custom CSS, Poppins font, primary blue `#0043E0`.
There is **no backend** for these modules: every screen runs on an in-memory mock service.

## Read these first (they are the reference implementation — copy their patterns)
- `src/app/task/task-list/task-list.component.{ts,html}` — list page: header, filters, status tabs, table, pagination, row actions
- `src/app/task/task-board/*` — kanban with native HTML5 drag & drop
- `src/app/task/task-calendar/*` — month calendar grid
- `src/app/task/task-form/*` — create/edit form (reactive forms, validation, sticky action bar, side preview card)
- `src/app/task/task-drawer/*`, `task-detail/*` — right-side drawer
- `src/app/project/project-health/*` — ApexCharts usage (`apx-chart`, ng-apexcharts types)
- `src/app/project/project-settings/*` — settings page with switches and danger zone
- `src/app/services/Task/task.service.ts` — mock service pattern
- `src/app/services/Shared/mock-directory.ts` — **shared demo data** (USERS, DEPARTMENTS, TEAMS, ROLES, PROJECTS, helpers). Import from it; do not edit it.
- `src/app/project/project-ui.ts`, `src/app/task/task-ui.ts` — view helpers (initials, avatarClass, statusClass, priorityClass, daysBetween, today, formatMinutes, formatBytes …). Reuse `TaskUi` (it extends ProjectUi).
- `src/assets/css/project.css` + `src/assets/css/task.css` — shared CSS classes (catalogue below)

## Component rules
```ts
@Component({
    selector: 'app-xxx',
    templateUrl: './xxx.component.html',
    styleUrl: './xxx.component.css',          // create the file (can be empty)
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
```
- Declare every component in your module's `declarations`. Module imports usually: `CommonModule, FormsModule, ReactiveFormsModule, NgSelectModule, NgApexchartsModule (only if charts), FontAwesomeModule, <Your>RoutingModule`.
- Templates use the new control flow: `@if`, `@for (x of list; track x.ID)`, `@switch`. `strictTemplates` is ON — keep types correct (use `$any()` only when unavoidable).
- Reactive forms; control names prefixed like the codebase: `txtName`, `drpStatus`, `chkActive`. Validation text: `"<Field> is Required"` in `<div class="text-danger fs-13">`. Required labels: `class="form-label required"`.
- Buttons follow the theme: `btn btn-primary` (+ `<span class="icomoon icon-save me-2"></span> Save`), `btn btn-success` (Reset, `icon-reset`), `btn btn-danger` (Cancel, `icon-cancel`), `btn btn-outline`, `btn btn-red`.
- Notifications / loader (inject like task components do):
  - `notificationsService.showNotification('success' | 'error', message)`
  - `notificationsService.showdelete(message): Promise<boolean>` (delete confirmation)
  - `notificationsService.showConfirm(message): Promise<boolean>`
  - `loaderService.showLoader()` / `hideLoader()`
- Icons: icomoon spans (`icomoon icon-edit`, `icon-delete`, `icon-eye`, `icon-save`, `icon-reset`, `icon-cancel`, `icon-search`, `icon-filter`, `icon-setting`, `icon-users`, `icon-user`, `icon-mail`, `icon-check`, `icon-download`, `icon-plus1` …) or `<fa-icon [icon]="faX" />` from `@fortawesome/free-solid-svg-icons`.
- **No new npm packages. No external URLs/CDNs.** Charts = ng-apexcharts (already installed). Drag & drop = native HTML5 events.
- No `.spec.ts` files.
- Use the Write/Edit tools for files (UTF-8). Do NOT write files through PowerShell `Set-Content`/`Out-File` (it breaks non-ASCII characters).

## Page skeleton
```html
<div class="dashboard-content p-3 p-sm-4 mt-60 pm-page" id="<module>">   <!-- id = team | agile | workflow | reports | settings | workspace -->
  <div class="breadcrumb-lite mb-1"><a routerLink="/...">Module</a> / Screen</div>
  <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
    <div><h2 class="fw-bold mb-0">Title</h2><p class="text-gray mb-0 fs-13">One line subtitle.</p></div>
    <div class="d-flex gap-2"> ...primary actions... </div>
  </div>
  <app-<module>-nav></app-<module>-nav>   <!-- module sub navigation, see below -->
  ...
</div>
```
- The class `pm-page` turns on all shared CSS below. Module-specific CSS goes in **`src/assets/css/<module>.css`**, every selector scoped under `#<module>` (e.g. `#agile .story-card{…}`). The lead will add the `@import` to `styles.css` — do not edit `styles.css`.
- Each module has a small **sub-navigation component** (`<module>-nav`) shown on every screen of the module, using the `.project-tabs` style (`<nav class="project-tabs">` with `routerLinkActive="active"`) or `.view-tabs`.
- Must work on mobile widths (Bootstrap grid, `table-responsive`, wrap flex rows).

## Shared CSS catalogue (available inside `.pm-page`)
- Cards: `.card-box` > `.card-head` (with `h5`) + `.card-body`; `.danger-zone`; `.sticky-actions` (form footer)
- KPI tiles: `.dashboard-box.box-1|box-2|box-3|box-4` with `h5` (value) + `p` (label), optional `.stat-icon`
- Table: wrapper `div.p-0.table-certificate.shadow.table-responsive` > `table.table.rounded.table-striped.align-middle`, header row `tr.lightblue`, body rows `tr.content`; empty state row with `../../assets/images/no_record_found.webp` (width 200px) + `<h6>No Record Found</h6>`; pagination exactly like task-list (`.pagination.pagination-sm`, `.totRecords`). Sort arrows: `../../assets/images/certificate/top-arrow.svg` / `bottom-arrow.svg`.
- Pills: `.pill` (+ `<span class="dot"></span>`) with `.st-notstarted .st-progress .st-hold .st-completed .st-cancelled .st-delayed .st-pending .st-review .st-todo`; health `.hl-ontrack .hl-atrisk .hl-offtrack`; priority text `.pr-low .pr-medium .pr-high .pr-critical`
- `.progress-thin > .bar(.green|.orange|.red)` with `[style.width.%]`
- Avatars: `.avatar` (+ `.lg`) with `[ngClass]="ui.avatarClass(name)"` and `ui.initials(name)`; `.avatar-stack`
- Buttons: `.icon-btn(.danger|.success)`, `.btn-outline`, `.btn-red`, `.view-toggle > button.active`
- Tabs/filters: `.project-tabs > a.active`, `.view-tabs > a.active`, `.status-tabs > button.active > .count`, `.filter-bar`, search box `div.search.position-relative.icomoon.icon-search > input`
- Labels/meta: `.label-chip`, `.blocked-chip`, `.meta-icon`, `.task-key`, `.text-gray`, `.text-black`, `.fs-13`, `.fw-600`, `.breadcrumb-lite`, `.meta-item > .label + .value`, `.section-title > .num`
- Kanban: `.board > .board-col(.drag-over) > .board-col-head(h6 .bullet) + .board-col-body > .board-card(.dragging) (.title .prio-bar)`, `.quick-add`
- Calendar: `.cal > .cal-head(div*7) + .cal-grid > .cal-day(.other .weekend .today .drag-over) > .num + .cal-chip(.done .late .review)`; `.cal-more`
- Drawer: `.drawer-backdrop` + `aside.drawer > .drawer-head + .drawer-body`; inner tabs `.detail-tabs > a.active > .badge-count`; `.field-grid > .k + value`
- Lists: `.ms-list > .ms-item(.done .active .late) > .ms-dot` (vertical timeline), `.act-day`, `.act-item > .act-icon(.status .comment .attachment .worklog .created .dependency)` (activity feed), `.subtask`, `.dep-item`
- Comments: `.comment > .comment-bubble`, `.mention`, `.composer`
- Files: `.dropzone(.drag-over)`, `.file-card > .file-thumb(.pdf .xls .doc) + .file-meta > .name`
- Timer: `.timer-box(.running) .timer-clock .timer-dot .btn-start .btn-stop`
- Settings: `.setting-row`, `.form-switch .form-check-input`, `.day-chip(.active)`
- Health ring: `.health-ring > .inner`, `.health-dim`, `.risk-item`
- Gantt: `.gantt …`, `.gantt-legend > span > i`
- Gantt-free colors: blue `#0043E0`, green `#029848`, orange `#ffa529`/`#C77800`, red `#FB6240`/`#E0401C`, purple `#7A3FE4`, grey `#8A94A6`, border `#CAD8FF`, light bg `#F4F7FF` / `#EAF0FF`.

## Mock services
- File: `src/app/services/<Module>/<module>.service.ts`, `@Injectable({ providedIn: 'root' })`, header NOTE comment (no API yet; in-memory; resets on refresh).
- Methods return `Observable<T>` via `of(value).pipe(delay(200))`; mutating methods return `{ Status: '<Entity> Added Successfully...' | '... Updated Successfully...' | '... Deleted Successfully!' }` like TaskService; list methods may return `PagedResult<T>` (`{ Result, FilterRecords }`, from `Interface/project.ts`).
- Interfaces: `src/app/Interface/<module>.ts` (PascalCase property names like the rest of the app).
- Seed realistic data around **today (dates relative to `new Date()`)** using names from `mock-directory.ts`. You may READ data from `TaskService` / `ProjectService` (inject and call their public methods) to stay consistent; never modify those services.

## Do NOT touch
`app-routing.module.ts`, `sidebar/*`, `header/*`, `styles.css`, `assets/css/project.css`, `assets/css/task.css`, anything in `src/app/project`, `src/app/task`, `src/app/services/Project`, `src/app/services/Task`, `mock-directory.ts`, other modules' folders. Other agents are building other modules **in parallel** in sibling folders.

## Verify (mandatory before reporting done)
From `D:\Working\work\angular` run:
```
npx ngc -p tsconfig.app.json --noEmit
```
(~1 min, type-checks TS **and templates**). Fix every error in your files. Errors located in other modules' folders belong to other agents — ignore them, but mention them. Do **not** run `ng build` or `ng serve`.

## Final report (keep under 200 words)
Routes (URL → screen), components created, service/interface files, anything stubbed or not done, and the exact CSS file you created.
