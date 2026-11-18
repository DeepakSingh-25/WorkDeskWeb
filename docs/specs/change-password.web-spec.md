# Change Password — Web spec (Angular)

Status: **Draft / proposed** · Date: 2026-10-14 · Route: `/changepassword`
Companion API spec: [`../../../API/docs/specs/002-change-password.md`](../../../API/docs/specs/002-change-password.md)

---

## 1. Discovery — what exists today

### Files
| File | Role |
|---|---|
| `src/app/changepassword/changepassword.component.ts` (111 lines) | Reactive form, match validator, save |
| `src/app/changepassword/changepassword.component.html` | Template (Bootstrap, `@if`) |
| `src/app/changepassword/changepassword.component.css` | Empty |
| `src/app/changepassword/changepassword.component.spec.ts` | "should create" — **broken** (D12) |
| `src/app/services/Changepassword/changepassword.service.ts` | `changePassword()` → `POST ChangePassword/ChangePassword` |
| `src/app/services/Changepassword/changepassword.service.spec.ts` | "should be created" — **broken** (D12) |
| `src/app/Interface/changepassword.ts` | `Changepassword { OldPassword, NewPassword, ConfirmPassword }` |

Not related despite the name: `forgotpassword.component.ts:88 changePassword()` and
`forgotpassword.service.ts:25 ChangePassword()` are the old forgot-password flow.

### Wiring
- Declared in `AdminModule` (`admin/admin.module.ts:23`), route `changepassword` with
  `canActivate: [authGuard]` (`admin/admin-routing.module.ts:14`). Guard sends logged-out / expired
  users to `/login?returnUrl=…` and clears stale session (`guards/auth.guard.ts`).
- Entry points: header avatar dropdown "Change Password" (`header/header.component.html:113`,
  `header-responsive/header-responsive.component.html:87`).

### Current UI (matches the screenshot at `localhost:4200/changepassword`)
1. Title "Change Password".
2. Card (`coupans-body … w-50`) with **Old Password\***, **New Password\***, **Confirm Password\***
   (plain `type="password"`, no show/hide).
3. Footer: **Save** (`btn-primary`), **Reset** (`btn-success`), **Back** (`btn-danger` → `/dashboard`).
Client rules: all required; new password regex = 8+ chars, upper, lower, digit, special `@$!%*?&`
(same as API `AuthValidation.PasswordPattern`); confirm must match (`passwordMatchValidator`).

### API call
| When | Call | Status |
|---|---|---|
| Save | `POST ${baseUrl}ChangePassword/ChangePassword` `{ OldPassword, NewPassword, ConfirmPassword }` | **endpoint missing** |
Net effect today: Save always shows "Something went wrong. Please try again."

### Defects found
| # | Where | Problem |
|---|---|---|
| D1 | whole page | Endpoint doesn't exist (API spec §1). |
| D2 | `onSave` (`:75`, `:81`) | Success detected by `response.Status == 'R102'`, wrong password by `Status === 'Current Password Not Match'` — legacy contract from another product. This API returns `Success` / `Message`. |
| D3 | `onSave` success (`:77-78`) | `window.location.href = '/login'` without `AuthService.logout()` → old token + profile stay in `localStorage`; full page reload. |
| D4 | `onSave` error (`:93`) | 401 → `'/Login'` (capital L — only works via the `**` redirect), token not cleared, photo not cleared. |
| D5 | Validation | No "new ≠ current" check; no `maxlength` (API caps at 128). |
| D6 | Saving | No saving flag → double-click sends two requests; Save not disabled while in flight. |
| D7 | Service | Separate `ChangepasswordService` with untyped `Observable<any>`; all other auth calls live in `AuthService`. |
| D8 | Component | Unused injections: `HttpClient`, `ActivatedRoute`, `Router` (nav done via `window.location`). |
| D9 | Template | `autocomplete="off"` on password fields (should be `current-password` / `new-password` so password managers work); generic ids `exampleFormControlInput1..3`; no show/hide toggle (login and reset-password have one). |
| D10 | Template | `w-50` card → unusable on phones; Back styled destructive (`btn-danger`) with stray `data-bs-dismiss="offcanvas"`; Reset styled `btn-success`; unused `#overlay` div; Save is `type="submit"` with `(click)` instead of `(ngSubmit)`. |
| D11 | Messages | Success toast hard-coded; server message ignored; no field-level server error. "Old Password" wording vs API `CurrentPassword`. |
| D12 | Specs | Component spec puts a `standalone: false` component in `imports: []` → TestBed throws; service spec has no `provideHttpClient()` → `NullInjectorError`. Both fail today. |

