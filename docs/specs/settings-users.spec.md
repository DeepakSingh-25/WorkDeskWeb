# Spec — Settings › Users (`/settings/users`)

Status: **mock-backed** (no Users endpoint in `../API/MyApp.Api/Controllers`: only Auth, DrpCommonApi, Employees, ExternalVendor, Profile exist; `EmployeesController` was not checked for overlap). Written from the code as of 2026-10-15.

## 1. Purpose
Let an admin see everyone in the workspace, how many paid seats are used, and manage each person: change role / team / profile fields, reset password, suspend / reactivate, remove — one at a time or in bulk. Adding people is **not** done here; "Invite user" links to `/team/invite`.

## 2. Where it lives

| Item | Path |
| --- | --- |
| Route | `settings` (lazy module) → child `users` — `settings/settings-routing.module.ts` |
| Layout shell | `settings/settings-layout` (scroll container `#settings`, left `app-settings-nav` + `<main>`) |
| Nav entry | `settings/settings-nav/settings-nav.component.ts:25` — "Users", faUsers |
| Component | `settings/settings-users/settings-users.component.{ts,html}` (`.css` is empty; `changeDetection: Eager`, `standalone: false`) |
| Styles | `assets/css/settings.css` (`#settings …`), dark overrides `assets/css/dark-auto.css` (`#settings .bulk-bar`, `tr.row-selected td`) |
| Service | `services/Settings/settings.service.ts` — `getUsers`, `updateUser`, `updateUsers`, `sendPasswordReset`, `removeUser`, `getRoles`, `getTeams`, `getDepartments`, `getSubscription` (200 ms simulated latency) |
| Models | `Interface/settings.ts` → `SettingsUser`, `SettingsUserStatus`, `Role`, `Subscription` |
| View helpers | `settings/settings-ui.ts` → `avatarClass`, `initials`, `ago` (inherited from `TaskUi`), `userStatusClass`, `meterClass` |
| Seed / identity | `services/Shared/mock-directory.ts` → `USERS`, `ROLES`, `TEAMS`, `DEPARTMENTS`, `CURRENT_USER_ID = 1` |
| Related screens | `/team/invite` (adds users), `/settings/roles` (role definitions, `UserCount`), `/settings/audit` (receives entries) |

## 3. Data model

`SettingsUser` (PascalCase, API-ready): `ID, Name, Email, Designation, RoleID, TeamID|null, DepartmentID|null, Location, Status ('Active'|'Invited'|'Suspended'), LastActive (ISO|null), TwoFactor, JoinedOn`.

Seed: 8 directory users (IDs 1–8, "Inactive" mapped to `Suspended`) + 3 extras — 101 Meera Nair (Invited), 102 Arjun Desai (Suspended), 103 Ishaan Kapoor (Invited). Roles: Owner, Admin, Project Manager, Member, Viewer (system) + custom "QA Reviewer" (ID 6). Current user = Aarav Sharma (ID 1, Owner).

Edit-form controls (repo convention `txt*/drp*/chk*`):

| Control | Field | Validators |
| --- | --- | --- |
| `txtName` | Name | required, max 80 (trimmed on save; note: only `required` is messaged) |
| `drpRoleID` | RoleID | required; **disabled** for the current user |
| `drpTeamID` | TeamID | — |
| `chkTwoFactor` | TwoFactor | — |
| `txtDesignation` | Designation | — (under "More options") |
| `drpDepartmentID` | DepartmentID | — (More options) |
| `txtLocation` | Location | — (More options) |

Email, Status, JoinedOn, LastActive are read-only in the drawer.

## 4. UI structure (top → bottom)

1. Breadcrumb `Settings / Users`, H2 "Users", subtitle, **Invite user** button (`routerLink /team/invite`).
2. **Seat card** — "`N` of `M` seats used · `K` free" (or "no seats left") and a thin meter coloured by `ui.meterClass(pct)` (≥75 % orange, ≥90 % red).
3. **Filter bar** — search box ("Search people"), Role `ng-select` ("All roles"), "More filters / Fewer filters" toggle, red **Clear** (only when a filter is active). Team `ng-select` sits in a second row, shown when "More filters" is open *or* a team is already selected.
4. **Status tabs** — All · Active · Invited · Suspended, each with a count.
5. **Bulk bar** (only when ≥1 row selected) — "`n` selected", "Change role to…" select + **Apply**, **Suspend**, **Reactivate**, **Clear**.
6. **Table** — columns: select-checkbox, Name (avatar + name + email, "(you)" tag), Role, Status pill, Last active, actions. Name / Role / Status / Last active are sortable (arrow icon). Row actions: **Edit** icon and a `⋯` dropdown (Send password reset · Suspend/Reactivate · Remove).
7. Empty state — "No Record Found" illustration row.
8. **Footer** — "Records Found : n", rows-per-page select (10 / 25 / 50), pagination (Prev, every page number, Next).
9. **Edit drawer** (right aside, modal) — header avatar + name + email, close button; fields Full Name*, Role*, Team, "2-step login is set up" switch; collapsible **More options** (Job title, Department, Location, read-only Status / Joined / Last active); sticky **Save** and **Cancel**.

