# Web spec — Projects (`/projects`): mock → real API

Status: **Proposed** · Date: 2026-10-22 · API contract: [`../../../API/docs/specs/007-projects.md`](../../../API/docs/specs/007-projects.md) (proposed — endpoints P1–P10, M1–M4, MS1–MS5, S1–S2, A1; SQL `007-projects.sql` must be run by the DB owner first)
Pattern to copy: the Settings › Users / Roles go-live (`SettingsService`, `settings-users.component.ts` §errors — `handleError` / `errorMessage` / `endSession`).

## 1. Goal / scope

Replace every in-memory array in `services/Project/project.service.ts` with `HttpClient` calls, keep screens looking and behaving the same, and add what the mock never needed: Guid user IDs, server errors, concurrency (409), and permission-based buttons.

**Guardrail (`AGENTS.md` §4.1):** go live **per endpoint, only after it exists** in `../API/MyApp.Api/Controllers/ProjectsController.cs`. Method names stay; return shapes stay except where §3 forces a type change (user IDs → string).

In scope:
- `ProjectService` (all methods), `Interface/project.ts`
- the 7 components in `src/app/project/` and `project-routing.module.ts`
- `ProjectContextService`

Out of scope:
- Tasks, Agile, Team, Workflows, Reports, Workspace mocks.
- `getProjectTasks` / timeline: returns `of([])` until the Tasks spec.
- Visibility enforcement (API Q4).
- Notifications and the weekly report.

**Do not edit** `AGENTS.md` §4.6 shared files: `mock-directory.ts`, `project-ui.ts`, `project.css`, `app-routing.module.ts`, sidebar, header. Ask first if one has to change (see §7 Home / Reports).

## 2. Service — `services/Project/project.service.ts`