## 2. Target behaviour

### Layout (same structure, responsive)
```
Change Password
┌──────────────────────────────────────────────┐
│ Current Password*        [••••••••    ][👁]   │
│ New Password*            [••••••••    ][👁]   │
│   8+ chars, upper, lower, number, @$!%*?&     │  ← helper text, always visible
│ Confirm New Password*    [••••••••    ][👁]   │
├──────────────────────────────────────────────┤
│ [Save]  [Reset]  [Cancel]                     │
└──────────────────────────────────────────────┘
```
- Card: `col-12 col-md-8 col-lg-6` instead of `w-50`.
- Per `SIMPLE-DESIGN-RULES.md`: one primary (Save); Reset → `btn-outline-secondary`; Back → **Cancel**
  `btn-light`. Drop `data-bs-dismiss`, `#overlay`.
- Show/hide eye button per field — copy the reset-password pattern
  (`reset-password.component.html:38`).

### Fields
| Control | Label | Input attrs | Client validation | API field |
|---|---|---|---|---|
| `txtCurrentPassword` | Current Password * | `type=password`, `autocomplete="current-password"`, `maxlength=128` | required | `CurrentPassword` |
| `txtNewPassword` | New Password * | `autocomplete="new-password"`, `maxlength=128` | required, pattern, **≠ current** | `NewPassword` |
| `txtConfirmPassword` | Confirm New Password * | `autocomplete="new-password"`, `maxlength=128` | required, = new | `ConfirmPassword` |

Messages (same text as API spec §4):
| Error | Message |
|---|---|
| current required | "Current password is required." |
| new required | "New password is required." |
| new pattern | "Password must be at least 8 characters and contain an uppercase letter, a lowercase letter, a number and a special character (@$!%*?&)." |
| new = current | "New password must be different from the current password." |
| confirm required | "Please confirm your new password." |
| mismatch | "Passwords do not match." |
| server (`Errors[field]`) | first message from the server |

Show errors when `touched || submitted`. Group validator returns errors on the **group**
(`{ passwordMismatch }`, `{ sameAsCurrent }`) instead of calling `setErrors` on children — the
current approach can wipe other control errors.

### States
| State | Behaviour |
|---|---|
| Invalid submit | `markAllAsTouched()`, no request. |
| Saving | `saving = true`; Save disabled + spinner; inputs disabled; second click ignored. `finalize()` resets it. |
| 200 `Success=true` | Toast `response.Message` → `ProfilePhotoService.clear()` + `AuthService.logout()` → `router.navigateByUrl('/login')`. No `window.location`. |
| 400 | Toast `Message`; map `Errors` onto controls (`setErrors({ server: msg })`, cleared on next `valueChanges`); focus the first invalid field. Wrong current password clears only `txtCurrentPassword`. |
| 401 | `ProfilePhotoService.clear()` + `logout()` → `/login?returnUrl=/changepassword`. |
| 404 | Toast "Your account was not found or is deactivated." then same as 401. |
| Other / network | Toast "Something went wrong. Please try again."; form kept. |
| Reset | Clear all three fields, `submitted = false`, clear server errors. |
| Cancel | `routerLink="/dashboard"`. |

