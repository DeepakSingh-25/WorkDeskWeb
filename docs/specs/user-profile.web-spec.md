# User Profile — Web spec (Angular)

Status: **Draft / proposed** · Date: 2026-10-14 · Route: `/user-profile`
Companion API spec: [`../../../API/docs/specs/001-user-profile.md`](../../../API/docs/specs/001-user-profile.md)

---

## 1. Discovery — what exists today

### Files
| File | Role |
|---|---|
| `src/app/user-profile/user-profile.component.ts` (289 lines) | Page logic: reactive form, cascading dropdowns, save, photo |
| `src/app/user-profile/user-profile.component.html` | Template (Bootstrap + `ng-select`, `@if`/`@for`) |
| `src/app/user-profile/user-profile.component.css` | Photo avatar + dark-mode overrides |
| `src/app/user-profile/user-profile.component.spec.ts` | "should create" smoke test only |
| `src/app/services/User-Profile/user-profile.service.ts` | `getUserDeatils`, `UserDeatilsAdd`, `getGSTVerify` |
| `src/app/services/User-Profile/profile-photo.service.ts` | Photo in **localStorage**, shared with header |
| `src/app/services/DrpCommon/drpcommon.service.ts` | Country / State / City lookups (also used by signup) |
| `src/app/Interface/user-profile.ts` | `UserProfile`, `VerifyGSTNumber` |

### Wiring
- Declared in `AdminModule` (`admin/admin.module.ts:25`), route `user-profile` in
  `admin/admin-routing.module.ts:20`; `AdminModule` is lazy-loaded at `''`
  (`app-routing.module.ts:14`). **No guard** — reachable logged out (data calls then 401 → login).
- Entry points: header avatar dropdown "Profile" (`header/header.component.html:109`,
  `header-responsive/header-responsive.component.html:85`).
- Header avatar reads `ProfilePhotoService.photo$`; header name reads `localStorage.fullName` once in
  its constructor (`header/header.component.ts:24`).

### Current UI
1. Title "User Profile".
2. **Profile Photo** — 96px round avatar with edit badge, "Upload/Change Photo", "Remove". JPG/PNG/WEBP,
   ≤ 2 MB; centre-cropped to 256px JPEG and saved in `localStorage` key `profilePhoto:<email>`.
3. **Basic Details** — Company Name*, Contact Person*.
4. **Address** — Address* (textarea), Country*, State*, City* (`ng-select`), Pin Code*.
5. Footer — **Save** (primary), **Back** (→ `/dashboard`, styled `btn-danger`).
GST is hidden; saved `GstNo`/`IsGSTVerified` are round-tripped untouched.

### API calls made
| When | Call | Status |
|---|---|---|
| init | `GET DrpCommonApi/DrpCountryList` | **endpoint missing** |
| init | `GET Profile/GetDistributorDetails` | **endpoint missing** |
| cascade | `GET DrpCommonApi/DrpStateList?CountryID=` / `DrpCityList?StateID=` | **missing** |
| Save | `POST Profile/UpdateDistributorDetails` | **missing** |
(Details in the API spec §1.) Net effect today: page opens with error toasts and empty dropdowns;
Save cannot succeed. Only the photo works (browser-local).

### Defects found in the current code
| # | Where | Problem |
|---|---|---|
| D1 | whole page | Every data endpoint is missing on the API (see above). |
| D2 | `onSave` / `UserProfile` | `CountryID` and `StateID` are **never sent**; load expects them back. `City` is typed `string` but the form holds the city **ID** (`bindValue="ID"`). |
| D3 | `onSave` success branch | Success detected by exact string `response.Status == 'Distributor profile updated successfully'`; any other 200 is silently ignored (loader hidden, no toast). |
| D4 | `onSave` | `router.navigate(['/user-profile'])` to the same route is a no-op — form is not refreshed. |
| D5 | `GetDrpCountryList` / `GetDrpStateList` | Read `CountryID` / `StateID` from list items, but template binds `ID`. Also auto-loads states of the *first* country and cities of the *first* state — races with `loadFormData`, which loads lists for the saved country/state. Whichever response arrives last wins `stateData`/`cityData`. |
| D6 | `onCountrySelect` / `onStateSelect` | Clearing the select fires `(change)` with `undefined` → `find()` returns `undefined` → `selectedCountry.ID` throws `TypeError`. |
| D7 | Pin code | `onKeyPress` allows `.`; only `required` validator; paste bypasses key filter. `5600.8` is accepted. |
| D8 | `loadFormData` | Expects an **array** (`Data[0]`); field casing inconsistent (`GSTNo` vs `GstNo`, `IsGSTVerified` vs `isGSTverified`). |
| D9 | Loader | `LoaderService` is a boolean; 3–4 parallel calls each show/hide it → loader disappears when the *first* call finishes. |
| D10 | 401 handling | Navigates to `/login` without clearing the stale token (`AuthService.logout()` not called). |
| D11 | Identity | The user's own `FullName`, `Email`, `PhoneNumber` (the only profile data the backend has) are **not shown**. "Contact Person" duplicates the user's name. |
| D12 | Photo | Stored only in the browser → lost on another device; logout needs a backup/restore hack. |
| D13 | Template | Unused `#overlay` div; Back button styled as destructive (`btn-danger`); "Person Name is Required" label mismatch. |

