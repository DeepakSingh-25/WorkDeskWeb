# Spec — Settings › Organization (`/settings/organization`)

Status: **wired to the real API (2026-10-15)** — `SettingsService` org methods call `api/Organization` (+ `/logo`).
Sections 2–7 below were written for the **mock** version and are kept as the UX baseline; where they differ,
§8 and the API spec win. Key differences now live: Country from `DrpCountryList` (`CountryID`), logo Upload/Remove
save immediately (JPEG/PNG/WEBP, no GIF), `Version` sent on save (409 → reload), server field errors shown inline,
`CanEdit=false` → read-only page, inline errors for time zone / work start / work end. Not yet verified in a browser
against the live API (DB script not run yet).
Companion API spec: [`../../../API/docs/specs/003-organization-settings.md`](../../../API/docs/specs/003-organization-settings.md)

## 1. Purpose
Let an admin view and edit the company profile, regional/working-time defaults, project defaults and brand color of the workspace. One form, one Save, one Discard.

## 2. Where it lives

| Item | Path |
| --- | --- |
| Route | `settings` (lazy module) → child `organization`; `''` and `**` redirect here — `settings/settings-routing.module.ts` |
| Layout shell | `settings/settings-layout` (`<div class="dashboard-content p-3 p-sm-4 mt-60 pm-page" id="settings">` = the scroll container; left `app-settings-nav` + `<main class="settings-main">`) |
| Nav entry | `settings/settings-nav/settings-nav.component.ts:21` — "Organization", faBuilding |
| Component | `settings/settings-organization/settings-organization.component.{ts,html}` (`.css` is empty) |
| Styles | `assets/css/settings.css` (`#settings …`), plus shared `.sticky-actions` in `assets/css/project.css` |
| Service | `services/Settings/settings.service.ts` — `getOrganization()`, `saveOrganization()` (200 ms simulated latency) |
| Model | `Interface/settings.ts` → `OrgSettings` |
| View helpers | `settings/settings-ui.ts` (`SettingsUi.weekDays`, `initials`, `formatMinutes` inherited from `TaskUi`) |
| Other consumers of org data | none found (the page is the only reader/writer of `OrgSettings`) |

## 3. Data model — `OrgSettings` (PascalCase, API-ready)

`Name, LogoDataUrl (string|null), Website, Industry, Size, AddressLine, City, State, Country, PostalCode, Timezone, DateFormat, Currency, WeekStart, FiscalYearStart, DefaultVisibility, TaskIdStyle, WorkingDays (string[]), WorkStart ("HH:mm"), WorkEnd ("HH:mm"), PrimaryColor ("#RRGGBB")`

Seed (mock): Acme Technologies Pvt. Ltd., India, Asia/Kolkata, `dd MMM yyyy`, INR, Monday, fiscal April, visibility `Team`, task id `PROJECT-123`, Mon–Fri 09:30–18:30, `#0043E0`.

Form control ↔ field mapping (control names follow repo convention `txt*/drp*`):

| Control | Field | Validators |
| --- | --- | --- |
| `txtName` | Name | required, max 100 (trimmed on save) |
| `LogoDataUrl` | LogoDataUrl | — |
| `txtWebsite` | Website | pattern `^https?://[^\s]+\.[^\s]+$` |
| `drpIndustry` / `drpSize` | Industry / Size | — |
| `txtAddress` `txtCity` `txtState` | AddressLine / City / State | — (address `maxlength=200`) |
| `drpCountry` | Country | required |
| `txtPostalCode` | PostalCode | pattern `^[A-Za-z0-9 -]{3,10}$` |
| `drpTimezone` | Timezone | required |
| `drpDateFormat` `drpCurrency` `drpWeekStart` `drpFiscalStart` | DateFormat, Currency, WeekStart, FiscalYearStart | — |
| `drpVisibility` / `drpTaskIdStyle` | DefaultVisibility / TaskIdStyle | — |
| `WorkingDays` | WorkingDays | non-empty (checked manually, not a Validator) |
| `txtWorkStart` / `txtWorkEnd` | WorkStart / WorkEnd | required; end must be > start (`hoursInvalid`) |
| `PrimaryColor` | PrimaryColor | `setColor` only accepts `#rrggbb` |