Note: failures come back as **HTTP 400** (body `Success=false`), not 200 — a deliberate exception
to `AGENTS.md` §4.3, same as `reset-password` and `PUT Profile`. Read the body from
`error.error` in the `error` callback.

Login page after a successful change: optional info banner via `?changed=1` — **out of scope** (touches
login component); the toast is shown before navigating.

## 3. Code changes

### Interfaces — `src/app/Interface/auth.ts` (add; delete `Interface/changepassword.ts`)
```ts
export interface ChangePasswordRequest {
  CurrentPassword: string;
  NewPassword: string;
  ConfirmPassword: string;
}

export interface ChangePasswordResponse {
  Success: boolean;
  Message: string;
  Errors: Record<string, string[]> | null;
}
```

### `AuthService` — add one method; delete `services/Changepassword/` (service + spec)
```ts
// [Authorize] endpoint — token header per call (no interceptor in this repo)
changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse> {
  const headers = new HttpHeaders().set('Authorization', `Bearer ${this.getToken()}`);
  return this.http.post<ChangePasswordResponse>(`${this.baseUrl}change-password`, request, { headers });
}
```
→ `POST ${environment.baseUrl}Auth/change-password`.

### Component
- Inject only `FormBuilder`, `AuthService`, `ProfilePhotoService`, `NotificationsService`, `Router`.
- Rename controls (`txtOldPassword` → `txtCurrentPassword`), add `maxlength` + group validator.
- `onSave()` with `saving` flag + `finalize()`; branch on `Success` / HTTP status as in §2.
- Drop `LoaderService` (button spinner is enough) — or keep it, but not both.
- Keep NgModule / constructor DI / Eager CD (`AGENTS.md` §3). `takeUntilDestroyed` for the
  `valueChanges` subscriptions that clear server errors.
- Template: `(ngSubmit)="onSave()"` on the form, Save `type="submit"` without `(click)`; real ids
  (`currentPassword`, …) with matching `for`.

### Out of scope / needs approval (shared files — `AGENTS.md` §4.6)
- Header: "Change Password" link uses `icon-setting` icon (cosmetic).
- HTTP interceptor for auth header / 401.
- Login page "password changed, please sign in" banner.

## 4. Acceptance criteria
1. Logged out → `/changepassword` redirects to `/login?returnUrl=%2Fchangepassword`.
2. Empty Save → three required messages, no request.
3. New password `abc` → pattern message; same as current → "must be different"; mismatch → "do not match". No request.
4. Wrong current password → message under Current Password; still logged in; only that field cleared.
5. Valid change → success toast, lands on `/login`; `localStorage.token` gone (theme kept); old password no longer logs in, new one does.
6. Double-click Save → exactly one request.
7. Expired token at submit → `/login`, token cleared.
8. Browser password manager offers to save the new password.
9. Works at 375px width; light and dark theme.
10. `npm run build` passes; both specs green.

## 5. Tests (frontend-tester, existing Karma pattern)
- Fix spec setup: `declarations: [ChangepasswordComponent]`, `imports: [ReactiveFormsModule, …]`,
  `provideHttpClient()`, `provideHttpClientTesting()`, `provideRouter([])`.
- `AuthService.changePassword`: URL `Auth/change-password`, method POST, body, `Authorization` header.
- Component: invalid form → no call; mismatch / sameAsCurrent group errors; 200 → `logout()` +
  navigate `/login`; 400 maps `Errors.CurrentPassword`; 401 → `logout()`; `saving` blocks a second submit.

## 6. Delivery order
1. API: C1 (`POST api/Auth/change-password`) — API spec §5.
2. Web: interface + `AuthService.changePassword` + component/template; delete old service/interface.
3. Later (owner decision): server-side session revocation (API spec §6 v2).

## 7. Open questions
1. After success: force re-login (this spec) or stay logged in with a new token? (API spec §9.2)
2. Keep the **Reset** button? It adds little on a 3-field form — remove to simplify?
3. Label: "Current Password" (proposed) vs existing "Old Password"?