## 5. Behaviour

**Load** — `ngOnInit`: fetch teams, departments, subscription (no loader), then `loadData()` → show loader → fetch roles and users → on users: replace list, drop selected IDs that no longer exist, clamp `currentPage`, hide loader.

**Seats** — `seatsUsed` = users whose status ≠ Suspended (so **Invited counts as a seat**); `seatsTotal` = `subscription.Seats` (0 until loaded); `seatPct` capped at 100; 0 when total is 0.

**Filtering** — `baseFiltered` = role filter AND team filter AND search (case-insensitive substring of `Name Email Designation`). Status tab is applied on top; **tab counts use `baseFiltered`** so they respect search/role/team but not the tab itself. Any filter/tab/page-size change resets to page 1. `hasFilters` ignores the status tab, so **Clear** does not reset the tab.

**Sorting** — click a header: same column toggles asc/desc, new column starts asc. Default Name asc. Keys: Name, Role (by role *name*), Status (string), LastActive (ISO string, null → `''`). Compare via `localeCompare`. Sort does not reset the page.

**Paging** — `cardsPerPage` (select yields a string, always wrapped in `Number()`), `totalPages = ceil(filtered / size)`; page buttons list **all** pages.

**Selection** — header checkbox toggles all *selectable rows of the current page*; the current user's row is not selectable. Selection is a `Set<ID>` that **survives filter, tab, sort and page changes** (so it can include rows no longer visible). `Clear` empties it and resets `bulkRoleID`.

**Bulk actions** (all confirm first via `showConfirm`, then loader → `updateUsers(ids, patch)` → success toast `res.Status` → clear selection → reload)
- *Apply role*: disabled until a role is picked; patch `{RoleID}`.
- *Suspend*: patch `{Status:'Suspended'}`; *Reactivate*: patch `{Status:'Active'}`.
- Mock logs one audit entry "Bulk updated users / Update / User / `n users`" (After = patch). Unlike single updates, **no per-user role/suspend audit entries**.

**Row actions**
- *Send password reset* — confirm "Send a password reset link to {email}?" → `sendPasswordReset` → toast "Password reset email sent to {email}"; audit "Sent password reset / Security". Disabled for `Invited`. Available for self.
- *Suspend / Reactivate* — hidden for self. Suspend confirm warns "They will be signed out and lose access immediately." Toast `"{Name} suspended|reactivated"`. Audit: "Suspended user" / "Reactivated user" (Security) with before/after status.
- *Remove* — hidden for self; `showdelete` confirm "Remove {Name} ({Email}) from the workspace? Their tasks stay but become unassigned." → `removeUser`, deselect, reload. Audit "Removed user / Delete" with before `{Email, Role}`.

**Edit drawer**
- Open (name link or Edit icon): collapse More options, reset form from the user; role control disabled for self (hint "You can't change your own role.").
- Save: invalid → `markAllAsTouched`, no call, inline "Full Name is Required". Valid → loader → `updateUser(ID, {Name (trimmed), Designation, RoleID, TeamID, DepartmentID, Location, TwoFactor})` (`getRawValue()` so the disabled self-role is still sent, unchanged) → success toast → close drawer → reload. Role change writes audit "Changed user role / Security" (`{Role}` before/after).
- Close: X, Cancel or backdrop click — **no dirty check**, edits are discarded silently.

**Display rules** — Last active: `Invited` → "Not joined yet"; no value → "Never"; else relative (`ui.ago`). Status pill class from `userStatusClass` (Active green, Invited amber, Suspended grey/red). Role name falls back to "—" if the ID is unknown.

**Mock side effects** — in-memory only (refresh resets). `getRoles()` recomputes `UserCount` from users, so role page counts follow changes here. Deleting a role (Roles page) moves its users to role 4 (Member).

## 6. Acceptance criteria

1. `/settings/users` loads with 11 rows (10 per page → 2 pages), nav item "Users" highlighted, tabs show All 11 and per-status counts.
2. Seat card shows used = users not Suspended; Suspending a user lowers "used" by one after reload.
3. Typing part of a name, email or job title narrows the list and resets to page 1; Clear restores it.
4. Role/Team filters combine with search (AND); tab counts change accordingly; selecting the "Suspended" tab shows only suspended users.
5. Clicking a column header sorts asc, again desc; arrow icon flips.
6. Own row (Aarav, "(you)"): checkbox disabled, no Suspend/Remove in menu, role locked in drawer.
7. Selecting rows shows the bulk bar with the right count; header checkbox selects only the current page's selectable rows.
8. Bulk role change: Apply disabled until a role is chosen; after confirm toast "`n` Users Updated Successfully...", selection cleared, roles updated in table.
9. Bulk Suspend/Reactivate and single Suspend/Reactivate ask for confirmation; Cancel changes nothing.
10. Send password reset is disabled for Invited users; for others it confirms then toasts the email.
11. Remove asks for delete confirmation, removes the row and decrements counts.
12. Edit drawer: clearing Full Name then Save shows the inline error and does not close; valid Save closes, toasts, and table reflects new name/role/team.
13. Invite user navigates to `/team/invite`.
14. Empty result (no match) shows the "No Record Found" row; Records Found shows 0 and no pagination numbers.
15. Works in dark theme (bulk bar and selected row have dark overrides) and on narrow widths (table scrolls horizontally).