Option lists (hard-coded in component): countries (8), timezones (10), date formats (4: `dd MMM yyyy`, `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd`), currencies (7), industries (9), sizes (6), months (12), task-id styles (4 with example), brand swatches (8). Week start: Monday/Sunday/Saturday. Visibility: `Private` / `Team` / `Organization`.

## 4. UI structure (top → bottom)

1. Breadcrumb `Settings / Organization`, H2 "Organization", subtitle, and an **"Unsaved changes"** badge while `orgForm.dirty`.
2. Nothing but the header renders until `loaded` is true (no skeleton; global loader shows).
3. **Card "Company"**
   - Logo box (image, or colored initials tile using `PrimaryColor`), **Upload** button (hidden file input), **Remove** (only when a logo exists), helper "Square image, up to 1 MB", inline `logoError`.
   - Company name*, Country*.
   - **More options ›** (collapsed by default): Website, Industry, Company size, Address, City, State, Postal code.
4. **Card "Time and working hours"**
   - Time zone* (`ng-select`, not clearable), Date format (+ "Today looks like: …" live preview).
   - Working days* — chips Mon…Sun (toggle; click or Enter).
   - Work starts at*, Work ends at* (`type=time`), computed "9 hr a day" (blank when invalid).
   - **More options ›** (collapsed): Currency, Week starts on, Financial year starts in.
5. **Card "Advanced"** (collapsed accordion): Who can see new projects, Task number style (+ example), Brand color (8 swatches + native color picker) and a live **brand preview** (bar with logo/initials + name, sample button + link).
6. **Sticky footer** (`.sticky-actions`): **Save Changes** (primary, submit) and **Discard** (danger). Both disabled while `orgForm.pristine`.

## 5. Behaviour

**Load** — `ngOnInit → load()`: show loader → `getOrganization()` → `orgForm.reset(values)` (form becomes pristine), clear `logoError`, `loaded = true`, hide loader.

**Edit** — normal controls dirty the form automatically; `toggleDay`, `setColor`, `removeLogo` and logo upload call `markAsDirty()` explicitly. `toggleDay` keeps the days in Mon→Sun order.

**Logo upload** — accepts `image/png|jpeg|webp|gif` only, ≤ 1 MB (1 048 576 bytes). Violations set `logoError` and do not change the form. The file input is cleared after every pick so the same file can be re-chosen. Stored as a data-URL string in `LogoDataUrl`.

**Save** (`onSave`)
1. Blocked if form invalid, `hoursInvalid`, or no working day → `markAllAsTouched()`, error toast "Please fix the highlighted fields". If Website or Postal code is invalid, "More options" in Company auto-expands so the error is visible.
2. Otherwise build `OrgSettings` (name trimmed) → loader → `saveOrganization()` → hide loader → success toast with `res.Status` ("Organization Settings Updated Successfully...") → `markAsPristine()`.
3. Mock side effects: replaces the in-memory org, and writes an audit entry `Updated workspace settings / Update / Organization` with before/after `{Name, Timezone, Currency, PrimaryColor}` (visible in the audit log as "changed the organization settings").

**Discard** — confirm dialog "Discard all unsaved changes?"; on yes → `load()` (re-fetch + reset); on no nothing happens.

**Validation messages** (shown only after `touched`, except working days which shows immediately): "Organization Name is Required", "Country is Required", "Enter a valid web address starting with http(s)://", "Invalid postal code", "Select at least one working day", "Work must end after it starts". Time zone, work start and work end are `required` but have **no inline message** (see gaps).

**Layout/CSS notes** — `#settings` (`.dashboard-content`) is the scroll container with 16/24 px padding; the sticky footer uses a negative `bottom` (-16px / -24px ≥576 px, in `settings.css`) so content does not show beneath it.