Base: `private url = \`${environment.baseUrl}Projects\``. Auth header comes from `AuthInterceptor` (no extra `authHeaders()` needed; if the file's neighbours still add it, match them). JSON PascalCase. The service does **not** catch errors: `HttpErrorResponse` goes to the component (same as Users).

### 2.1 Method mapping

**Projects**

| Method | HTTP | Notes |
|---|---|---|
| `getPaginatedProjectList(startIndex, length, sortColumn, sortColumnDir, criteriaSearch, status='', archived=false)` | `GET Projects` (P1) | `HttpParams`: `StartIndex, Length, SortColumn, SortDir, Search, Status, Archived`. Empty values are omitted. Returns `PagedResult<Project>`. |
| `getProjectSummary()` | `GET Projects/summary` (P2) | typed `ProjectSummary` (no more `any`) |
| `getProjectByID(ID)` | `GET Projects/{id}` (P3) | **404 ⇒ `of(undefined)`** via `catchError` (only 404; rethrow the rest), so the components' "not found" branches keep working |
| `projectAddEdit(data)` | `AddEdit 'A'` ⇒ `POST Projects` (P4); `'E'` ⇒ `PUT Projects/{ID}` (P5) | body = `SaveProjectRequest` (§3); returns `ProjectActionResponse` |
| `archiveProject(ID)` / `restoreProject(ID)` | `POST Projects/{id}/archive` / `restore` (P6 / P7) | |
| `deleteProject(ID)` | `DELETE Projects/{id}` (P8) | |
| **new** `getNextCode()` | `GET Projects/next-code` (P10) | `Observable<string>` (only if API Q2 = suggest) |

**Lookups (P9)**

| Method | HTTP | Notes |
|---|---|---|
| `getUserList()` / `getCategoryList()` / `getRoleList()` + **new** `getCurrencyList()` | one `GET Projects/lookups` | Cached in the service: `private lookups$ = this.http.get(...).pipe(shareReplay({ bufferSize: 1, refCount: false }))`. Reset the cache on error so a retry works. `getCategoryList()` now returns `ProjectCategory[]` (`{ID, Name}`). |

**Members**

| Method | HTTP |
|---|---|
| `getProjectMembers(ProjectID)` | `GET Projects/{id}/members` (M1) |
| `memberAddEdit({ID, ProjectID, UserID, Role, Allocation})` | `ID` ⇒ `PUT Projects/{ProjectID}/members/{ID}` (M3), else `POST Projects/{ProjectID}/members` (M2) |
| `removeMember(ProjectID, ID)` (**signature change**: adds ProjectID) | `DELETE Projects/{ProjectID}/members/{ID}` (M4) |

**Milestones**

| Method | HTTP |
|---|---|
| `getMilestones(ProjectID)` | `GET Projects/{id}/milestones` (MS1) |
| `milestoneAddEdit(data)` | `ID` ⇒ `PUT …/milestones/{ID}` (MS3), else `POST …/milestones` (MS2). Body: `Title, Description, StartDate, DueDate, Status, Progress, OwnerUserID, RowVersion` |
| **new** `completeMilestone(ProjectID, ID)` | `POST …/milestones/{ID}/complete` (MS4) — replaces the partial `milestoneAddEdit({ID, Status:'Completed'…})` call |
| `deleteMilestone(ProjectID, ID)` (**signature change**) | `DELETE …/milestones/{ID}` (MS5) |

**Settings and activity**

| Method | HTTP |
|---|---|
| `getProjectSettings(ProjectID)` | `GET Projects/{id}/settings` (S1) |
| `saveProjectSettings(data)` | `PUT Projects/{id}/settings` (S2): **one call** with `General` + `Preferences` (§4.7) |
| **new** `getActivity(ProjectID, take = 20)` | `GET Projects/{id}/activity` (A1), only if API Q10 = yes |

**Timeline**

| Method | HTTP |
|---|---|
| `getProjectTasks(ProjectID)` | `of([])` |

### 2.2 Delete from the file
- Data arrays: `users`, `projects`, `members`, `milestones`, `tasks`, `settings`, `roles`.
- Seed and helpers: `seed()`, `respond()`, `latency`, `today()`, `addDays()`, `addMemberInternal()`, `defaultSettings()`.
- The `NOTE: Backend me abhi Project endpoints nahi hain` doc comment (replace it with a one-line note pointing to spec 007).

The file goes from ~405 to ~120 lines.

## 3. Interfaces — `Interface/project.ts`

| Change | Why |
|---|---|
| `Project.ManagerID: string`, `MemberIDs: string[]` | `Users.Id` is a Guid |
| `Project.CategoryID: number \| null` (keep `Category: string` for display) | categories come from a table |
| `Project.RowVersion: string`, `CanEdit: boolean`, `CanDelete: boolean` | concurrency + button gating |
| `Project.ArchivedOn?`, `ArchivedBy?` (name) stay. `Health`, `Progress`, `TotalTasks`, `CompletedTasks` stay but are **read-only from the server** | |
| `ProjectMember.UserID: string`, add `UserStatus: 'Active' \| 'Suspended' \| 'Deleted'` | suspended people stay on the project |
| `Milestone`: add `OwnerUserID: string \| null`, `RowVersion`, `OutsideProjectDates?: boolean`; `OwnerName` stays (display) | owner is a user, not a string |
| `ProjectUser.ID: string` | |
| `ProjectSettings` unchanged (`WorkingDays: string[]` — API maps the bitmask) | |
| New `ProjectSummary { Total, InProgress, Completed, OnHold, Overdue, Archived }` | replaces `any` |
| New `ProjectCategory { ID: number; Name: string }` | |
| New `ProjectLookups { Users: ProjectUser[]; Categories: ProjectCategory[]; MemberRoles: string[]; Currencies: string[] }` | |
| New `SaveProjectRequest` (API §5.2) and `ProjectActionResponse { Success; Message; Code?; ID?; Errors?: Record<string, string[]> \| null }` | |
| New `SaveProjectSettingsRequest { General: { Name, Status, Priority, ManagerUserID, RowVersion }, Preferences: ProjectSettings }` | |

Then compile with `ng build` and fix every place where a number user ID is compared. Known places: project-create, members, milestones, settings, `home.service.ts:65,84`, `reports.service.ts:177,441` (see §7).

## 4. Component changes (templates unchanged unless noted)

### 4.0 Shared in every component
- Copy the error helpers from `settings-users.component.ts`: `handleError(err, fallback)`, `errorMessage(err, fallback)`, `endSession()`.
  - 401 ⇒ logout and `/login` (skip if the interceptor already navigated).
  - 403 / 404 / 409 / 400 ⇒ toast the server `Message` and the field `Errors`.
  - Status 0 ⇒ offline text.
- Replace the current `handleError` that only toasts "Something went wrong".
- **Never** compare `res.Status === 'Project Added Successfully...'`. Use `res.Success` + `res.Message`.
- Use `finalize(() => this.loaderService.hideLoader())` on every call that shows the loader. Today several `subscribe(res => …)` calls have no error branch, so the loader stays stuck on error.
- Permission helpers come from `EntitlementService` (`can('Projects', 'Create' | 'Edit' | 'Delete')`) together with the server's `project.CanEdit` / `project.CanDelete`. Expose them as getters `canCreate`, `canEdit`, `canDelete`.

### 4.1 `project-list`
- Summary: `ProjectSummary` type.
- Sort: keep the column names sent today (`Name`, `EndDate`, `Progress`, default `Code`). They are all in the API whitelist.
- Search: debounce **300 ms** (a `Subject` + `debounceTime` + `distinctUntilChanged`) instead of calling the API on every keystroke.
- `userMap` keyed by string ID.
- Hide **+ Create Project** when `!canCreate`. Hide row **Edit** / **Archive** when `!can('Projects','Edit')`. View stays.
- Archive 409 / 404 ⇒ toast and reload list + summary.
- Empty state: real DB starts empty. The existing "no projects" text must show, not a blank table. Check the template has it; add one line if not.

### 4.2 `project-create` (add / edit)
- Code:
  - API Q2 = suggest: on create, call `getNextCode()` and patch `txtCode`; keep it editable.
  - Else: start blank.
  - Remove `Math.random()` in both `ngOnInit` and `resetForm`.
- Category dropdown: `bindValue` = `ID`, `bindLabel` = `Name`. Form control `drpCategory` holds `CategoryID`.
- Currency list from `getCurrencyList()` (remove the hard-coded `currencyOptions`).
- Manager / members: string IDs. `Array.from(new Set([...]))` still works.
- Edit:
  - Keep `RowVersion` from `getProjectByID` in a field and send it on PUT.
  - 409 `CONCURRENCY` ⇒ toast "Someone else changed this project — reloaded" and call `loadFormData(ID)`.
- 409 `PROJECT_CODE_EXISTS` ⇒ set an error on the `txtCode` control (`{ exists: true }`) and open `moreOptions` (Code lives there), not just a toast.
- 409 `PROJECT_LIMIT_REACHED` ⇒ toast the server message + link text "See Plan & License" (`/settings/billing`) if `can('Billing','View')`.
- 400 field `Errors` ⇒ map `Name→txtName`, `Code→txtCode`, `EndDate→txtEndDate`, `ManagerUserID→drpManagerID`, `Budget→txtBudget`.
- If API Q3 = editable Spent: add `txtSpent` (min 0) next to Budget in "more options" (edit only).
- On success: navigate to `/projects/{ID}` (unchanged).

### 4.3 `project-details` (shell)
- Hide **Edit** and the **Archive project** menu when `!project.CanEdit`. Hide **Restore** when `!can('Projects','Edit')`.
- Archive / restore: add error handling and loader `finalize`.
- Not found (P3 404 ⇒ `undefined`) keeps the existing "Back to Projects" block.
- `ProjectContextService.reload()`: add an error callback. On 401 do nothing (the interceptor handles it). On other errors push `null` and show a toast.

### 4.4 `project-overview`
- Budget % / days left unchanged (server values).
- Activity:
  - If A1 exists: `getActivity()` ⇒ `activities`.
  - Else keep `buildActivity()` but drop the invented "created the project" line. Use `CreatedOn` only if the API returns `CreatedBy` name (it does: `ManagerName` is **not** the creator).
- Tasks done / total shows `0 / 0` until the Tasks spec. Show "No tasks yet" instead of a 0 % bar when `TotalTasks === 0`.

### 4.5 `project-members`
- `drpUserID` holds a string.
- `availableUsers`: same filter with string compare.
- Roles from `getRoleList()` (lookup).
- `removeMember(this.context.projectID, m.ID)`.
- Keep the client "manager cannot be removed" check (UX); the server also returns 400.
- Add / edit 409 `MEMBER_EXISTS` ⇒ the existing "already a member" toast. 409 `PROJECT_ARCHIVED` ⇒ toast + `context.reload()`.
- Show a small "Suspended" badge when `m.UserStatus !== 'Active'`. This is the one template line added.
- Hide **Add member**, **Edit** and **Remove** when `!project.CanEdit`. The template already hides some of them when archived.

### 4.6 `project-milestones`
- `drpOwner` holds `OwnerUserID` (options = members, `bindValue` = `UserID`, `bindLabel` = `Name`). `onEdit` patches `m.OwnerUserID`.
- `onSave`: send `OwnerUserID` and `RowVersion` (edit). Completed ⇒ Progress 100 (keep).
- `onMarkComplete` ⇒ `completeMilestone(projectID, m.ID)`.
- `onDelete` ⇒ `deleteMilestone(projectID, m.ID)`.
- `OutsideProjectDates === true` in the save response or list ⇒ show the warning text "Outside project dates" under the date (only if API Q9 = warn).
- Hide **Add / Edit / Mark complete / Delete** when `!project.CanEdit`.

### 4.7 `project-settings`
- `onSave` makes **one** call `saveProjectSettings({ General: { Name, Status, Priority, ManagerUserID, RowVersion }, Preferences: {...} })` instead of `projectAddEdit` followed by `saveProjectSettings`. This removes the partial-save risk.
- 409 `CONCURRENCY` ⇒ toast + `context.reload()`.
- Form disabled when `IsArchived || !project.CanEdit` (Q6: if the API uses `Manage` for settings, use `can('Projects','Manage')`).
- Danger zone:
  - **Archive** is shown when `CanEdit`.
  - **Delete permanently** is shown only when `project.CanDelete`. If API Q7 = archived-only, enable it only when `IsArchived` and show the hint "Archive the project first".
- Delete success ⇒ `/projects`; error ⇒ toast.

### 4.8 `project-routing.module.ts`
- `create` ⇒ `canActivate: [moduleGuard('Projects', 'Create')]`.
- `edit/:id` ⇒ `canActivate: [moduleGuard('Projects', 'Edit')]`.
- The parent `/projects` View guard in `app-routing.module.ts` stays as it is (shared file, not touched).

## 5. Acceptance criteria
1. Search the folder for `Aarav|PRJ-1001|seed\(|delay\(this.latency` ⇒ 0 matches in `services/Project/` and `project/`.
2. Fresh DB:
   - The list shows the empty state with summary 0 / 0 / 0 / 0.
   - Create project ⇒ it appears in the list and survives a browser refresh.
3. Create with an existing code ⇒ error under the Code field. Create past `MaxProjects` ⇒ license message.
4. Edit project in two tabs, save both ⇒ the second gets the "someone else changed" toast and the form reloads.
5. Members: add, edit, remove works. Removing the manager ⇒ blocked. A suspended user shows the badge.
6. Milestones: add with owner, mark complete (progress 100), delete. All survive refresh.
7. Settings: a single save writes both general and preferences. An archived project's form is disabled.
8. Viewer role (Projects.View only):
   - No Create / Edit / Archive / Delete / Add buttons.
   - `/projects/create` and `/projects/edit/1` redirect to `/accessdenied?reason=role`.
9. Expired license: same as 8, with `reason=license`.
10. API down (status 0) on any page ⇒ offline toast, loader hidden, no console errors.
11. Home, Reports and Global Search still render (with real projects) without runtime errors (see §7).
12. `ng build` 0 errors; `npm test -- --watch=false` green.

## 6. Known gaps / decisions
- Tasks, Agile and mock-directory still use fake project IDs 1–7 and fake numeric users. The task board can show project names that don't exist in the DB until the Tasks spec (API Q11).
- `Health` / `Progress` formula is decided server-side (API Q1). The web only displays it.
- Activity feed depends on API Q10.
- No unsaved-changes guard on create / settings (same as Organization; follow-up).
- Big lists for Home, Reports and Search: P1 clamps `Length` to 100 (API Q13). Until a slim endpoint exists, those consumers see at most 100 projects.

## 7. Other consumers of `ProjectService` (must still compile and run)

| File | Today | Change needed |
|---|---|---|
| `services/Home/home.service.ts:59-84` | `getPaginatedProjectList(0,1000,…)`; "my projects" = `ManagerID === CURRENT_USER_ID (1)` | `CURRENT_USER_ID` is a fake number, so it never matches a Guid and "my projects" would be empty. **Proposal:** use the real `localStorage userId` (`AuthService`) for the project part only. `home.service.ts` is not a shared file, but `mock-directory.ts` is, so it is not touched. **Owner OK needed (Q-W1).** |
| `services/Reports/reports.service.ts:97-177, 441` | project list + milestones; `MemberIDs.includes(u.ID)` with mock `USERS` (numbers) | Type change: compare `String(u.ID)`; the result is empty member stats until Team goes live. Accept for v1 (Q-W2). |
| `workspace/global-search/global-search.component.ts:71-72` | active + archived lists, `Length 1000` | Works; capped at 100 (§6). |
| `Interface/workspace.ts:191` `IsRealProject` | archived project rows | No change. |

## 8. Tests (Karma / Jasmine)
`MODULE-CONVENTIONS.md`: PM modules ship **without** `.spec.ts`, so no component specs in `src/app/project/`.

Proposed exception (Q-W3): add `services/Project/project.service.spec.ts`, because the service is now live and holds the URL/param mapping. Use `HttpTestingController` like `subscription.service.spec.ts`, about 8 tests:
1. P1 params (empty ones omitted)
2. P3 404 ⇒ `undefined`
3. P4 vs P5 by `AddEdit`
4. lookups requested once (shareReplay)
5. lookup error resets the cache
6. M4 URL includes ProjectID
7. MS4 URL
8. S2 single body shape

## 9. Open questions (web)
| # | Question | Proposal |
|---|---|---|
| Q-W1 | Home "my projects": switch to the real logged-in user ID now? | Yes, project part only |
| Q-W2 | Reports member stats empty until Team is live — OK? | Yes |
| Q-W3 | Add `project.service.spec.ts` despite the PM no-spec convention? | Yes, service only |
| Q-W4 | Search debounce 300 ms OK (today every keystroke filters instantly)? | Yes |
| Q-W5 | Go-live order if the API ships in parts | 1) P1–P9 + list / create / details · 2) M1–M4 · 3) MS1–MS5 · 4) S1–S2 + A1 |
