// Plans & module entitlements (API spec 005-plans-entitlements §6). PascalCase = API JSON.

/** The 9 PermissionCatalog modules (7 plan-gated + Settings, Billing which are always on). */
export type AccessModule =
  'Projects' | 'Tasks' | 'Team' | 'Agile' | 'Workflows' | 'Reports' | 'Workspace' | 'Settings' | 'Billing';

export type AccessAction = 'View' | 'Create' | 'Edit' | 'Delete' | 'Manage';

/** Computed license state (§5.4). Never stored. */
export type LicenseState = 'Unlicensed' | 'Invalid' | 'NotYetValid' | 'Active' | 'Grace' | 'Expired';

/** Why the access-denied page was opened (moduleGuard query param `reason`). */
export type AccessDeniedReason = 'plan' | 'license' | 'role' | 'error';

/** 403 `Code` values (§7.3). */
export type AccessDeniedCode =
  'NO_PERMISSION' | 'MODULE_NOT_IN_PLAN' | 'LICENSE_READ_ONLY' | 'LICENSE_MISSING' | 'LICENSE_INVALID';

/** 403 codes that mean "the plan / license changed" — the web reloads A1 when it sees one (§8.2). */
export const LICENSE_DENIED_CODES: readonly string[] =
  ['MODULE_NOT_IN_PLAN', 'LICENSE_READ_ONLY', 'LICENSE_MISSING', 'LICENSE_INVALID'] satisfies AccessDeniedCode[];

/** S3 409 code: the new license removes modules / seats and needs `ConfirmDowngrade: true` (§5.5 L9). */
export const CONFIRM_DOWNGRADE_CODE = 'CONFIRM_DOWNGRADE';

/** One module in A1. Booleans are already combined (license × role). */
export interface ModuleAccess {
  InPlan: boolean;
  View: boolean;
  Create: boolean;
  Edit: boolean;
  Delete: boolean;
  Manage: boolean;
  AvailableIn: string[];          // plan names that include the module (empty when InPlan)
}

export interface LicenseSummary {
  State: LicenseState;
  PlanCode: string | null;
  PlanName: string | null;
  IsTrial: boolean;
  ExpiresAt: string | null;       // ISO UTC; null = perpetual
  GraceEndsAt: string | null;
  DaysLeft: number | null;
  ReadOnly: boolean;
  SeatsExceeded: boolean;
  Banner: string | null;
}

/** A1 `GET api/Access/me` — `MyAccessResponse` (§6.1). All 9 modules × 5 actions are always present. */
export interface MyAccess {
  UserID: string;
  RoleID: number | null;          // null = old user row without a role (everything false)
  License: LicenseSummary;
  Modules: Record<AccessModule, ModuleAccess>;
  Version: string;
}

/** 403 body for module / license denials (§7.3). */
export interface AccessDeniedBody {
  Success: false;
  Message: string;
  Errors: null;
  Code: AccessDeniedCode;
  Module: string | null;
  Action: string | null;
  UpgradeRequired: boolean;
  AvailableIn: string[] | null;
}

// ---------- Subscription (S2–S4) ----------

export interface SubscriptionModule {
  Module: AccessModule;
  InPlan: boolean;
  AvailableIn: string[];
}

export interface SubscriptionLimits {
  MaxProjects: number | null;     // null = unlimited
  StorageGB: number | null;
}

export interface SubscriptionLicense {
  LicenseID: string;
  KeyID: string;
  CustomerName: string;
  IssuedAt: string;
  UploadedAt: string;
  UploadedByName: string | null;  // null = imported from the bootstrap file
}

/** S2 `GET api/Subscription` (§6.2). */
export interface SubscriptionInfo {
  State: LicenseState;
  Problem: string | null;
  PlanCode: string | null;
  PlanName: string | null;
  IsTrial: boolean;
  StartsAt: string | null;
  ExpiresAt: string | null;
  GraceDays: number;
  GraceEndsAt: string | null;
  DaysLeft: number | null;
  Seats: number;
  SeatsUsed: number;
  Limits: SubscriptionLimits;
  Modules: SubscriptionModule[];
  License: SubscriptionLicense | null;
  InstallationID: string | null;  // null only when the license data could not be read
  ClockWarning: boolean;
}

/** S3 request body (§6.3). */
export interface UploadLicenseRequest {
  LicenseText: string;
  ConfirmDowngrade: boolean;
}

export interface LicenseImpacts {
  PlanFrom: string | null;
  PlanTo: string;
  ModulesRemoved: string[];
  SeatsFrom: number;
  SeatsTo: number;
  SeatsUsed: number;
}

/** S3 response (§6.4) — same Success/Message/Errors base as UserActionResponse. */
export interface LicenseActionResponse {
  Success: boolean;
  Message: string;
  Errors: Record<string, string[]> | null;
  Code: string | null;
  Impacts: LicenseImpacts | null;
}

/** S4 `GET api/Subscription/plans` item (§6.5). No prices. */
export interface PlanCatalogItem {
  Code: string;
  Name: string;
  Description: string;
  Modules: AccessModule[];
  DefaultSeats: number | null;
}