## 6. Acceptance criteria

1. Opening `/settings` or any unknown `/settings/xyz` lands on `/settings/organization`, nav item highlighted.
2. Page loads with seed values; Save and Discard are disabled; no "Unsaved changes" badge.
3. Changing any field enables both buttons and shows the badge; Save success or Discard-confirm hides both again.
4. Clearing Company name and saving shows the toast + inline error and does not call the service.
5. Entering `abc` as website then saving expands Company "More options" and shows the website error.
6. Unchecking all working days shows "Select at least one working day" and blocks save.
7. Work end ≤ work start shows the error, hides the "x hr a day" text, blocks save.
8. A 2 MB or non-image file shows a logo error and leaves the logo unchanged; a valid image replaces the initials tile and the brand preview logo.
9. Date format change updates the "Today looks like" preview immediately; task-id style change updates its example.
10. Picking a swatch / custom color updates initials tile, brand bar, sample button and link instantly.
11. Save then reload the route (in the same session) shows the saved values; a new audit entry exists.
12. Footer stays pinned at the bottom of the scroll area with no content visible below it, at ≥576 px and on mobile.

## 7. Known gaps / risks (not bugs fixed here)

- **No unsaved-changes protection**: navigating via the settings nav, sidebar or browser back silently drops edits (no `canDeactivate`, no `beforeunload`; repo has no route guards at all).
- Time zone / work start / work end have required validators but no visible message (for time inputs the user can clear and only get the generic toast).
- Time zone `ng-select` styling differs from native selects (different height/font in the UI).
- Save has no own in-progress state; it relies on the global loader to block repeat clicks (not verified).
- Option lists, time zones and countries are hard-coded; Industry/Size/Country have no empty placeholder, so a seed value not in the list shows blank.
- Working-hours text assumes same-day shifts (overnight shifts are rejected by design).
- Logo is stored as a base64 data URL inside the settings object — fine for the mock, needs a real upload endpoint (and server-side size/type checks) when wired.
- Persistence is in-memory: refreshing the browser resets to seed data.
- Page is not permission-gated — any signed-in user can open and "save" it (Roles › Settings permissions exist but are not consulted here).
- There is no `.spec.ts` for this component yet.

## 8. Going live (when the API exists)

Full contract: API spec 003 (link at top). Web-side changes it implies:

1. `OrgSettings`: `LogoDataUrl` → `HasLogo` + `LogoUpdatedAt`; `Country` → `CountryID` (+ read-only `CountryName`); add `Version`, `UpdatedAt`, `UpdatedByName`. Form control `drpCountry` holds the `CountryID`.
2. `getOrganization()` → `GET ${environment.baseUrl}Organization`; `saveOrganization()` → `PUT` with `Version`, mapped to the existing `{ Status: res.Message }` return.
3. Component gets an error path: hide loader; 400 → per-field `Errors`; 409 → message + reload; 403 → "Only admins can change these settings".
4. Country options from `DrpcommonService.getcountryList()` (bind `ID`), not the hard-coded list.
5. Logo Upload/Remove call `POST`/`DELETE api/Organization/logo` immediately (no longer part of Save/Discard); show it via `GET api/Organization/logo` as a blob object URL (like `profile-photo.service.ts`). Drop GIF.
6. Read-only mode for non-admins once the API exposes who can edit (API spec §9 Q2).

## 9. Suggested tests (Karma/Jasmine)

- Smoke: component creates.
- `load()` populates the form and leaves it pristine.
- `onSave()` blocks and toasts on: empty name, bad website, no working days, end ≤ start; calls `saveOrganization` with a trimmed name when valid and then marks pristine.
- `toggleDay` keeps Mon→Sun order and dirties the form.
- `onLogoSelected` rejects wrong type and > 1 MB, accepts a small PNG.
- `datePreview` for all four formats; `workingHours` for 09:30–18:30 → 9 hr.
- Discard: confirm-yes reloads, confirm-no leaves the form as is.