## 2. Target behaviour

### Layout (keep current structure and CSS)
```
User Profile
┌──────────────────────────────────────────────────────────┐
│ (avatar)  Profile Photo                                   │
│           JPG, PNG or WEBP, up to 2 MB.                   │
│           [Change Photo] [Remove]                         │
├──────────────────────────────────────────────────────────┤
│ Basic Details                                             │
│ Full Name*            | Email (read-only)                 │
│ Mobile Number         | Company Name*                     │
│ Address                                                   │
│ Address*  (textarea)                                      │
│ Country*              | State*                            │
│ City*                 | Pin Code*                         │
├──────────────────────────────────────────────────────────┤
│ [Save]  [Cancel]                                          │
└──────────────────────────────────────────────────────────┘
```
Follows `SIMPLE-DESIGN-RULES.md`: one primary button (Save); Back → **Cancel** as `btn-light`.

### Fields
| Control | Label | Type | Validation (client) | API field |
|---|---|---|---|---|
| `txtFullName` | Full Name * | text, maxlength 100 | required, trimmed min 2 | `FullName` |
| `txtEmail` | Email | text, **disabled** | — | `Email` (display only) |
| `txtPhone` | Mobile Number | text, maxlength 10, `inputmode="numeric"` | optional, `^[6-9]\d{9}$` | `PhoneNumber` |
| `txtCompanyName` | Company Name * | text, maxlength 50 | required | `CompanyName` |
| `txtAddress` | Address * | textarea, maxlength 100 | required | `AddressLine` |
| `drpCountry` | Country * | ng-select | required | `CountryID` |
| `drpState` | State * | ng-select | required | `StateID` |
| `drpCity` | City * | ng-select | required | `CityID` |
| `txtPinCode` | Pin Code * | text, maxlength 6, `inputmode="numeric"` | required, `^\d{6}$` | `PinCode` |

`txtContactPerson` is **removed** (replaced by Full Name). GST fields/round-trip removed.
Error messages: use the same text as API spec §4 so client and server agree. Show errors on
`touched || submitted`.

### States
| State | Behaviour |
|---|---|
| Loading | Loader shown until profile **and** country list resolve (`forkJoin`), form disabled. |
| First visit (no saved address) | Identity fields prefilled; address empty; if exactly one country (India), preselect it and load its states. |
| Loaded | Form patched; states + cities for saved ids loaded **after** profile arrives (no first-item auto-load). |
| Saving | Save button disabled + spinner; double click ignored. |
| Saved | Toast `response.Message`; form re-patched from `response.Profile`; `markAsPristine()`; update `localStorage.fullName` so header shows the new name. |
| 400 | Toast `response.Message`; map `response.Errors` onto controls (`setErrors({ server: msg })`). |
| 401 | `AuthService.logout()` then navigate `/login`. |
| Other error | Toast "Something went wrong. Please try again."; form stays as is. |
| Cancel | Navigate back to `/dashboard` (no confirm in v1). |

### Cascading dropdowns
- Country change → clear State + City, load states for the new id. State change → clear City,
  load cities. Clear (×) → clear children only; **guard against `undefined`** (fixes D6).
- Item shape `{ ID, CountryName | StateName | CityName }`; use `[items]` + `bindValue="ID"` +
  `bindLabel` on all three selects for consistency.

### Photo
| Action | Behaviour |
|---|---|
| Load | `ProfilePhotoService.refresh()` → if profile `HasPhoto`, `GET Profile/photo` as blob → object URL → `photo$`. Else default image. |
| Pick file | Same checks (type, ≤ 2 MB), same 256px JPEG resize; then `POST Profile/photo` (multipart, field `File`). Toast on success; on error toast `Message`. Show local preview only after success. |
| Remove | `DELETE Profile/photo` → `photo$ = null`. |
| Logout | Revoke object URL; delete `backup()/restore()` localStorage hack and the `profilePhoto:*` keys. |
Header keeps using `photo$` — no header change needed.

## 3. Code changes

