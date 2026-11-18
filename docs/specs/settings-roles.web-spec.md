# Web spec — Settings › Roles & Permissions (`/settings/roles`): mock → real API

Status: **Proposed** · Date: 2026-10-15 · API contract: [`../../../API/docs/specs/004-settings-roles.md`](../../../API/docs/specs/004-settings-roles.md) (implemented; SQL `004-settings-roles.sql` must be run by the DB owner first)
Pattern to copy: the Users page go-live (`SettingsService` §Users, `settings-users.component.ts` §errors).

## 1. Goal / scope

Swap the three mock role calls for real `HttpClient` calls, keep the component's behaviour and look, and add the error handling the mock never needed. `AGENTS.md §4.1`: keep method names and returned shapes, so the component changes only where error handling and `RowVersion` require it.

In scope: `getRoles`, `saveRole`, `deleteRole`; `Role` interface (`RowVersion`); error handling in `SettingsRolesComponent`; smoke/service tests.
Out of scope: Compare (stays client-side), permission enforcement elsewhere in the app, nav/route hiding for non-admins (no guards in repo; `settings-nav` has no current-user role — see §6), the mock audit page, Billing/other mocks. **Do not edit** shared files listed in `AGENTS.md §4.6` (`mock-directory.ts`, `project-ui.ts`, `task-ui.ts`, `project.css`, `task.css`, `styles.css`, `app-routing.module.ts`, sidebar, header).

## 2. Service changes — `services/Settings/settings.service.ts`

Base: `private rolesUrl = \`${environment.baseUrl}Roles\``. All calls `{ headers: this.authHeaders() }`. JSON PascalCase.

| Method (signature unchanged) | HTTP | Request | Returns |
|---|---|---|---|
| `getRoles(): Observable<Role[]>` | `GET Roles` (R1) | — | `Role[]` as is (server already sends `Permissions`, `UserCount`, `RowVersion`, all 8×5 cells) |
| `saveRole(role: Role): Observable<{ Status: string; ID: number }>` | `role.ID > 0` → `PUT Roles/{id}` (R3); else `POST Roles` (R2) | `SaveRoleRequest` built from `role` (below) | `map(r => ({ Status: r?.Message ?? '', ID: r?.ID ?? role.ID }))` |
| `deleteRole(ID: number): Observable<{ Status: string }>` | `DELETE Roles/{id}` (R4) | — | `map(r => ({ Status: r?.Message ?? '' }))` (reuse `toStatus`) |

`SaveRoleRequest` mapping (never send `ID`, `IsSystem`, `UserCount`):
- **R3 (update):** `{ Name, Description, Color, Permissions, RowVersion }`.
- **R2 (create):** `{ Name, Description, Color, Permissions }` — the component already sends the copied or empty matrix, so `CopyFromRoleID` is not needed.
- `Name` is already trimmed by the component. Use `encodeURIComponent`-safe id in the URL (numeric).

Error bodies (400/403/404/409) are `RoleActionResponse` `{ Success:false, Message, ID, Errors }`; 403 from the policy has the same shape without `ID`. The service does **not** swallow errors — it lets `HttpErrorResponse` propagate (same as Users).

Cleanup in the same file (only what becomes unreferenced): the mock `roles` seed, `perms()`, `rolePerms`, `descr/colors` seed block and the mock `saveRole/deleteRole/getRoles` bodies go away **if nothing else uses them**. Check first: `this.roles` is also read by a mock audit helper (`~line 443`, role name lookup) and the mock `users` array feeds other mock screens — keep whatever is still referenced; do not break the Audit page. `PERM_MODULES` / `PERM_ACTIONS` stay exported (component uses them). Update the class doc-comment that says "Roles endpoints abhi API me nahi hain".

## 3. Interface changes — `Interface/settings.ts`

- `Role`: add `RowVersion?: string;` (optional so mock/seed code and `openCreate` literals keep compiling; always present on API data).
- Add `RoleActionResponse { Success: boolean; Message: string; ID: number | null; Errors: Record<string, string[]> | null }`.
- `UserActionResponse` already exists — reuse its shape for the 403 policy body when reading errors.

## 4. Component changes — `settings-roles.component.ts` (template unchanged except where noted)

Inject `Router`, `AuthService`, `PhotoService` **only if** needed to copy `endSession()` exactly as in `SettingsUsersComponent`/`SettingsOrganizationComponent` (check what they inject; reuse the same helper logic — 401 → logout → `/login` with `returnUrl`, skipping a second navigation when the `AuthInterceptor` already navigated).

