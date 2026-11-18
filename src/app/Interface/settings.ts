/** Interfaces for the Administration & Security (settings) module. */

// GET api/Organization (also inside OrgSaveResponse). Logo bytes come from api/Organization/logo.
export interface OrgSettings {
  Name: string;
  HasLogo: boolean;
  LogoUpdatedAt: string | null;   // ISO date-time, changes on every logo upload (cache-buster)
  Website: string | null;
  Industry: string | null;
  Size: string | null;
  AddressLine: string | null;
  City: string | null;
  State: string | null;
  CountryID: number | null;
  CountryName: string;
  PostalCode: string | null;
  Timezone: string;
  DateFormat: string;
  Currency: string;
  WeekStart: string;
  FiscalYearStart: string;
  DefaultVisibility: string;
  TaskIdStyle: string;
  WorkingDays: string[];          // Mon→Sun order
  WorkStart: string;              // "HH:mm"
  WorkEnd: string;                // "HH:mm"
  PrimaryColor: string;           // "#RRGGBB"
  Version: string;                // opaque; send back unchanged on PUT
  UpdatedAt: string;
  UpdatedByName: string | null;
  CanEdit: boolean;               // caller is an organization admin
}

// PUT api/Organization body. CountryID must be a number (a string fails model binding -> ProblemDetails 400).
export type UpdateOrgRequest = Omit<OrgSettings, 'HasLogo' | 'LogoUpdatedAt' | 'CountryName' | 'UpdatedAt' | 'UpdatedByName' | 'CanEdit'>;

// PUT api/Organization response — 200, and the body of 400 (Errors) / 404 / 409 (Organization = current values).
export interface OrgSaveResponse {
  Success: boolean;
  Message: string;
  Organization: OrgSettings | null;
  Errors: Record<string, string[]> | null;   // keys = request field names (Name, Website, WorkingDays ...)
}

// POST / DELETE api/Organization/logo
export interface OrgLogoSaveResponse {
  Success: boolean;
  Message: string;
  HasLogo: boolean;
  LogoUpdatedAt: string | null;
}

export type SettingsUserStatus = 'Active' | 'Invited' | 'Suspended';

// GET api/Users (API spec 003-settings-users §4.1). ID is a Guid string.
export interface SettingsUser {
  ID: string;
  Name: string;
  Email: string;
  Designation: string | null;     // server stores empty as null
  RoleID: number;
  TeamID: number | null;
  DepartmentID: number | null;
  Location: string | null;
  Status: SettingsUserStatus;
  LastActive: string | null;      // ISO date-time (UTC)
  TwoFactor: boolean;
  JoinedOn: string;               // yyyy-MM-dd
  RowVersion: string;             // opaque; send back unchanged on PUT api/Users/{id}
}

// PUT api/Users/{id} — full replace of the editable set (§4.2). Email / Status / ID are not accepted.
export interface UpdateUserRequest {
  Name: string;
  Designation: string | null;
  RoleID: number;
  TeamID: number | null;
  DepartmentID: number | null;
  Location: string | null;
  TwoFactor: boolean;             // server only allows true -> false
  RowVersion: string;
}

// Single-user status change, routed by SettingsService.updateUser to suspend / reactivate.
export interface UserStatusPatch {
  Status: Exclude<SettingsUserStatus, 'Invited'>;
}

// Bulk patch, routed by SettingsService.updateUsers to bulk/role, bulk/suspend or bulk/reactivate.
export type BulkUserPatch = { RoleID: number } | UserStatusPatch;

// Body of every single-user action (200) and of its 400 / 403 / 404 / 409 errors (§4.4).
export interface UserActionResponse {
  Success: boolean;
  Message: string;
  Errors: Record<string, string[]> | null;   // keys = request field names (Name, RoleID ...)
  Code?: string;                             // spec 005 §7.3: 'SEAT_LIMIT' on 409 (omitted when null)
}

// POST api/Users/bulk/* (§4.4). No-ops are skipped, not failed.
export interface BulkUserResponse {
  Success: boolean;
  Message: string;
  Updated: number;
  Skipped: { ID: string; Reason: string }[] | null;
  Code?: string;                             // spec 005 §7.3: 'SEAT_LIMIT' (omitted when null)
}

// GET api/Roles/lookup — slim role list for this page (no permissions).
export interface RoleLookup {
  ID: number;
  Name: string;
  Description: string;
  IsSystem: boolean;
  Color: string;
  UserCount: number;
}

// GET api/Teams, GET api/Departments
export interface SettingsLookupItem {
  ID: number;
  Name: string;
}

// GET api/Subscription/seats — SeatsUsed counts Active + Invited users.
export interface SeatInfo {
  Seats: number;
  SeatsUsed: number;
}

export type PermAction = 'View' | 'Create' | 'Edit' | 'Delete' | 'Manage';
export type PermissionSet = Record<string, Record<PermAction, boolean>>;

export interface Role {
  ID: number;
  Name: string;
  Description: string;
  IsSystem: boolean;
  Color: string;
  Permissions: PermissionSet;
  UserCount: number;
  RowVersion?: string;   // base64 from GET api/Roles; send unchanged on PUT (stale -> 409). Optional for mock seed / create literals.
  CanEdit?: boolean;     // computed by the API for the caller (may the matrix be changed); missing on older APIs
}