## 7. Known gaps / risks (not fixed here)

- **Bulk Reactivate turns Invited users into Active** (`updateUsers {Status:'Active'}` has no status guard), and bulk/single Suspend of an Invited user is allowed; Reactivate of someone who never joined also sets Active.
- **No last-owner / privilege guards**: an Admin-level user can suspend, remove or demote another Owner, and the bulk role list and drawer role list include **Owner**, so anyone can promote to Owner. Server must enforce.
- **No seat enforcement**: reactivating when "no seats left" is allowed; seat card is informational only. Invited users consume seats (decide if intended).
- **Hidden selection**: selected IDs persist across filters/pages, so a bulk action can hit users the admin cannot currently see (count in the bar is the only hint).
- **No error handling**: no `error` callbacks on any subscribe — a failed call leaves the global loader on and gives no toast. `loadData()` fetches roles separately with no ordering guarantee vs users.
- Bulk actions create one aggregate audit row without who/what per user; single-user actions are logged individually.
- Drawer closes on backdrop click with no unsaved-change prompt; no Esc handler or focus trap verified (`role="dialog" aria-modal` only).
- 2-step switch can be turned **on** by an admin even though the label means "already set up" (should probably only allow turning off).
- Pagination renders every page number (no ellipsis) — will not scale; page size select uses `[value]` strings.
- Sorting by Last active compares ISO strings with `''` for null; Status sort is alphabetical, not by workflow order.
- No department filter, no export, no "resend / cancel invite" for Invited users on this page (invites live on `/team/invite`).
- Email is not editable and no duplicate-email handling exists on this page.
- Page is not permission-gated — Roles › "Team"/"Users" permissions are not consulted; there are no route guards in the repo.
- Search/filter state is not in the URL (lost on navigation/refresh).
- Template nit: a stray `</div>` placement on the seat line (cosmetic, `settings-users.component.html` seat card).
- There is no `.spec.ts` for this component.

## 8. Going live (when the API exists)

Add `UsersController` in `../API/MyApp.Api/Controllers/` (same conventions as `ProfileController`):

| Method | Route | Body / result |
| --- | --- | --- |
| GET | `Users` | `SettingsUser[]` (consider `page`, `size`, `search`, `roleId`, `teamId`, `status`, `sort` for server-side paging; client keeps current signatures if full list is returned) |
| PUT | `Users/{id}` | partial `SettingsUser` → `{ Status }` |
| PUT | `Users/Bulk` | `{ IDs, Patch }` → `{ Status }` |
| POST | `Users/{id}/PasswordReset` | → `{ Status }` |
| DELETE | `Users/{id}` | → `{ Status }` |

Server must: require admin permission, refuse self-suspend/remove/role-change, block removing/demoting the last Owner, validate bulk status transitions (Invited ↛ Active), check seat limits on reactivate, revoke sessions on suspend, reassign/unassign tasks on remove, and write per-user audit entries (actor, IP, before/after). Keep PascalCase fields and the `Observable<{ Status: string }>` shape so the component stays untouched; lookups (`getTeams`, `getDepartments`, `getRoles`, `getSubscription`) need their own endpoints.

## 9. Suggested tests (Karma/Jasmine)

- Smoke: component creates; `ngOnInit` populates users/roles/teams.
- `filtered`: search by name/email/designation, role + team + tab combined; `count()` ignores the active tab.
- `orderBy` toggles direction and switches column; `sortIcon` returns the right asset.
- Paging: `totalPages`, `pageRows`, `loadData` clamps `currentPage` after a removal.
- Seats: `seatsUsed` excludes Suspended; `seatPct` capped at 100 and 0 when total is 0.
- Selection: current user not selectable; `toggleAllPage` only touches selectable page rows; `clearSelection` resets `bulkRoleID`.
- Bulk role/status: confirm-yes calls `updateUsers` with the right patch and reloads; confirm-no does nothing.
- `onToggleSuspend` sends Suspended vs Active depending on status; `onRemove` deselects the user.
- Drawer: `openEdit` disables role for self; `onSaveEdit` blocks when name empty, trims name and sends `getRawValue` otherwise.
- Display: Last active text for Invited / null / date.