| Place | Change |
|---|---|
| `loadRoles` | add `error` handler + `finalize(() => hideLoader())`; on 401 `endSession()`, else toast message; leave `roles` as is |
| `select()` / `original` | keep `RowVersion` inside `working` (it is part of the cloned `Role`); `dirty` must **not** include it |
| `onSave` | keep client checks (name required, duplicate) as fast feedback; `subscribe({ next, error })`; `next`: toast `res.Status || 'Role updated'`, `loadRoles(res.ID)`; `error`: `handleError` — on **409** or **404** toast and `loadRoles(this.selectedId ?? undefined)` (discard stale edits, list is refreshed) |
| `onCreate` | same pattern; on 400 `Errors.Name` show the message (toast is enough); keep the drawer **open** on error, close it only on success |
| `onDelete` | same pattern; on 404 reload; `res.Status` toast already carries "N user(s) moved to Member." |
| Error text | `errorMessage(err, fallback)` copied from Users: trust the body only when `Success === false` (join `Message` + flattened `Errors`), `0` → offline text, `403` → "You don't have permission to manage roles.", else fallback |
| Loader | every subscribe path ends with `hideLoader()` (use `finalize`) — the mock never failed, the real call can |
| Removed hard-code | delete-confirm text still says "moved to Member" (matches server B9) — keep |

Behaviour that must not change: matrix toggling rules (View implied / clear row), lock banner for `IsSystem`, unsaved-changes confirm, Compare mode, drawer fields and validators, role colours.

Optional small nicety (allowed, not required): if the server returns `Errors.Permissions`/`Errors.Color`, they are shown through the same toast.

## 5. Acceptance criteria

1. With the API running and the SQL applied, `/settings/roles` lists the 5 system roles with their real counts and matrix; refresh keeps data (no longer resets).
2. Select **Owner**: all checkboxes disabled, lock banner shown; direct `PUT` to a system role (devtools) returns 400 and the UI never offers it.
3. Create "QA Reviewer" (empty): toast from server, appears selected, `UserCount` 0, persists after refresh.
4. Make a copy of Project Manager: new role has the same matrix; name clash with an existing role (any case) is rejected — by client first, and if bypassed, by a 400 toast with the drawer left open.
5. Edit a custom role: tick **Tasks › Delete** → View stays on; untick **View** → row clears; Save → toast, list reloads, role stays selected, unsaved bar disappears.
6. Two browser tabs edit the same role: second Save gets 409 → toast "…changed by someone else. Reload…", list reloads, no stale overwrite.
7. Delete a custom role with users: confirm text shows the count; after success the role is gone and those users show **Member** on `/settings/users`.
8. Non-admin (Member/Viewer) opening the page: R1 returns 403 → toast "You don't have permission to manage roles."; loader hides; page stays usable (empty list, no crash).
9. Expired token (401): session ends and user goes to `/login?returnUrl=/settings/roles` (no double navigation).
10. API down (status 0): offline toast, loader hidden.
11. Compare mode works on the loaded list; dark theme and narrow widths unchanged.
12. `npx ngc -p tsconfig.app.json --noEmit` and `npm run build` pass; no `console.log`; no new packages.

## 6. Known gaps / decisions

- **Nav/route hiding for non-admins** needs the current user's role in the web (not available in `settings-nav`, no route guards in the repo). Server is the gate (403 handled gracefully). Follow-up when a "current user + permissions" service exists.
- `Role.RowVersion` is optional in the type for mock compatibility; if the mock role seed is removed entirely, make it required in a later cleanup.
- Role colour cannot be changed after creation in the UI (API accepts `Color` on PUT; no control added — API open question 5).
- The matrix is stored but not enforced elsewhere yet (API spec §6.4): the page edits data only the Users/Roles admin policies read today.
- Audit page is still mock; it will not show real role changes until Audit goes live.
- Duplicate-name check stays client-side first (UX) but the server is authoritative.

## 7. Tests (Karma/Jasmine, existing smoke style)

- `settings.service.spec.ts` (extend if present, else add): with `HttpTestingController` — `getRoles` hits `GET …/Roles`; `saveRole` with `ID 0` → `POST …/Roles` body has **no** `ID/IsSystem/UserCount`; with `ID 6` → `PUT …/Roles/6` including `RowVersion`; response `Message`→`Status`, `ID` mapped; `deleteRole` → `DELETE …/Roles/6`; error bodies propagate as `HttpErrorResponse`.
- `settings-roles.component.spec.ts` (smoke + a few behaviours with a stub service): creates and loads roles; `toggle` View-implied rules; `dirty` ignores `RowVersion`; a 409 on save triggers a reload and a toast; a failing load hides the loader.