### Interfaces — `src/app/Interface/user-profile.ts` (replace)
```ts
export interface UserProfile {
  Id: string;
  FullName: string;
  Email: string;
  PhoneNumber: string | null;
  CompanyName: string | null;
  AddressLine: string | null;
  CountryID: number | null;
  StateID: number | null;
  CityID: number | null;
  PinCode: string | null;
  HasPhoto: boolean;
  UpdatedAt: string | null;
}

export interface UpdateProfileRequest {
  FullName: string;
  PhoneNumber: string | null;
  CompanyName: string;
  AddressLine: string;
  CountryID: number;
  StateID: number;
  CityID: number;
  PinCode: string;
}

export interface ProfileSaveResponse {
  Success: boolean;
  Message: string;
  Profile: UserProfile | null;
  Errors: Record<string, string[]> | null;
}

export interface PhotoSaveResponse { Success: boolean; Message: string; HasPhoto: boolean; }

export interface CountryItem { ID: number; CountryName: string; }
export interface StateItem   { ID: number; StateName: string; }
export interface CityItem    { ID: number; CityName: string; }
```
`VerifyGSTNumber` stays only if signup still needs it — move it to `Interface/signup.ts`.

### `UserProfileService` (rename methods; old names have typos)
| Method | HTTP |
|---|---|
| `getProfile(): Observable<UserProfile>` | `GET ${baseUrl}Profile` |
| `updateProfile(req): Observable<ProfileSaveResponse>` | `PUT ${baseUrl}Profile` |
| `getPhoto(): Observable<Blob \| null>` | `GET ${baseUrl}Profile/photo` (`responseType: 'blob'`, `observe: 'response'`, 204 → `null`) |
| `uploadPhoto(file: Blob): Observable<PhotoSaveResponse>` | `POST ${baseUrl}Profile/photo` (`FormData`, field `File`) |
| `deletePhoto(): Observable<PhotoSaveResponse>` | `DELETE ${baseUrl}Profile/photo` |
Keep the existing per-call `Authorization` header pattern (no interceptor exists — adding one is a
separate change). Remove `getGSTVerify` from this service (unused here; signup has its own copy).

### `DrpcommonService`
URLs unchanged. Type the three methods: `Observable<CountryItem[]>`, `StateItem[]`, `CityItem[]`.
No other change (shared with signup).

### Component
- Load with `forkJoin({ profile, countries })`, then load states/cities for saved ids.
- Remove first-item auto-selection logic (D5), the GST fields, `onKeyPress` (replace with
  `Validators.pattern` + `inputmode`), unused `selectedCountryID/StateID`, `clrState/clrCity` dead
  locals.
- Subscriptions via `takeUntilDestroyed` (pattern already used for `photo$`).
- Keep NgModule / constructor DI / Eager CD (repo rule — `AGENTS.md` §3).
- Use a counter or `finalize()` around the single combined request so the loader is correct (D9),
  without changing `LoaderService` (shared).

### Out of scope / needs approval (shared files — `AGENTS.md` §4.6)
- Route guard for `/user-profile` (touches `admin-routing.module.ts`).
- HTTP interceptor for auth header / 401.
- Header reading `fullName` reactively instead of once.

## 4. Acceptance criteria
1. Opening `/user-profile` while logged in shows no error toast; Email shows the login email and is
   not editable.
2. A first-time user sees name/email prefilled, address empty.
3. Saving valid data shows the API message; reload the page → same values incl. Country/State/City.
4. Header name updates after changing Full Name (without re-login).
5. Pin code `5600.8`, `12345`, or pasted letters → "Pin code must be 6 digits.", no request sent.
6. Clearing Country clears State and City with no console error.
7. Changing Country then State shows only that state's cities (no stale list from a slow request).
8. Server 400 with `Errors.StateID` shows the message under State.
9. Expired token → user lands on `/login` and `localStorage.token` is gone.
10. Photo uploaded on one browser appears on another after login; Remove resets to default avatar
    in the page and header.
11. Light and dark theme both render correctly; layout works at 375px width.
12. `npm run build` passes; `npx ngc -p tsconfig.app.json --noEmit` clean.

## 5. Tests (frontend-tester, existing Karma pattern)
- `UserProfileService`: correct URL/method/body for each call; 204 photo → `null`.
- Component: `forkJoin` patches form; pin-code pattern; country clear clears children; 400 maps
  errors to controls; 401 calls `logout()` and navigates.

## 6. Delivery order
1. API: lookups (L1–L3) + CORS origins → country list works on signup and profile.
2. API: P1/P2 → web: interfaces, service, form changes.
3. API: P3–P5 → web: `ProfilePhotoService` switched to API; remove localStorage photo keys.

## 7. Open questions
Same as API spec §9 — mainly: is **Company Name** per-user or organisation-level (Settings →
Organization already has it)? If org-level, drop it from this page.