/** Built-in role IDs that never change (spec 003 §3 seed). The names come from the API. */
export const SUPER_ADMIN_ROLE_ID = 1;
/** Built-in roles the Super Admin may edit (Admin, Project Manager, Member, Viewer). */
export const EDITABLE_SYSTEM_ROLE_IDS: readonly number[] = [2, 3, 4, 5];

// POST / PUT / DELETE api/Roles (R2-R4) — also the 400 / 403 / 404 / 409 error body. ID only on success.
export interface RoleActionResponse {
  Success: boolean;
  Message: string;
  ID: number | null;
  Errors: Record<string, string[]> | null;
}

export type TwoFactorMode = 'Off' | 'Admins' | 'Everyone';

export interface AccessPolicy {
  PwdMinLength: number;
  PwdUpper: boolean;
  PwdNumber: boolean;
  PwdSymbol: boolean;
  PwdExpiryDays: number;          // 0 = never
  PwdReuseHistory: number;
  IdleTimeoutMin: number;
  MaxSessionHours: number;
  ConcurrentSessions: number;
  TwoFactor: TwoFactorMode;
  SsoEnabled: boolean;
  SsoProtocol: 'SAML' | 'OIDC';
  SsoEntityId: string;
  SsoUrl: string;
  SsoCertificate: string;
  IpAllowlistEnabled: boolean;
  IpAllowlist: string[];
  RestrictSignupDomains: boolean;
  AllowedDomains: string[];
  AuditRetentionDays: number;
}

export type AuditActionType = 'Create' | 'Update' | 'Delete' | 'Login' | 'Security' | 'Export';

export interface AuditLog {
  ID: number;
  Timestamp: string;              // ISO date-time
  ActorID: number;
  ActorName: string;
  Action: string;
  ActionType: AuditActionType;
  EntityType: string;
  EntityName: string;
  IP: string;
  UserAgent: string;
  Result: 'Success' | 'Failed';
  Before: Record<string, unknown> | null;
  After: Record<string, unknown> | null;
}

export interface AuditFilter {
  From?: string;
  To?: string;
  ActorID?: number | null;
  ActionType?: string;
  Result?: string;
  Search?: string;
}

export interface IntegrationField {
  Key: string;
  Label: string;
  Type: 'text' | 'select' | 'toggle';
  Options?: string[];
  Placeholder?: string;
}

export interface Integration {
  Key: string;
  Name: string;
  Description: string;
  Category: string;
  Color: string;
  Badge: string;                  // short letters shown in the logo tile
  Connected: boolean;
  ConnectedOn: string | null;
  ConnectedBy: string | null;
  Fields: IntegrationField[];
  Config: Record<string, string | boolean>;
}

export interface Webhook {
  ID: number;
  Url: string;
  Events: string[];
  Secret: string;
  Active: boolean;
  LastStatus: 'Success' | 'Failed' | 'Never';
  LastCode: number | null;
  LastDelivery: string | null;
  CreatedOn: string;
}

export interface ApiKey {
  ID: number;
  Name: string;
  Prefix: string;                 // e.g. pk_live_
  Last4: string;
  Scopes: string[];
  CreatedOn: string;
  CreatedBy: string;
  LastUsed: string | null;
  ExpiresOn: string | null;
}

export type NotifyChannel = 'InApp' | 'Email' | 'Slack' | 'Push';

export interface NotificationEvent {
  Key: string;
  Label: string;
  Group: string;
  Description: string;
  Channels: Record<NotifyChannel, boolean>;
}

export interface NotificationSettings {
  Events: NotificationEvent[];
  DigestFrequency: 'Off' | 'Daily' | 'Weekly';
  DigestTime: string;
  QuietEnabled: boolean;
  QuietFrom: string;
  QuietTo: string;
  QuietDays: string[];
}

export interface EmailSettings {
  FromName: string;
  FromEmail: string;
  ReplyTo: string;
  SmtpEnabled: boolean;
  SmtpHost: string;
  SmtpPort: number;
  SmtpUsername: string;
  SmtpPasswordSet: boolean;       // the password itself is never returned
  SmtpSecurity: 'None' | 'STARTTLS' | 'SSL/TLS';
}

export interface EmailTemplate {
  ID: number;
  Key: string;
  Name: string;
  Subject: string;
  Body: string;
  UpdatedOn: string;
}

export type PlanKey = 'Free' | 'Team' | 'Business' | 'Enterprise';

export interface Plan {
  Key: PlanKey;
  Name: string;
  MonthlyPrice: number;           // per seat / month, billed monthly
  YearlyPrice: number;            // per seat / month, billed yearly
  Description: string;
  Features: string[];
  StorageGB: number;
  AutomationRuns: number;
  ApiCalls: number;
  MaxSeats: number | null;
  Popular?: boolean;
}

export interface Subscription {
  PlanKey: PlanKey;
  Cycle: 'Monthly' | 'Yearly';
  Seats: number;
  RenewalDate: string;
  StorageUsedGB: number;
  AutomationUsed: number;
  ApiUsed: number;
  PaymentBrand: string;
  PaymentLast4: string;
  PaymentExpiry: string;
}

export interface BillingContact {
  CompanyName: string;
  ContactName: string;
  Email: string;
  Phone: string;
  Address: string;
  Country: string;
  TaxId: string;
}

export interface Invoice {
  ID: number;
  Number: string;
  Date: string;
  PeriodFrom: string;
  PeriodTo: string;
  PlanName: string;
  Seats: number;
  Amount: number;
  Tax: number;
  Status: 'Paid' | 'Due';
}
