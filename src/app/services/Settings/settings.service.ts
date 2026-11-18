import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, delay, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from '../../Interface/project';
import {
  AccessPolicy, ApiKey, AuditActionType, AuditFilter, AuditLog, BillingContact, BulkUserPatch, BulkUserResponse,
  EmailSettings, EmailTemplate, Integration, Invoice, NotificationSettings, OrgLogoSaveResponse, OrgSaveResponse,
  OrgSettings, PermAction, PermissionSet, Plan, PlanKey, Role, RoleActionResponse, RoleLookup, SeatInfo, SettingsLookupItem, SettingsUser,
  Subscription, SUPER_ADMIN_ROLE_ID, UpdateOrgRequest, UpdateUserRequest, UserActionResponse, UserStatusPatch, Webhook
} from '../../Interface/settings';
import { PROJECTS, ROLES, TEAMS, USERS, CURRENT_USER_ID, daysFromToday, userName } from '../Shared/mock-directory';

const LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Mock-only users (int IDs from mock-directory). Used only so the mock Roles screen can show
// UserCount and move users on role delete; the Users page reads real users from api/Users.
type MockSettingsUser = Omit<SettingsUser, 'ID' | 'RowVersion'> & { ID: number };

// R2 / R3 request body (API SaveRoleRequest). RowVersion only on update.
type SaveRoleBody = Pick<Role, 'Name' | 'Description' | 'Color' | 'Permissions'>;

// Same order as API PermissionCatalog.Modules (spec 005 adds Workspace as the 9th module; ships with the API release).
export const PERM_MODULES = ['Projects', 'Tasks', 'Team', 'Agile', 'Workflows', 'Reports', 'Workspace', 'Settings', 'Billing'];
export const PERM_ACTIONS: PermAction[] = ['View', 'Create', 'Edit', 'Delete', 'Manage'];
export const API_SCOPES = ['projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'users:read', 'reports:read', 'webhooks:manage'];
export const WEBHOOK_EVENTS = ['task.created', 'task.updated', 'task.deleted', 'project.created', 'project.updated',
  'comment.created', 'sprint.started', 'sprint.completed', 'user.invited', 'approval.requested'];

/**
 * Administration & Security settings service.
 *
 * Organization methods real API (api/Organization, spec 003) call karte hain.
 * Users page ke methods (getUsers, updateUser, updateUsers, sendPasswordReset, removeUser,
 * getRoleLookup, getTeams, getDepartments, getSeats) bhi real API (spec 003-settings-users) call karte hain.
 * Roles page ke methods (getRoles, saveRole, deleteRole) bhi real API (spec 004-settings-roles) call karte hain.
 * NOTE: baaki Settings / Billing / Audit endpoints abhi API me nahi hain, isliye wo
 * in-memory mock data use karte hain (page refresh par sab reset ho jata hai).
 * Method shapes TicketService / TaskService jaise hain (Result / FilterRecords / Status) —
 * API aane par sirf body ko http call se replace karna hai.
 * Secrets (SMTP password, API keys) yahan kabhi wapas return nahi hote.
 */
@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private latency = 200;
  private orgUrl = `${environment.baseUrl}Organization`;
  private usersUrl = `${environment.baseUrl}Users`;
  private rolesUrl = `${environment.baseUrl}Roles`;

  private users: MockSettingsUser[] = [];
  private roles: Role[] = [];
  private policy!: AccessPolicy;
  private audit: AuditLog[] = [];
  private integrations: Integration[] = [];
  private webhooks: Webhook[] = [];
  private apiKeys: ApiKey[] = [];
  private notify!: NotificationSettings;
  private email!: EmailSettings;
  private smtpPassword = '';              // kept only in memory, never returned
  private templates: EmailTemplate[] = [];
  private plans: Plan[] = [];
  private subscription!: Subscription;
  private contact!: BillingContact;
  private invoices: Invoice[] = [];

  constructor(private http: HttpClient) {
    this.seed();
  }

  // ---------------- Lookups (real API, [Authorize]) ----------------

  // L2 — active teams
  getTeams(): Observable<SettingsLookupItem[]> {
    return this.http.get<SettingsLookupItem[]>(`${environment.baseUrl}Teams`, { headers: this.authHeaders() });
  }

  // L3 — active departments
  getDepartments(): Observable<SettingsLookupItem[]> {
    return this.http.get<SettingsLookupItem[]>(`${environment.baseUrl}Departments`, { headers: this.authHeaders() });
  }

  // L1 — slim role list for the Users page. (The full list with matrix is getRoles() below.)
  getRoleLookup(): Observable<RoleLookup[]> {
    return this.http.get<RoleLookup[]>(`${environment.baseUrl}Roles/lookup`, { headers: this.authHeaders() });
  }

  // S1 — seat card. (getSubscription() below stays mock for Billing.)
  getSeats(): Observable<SeatInfo> {
    return this.http.get<SeatInfo>(`${environment.baseUrl}Subscription/seats`, { headers: this.authHeaders() });
  }

  // ---------------- Organization ----------------

  // 200 OrgSettings; 401; 404 when the org row is missing (setup script not run).
  getOrganization(): Observable<OrgSettings> {
    return this.http.get<OrgSettings>(this.orgUrl, { headers: this.authHeaders() });
  }

  // Admin only. 400 / 404 / 409 bodies are OrgSaveResponse too (read them from error.error); 403 has no body.
  saveOrganization(request: UpdateOrgRequest): Observable<OrgSaveResponse> {
    return this.http.put<OrgSaveResponse>(this.orgUrl, request, { headers: this.authHeaders() });
  }

  // 200 -> image blob, 204 (no logo) or a non-image body -> null
  getOrganizationLogo(): Observable<Blob | null> {
    return this.http.get(`${this.orgUrl}/logo`, {
      headers: this.authHeaders(),
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(res => {
        const body = res.body;
        if (res.status === 204 || !body || body.size === 0) return null;
        return LOGO_MIME_TYPES.includes(body.type) ? body : null;
      })
    );
  }

  // Admin only. Multipart field name must be exactly "File". Content-Type is set by the browser (boundary).
  uploadOrganizationLogo(file: File): Observable<OrgLogoSaveResponse> {
    const formData = new FormData();
    formData.append('File', file, file.name);
    return this.http.post<OrgLogoSaveResponse>(`${this.orgUrl}/logo`, formData, { headers: this.authHeaders() });
  }

  // Admin only. Idempotent.
  deleteOrganizationLogo(): Observable<OrgLogoSaveResponse> {
    return this.http.delete<OrgLogoSaveResponse>(`${this.orgUrl}/logo`, { headers: this.authHeaders() });
  }

  // ---------------- Users ----------------

  // Real API (API spec 003-settings-users §4), policy ManageUsers. The server writes the audit rows.
  // Error bodies (400 / 403 / 404 / 409) are UserActionResponse / BulkUserResponse — read error.error.

  // U1 — all non-deleted users, sorted by Name
  getUsers(): Observable<SettingsUser[]> {
    return this.http.get<SettingsUser[]>(this.usersUrl, { headers: this.authHeaders() });
  }

  // { Status } -> U3 suspend / U4 reactivate; a full UpdateUserRequest -> U2 (409 on stale RowVersion).
  updateUser(ID: string, patch: UpdateUserRequest | UserStatusPatch): Observable<{ Status: string }> {
    const url = this.userUrl(ID);
    const req$ = 'Status' in patch
      ? this.http.post<UserActionResponse | null>(`${url}/${patch.Status === 'Suspended' ? 'suspend' : 'reactivate'}`, {}, { headers: this.authHeaders() })
      : this.http.put<UserActionResponse | null>(url, patch, { headers: this.authHeaders() });
    return req$.pipe(map(r => this.toStatus(r)));
  }

  // { RoleID } -> U7, { Status: 'Suspended' } -> U8, { Status: 'Active' } -> U9. 1–100 IDs.
  // An empty 2xx body is treated as "all IDs updated, none skipped".
  updateUsers(IDs: string[], patch: BulkUserPatch): Observable<BulkUserResponse> {
    const req$ = 'RoleID' in patch
      ? this.http.post<BulkUserResponse | null>(`${this.usersUrl}/bulk/role`, { IDs, RoleID: patch.RoleID }, { headers: this.authHeaders() })
      : this.http.post<BulkUserResponse | null>(`${this.usersUrl}/bulk/${patch.Status === 'Suspended' ? 'suspend' : 'reactivate'}`, { IDs }, { headers: this.authHeaders() });
    return req$.pipe(map(r => ({
      Success: r?.Success ?? true,
      Message: r?.Message ?? '',
      Updated: r?.Updated ?? IDs.length,
      Skipped: r?.Skipped ?? []
    })));
  }

  // U5 — target must be Active
  sendPasswordReset(ID: string): Observable<{ Status: string }> {
    return this.http.post<UserActionResponse | null>(`${this.userUrl(ID)}/password-reset`, {}, { headers: this.authHeaders() })
      .pipe(map(r => this.toStatus(r)));
  }

  // U6 — soft delete on the server
  removeUser(ID: string): Observable<{ Status: string }> {
    return this.http.delete<UserActionResponse | null>(this.userUrl(ID), { headers: this.authHeaders() })
      .pipe(map(r => this.toStatus(r)));
  }

  // Hands the Super Admin role to another Active user; the caller becomes Admin. No body.
  transferSuperAdmin(ID: string): Observable<{ Status: string }> {
    return this.http.post<UserActionResponse | null>(`${this.userUrl(ID)}/transfer-super-admin`, null, { headers: this.authHeaders() })
      .pipe(map(r => this.toStatus(r)));
  }

  // Message -> Status; an empty 200 / 204 body gives '' (the component then shows its own text).
  private toStatus(r: UserActionResponse | null): { Status: string } {
    return { Status: r?.Message ?? '' };
  }

  private userUrl(ID: string): string {
    return `${this.usersUrl}/${encodeURIComponent(ID)}`;
  }

  // ---------------- Roles ----------------

  // Real API (API spec 004-settings-roles), policy ManageRoles. The server writes the audit rows.
  // Error bodies (400 / 403 / 404 / 409) are RoleActionResponse — read error.error. Errors propagate.

  // R1 — all roles with matrix, UserCount and RowVersion (built-in first)
  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.rolesUrl, { headers: this.authHeaders() });
  }

  // ID > 0 -> R3 PUT (409 on stale RowVersion); else R2 POST. ID / IsSystem / UserCount are never sent.
  saveRole(role: Role): Observable<{ Status: string; ID: number }> {
    const body: SaveRoleBody = {
      Name: role.Name, Description: role.Description, Color: role.Color, Permissions: role.Permissions
    };
    const req$ = role.ID > 0
      ? this.http.put<RoleActionResponse | null>(this.roleUrl(role.ID), { ...body, RowVersion: role.RowVersion }, { headers: this.authHeaders() })
      : this.http.post<RoleActionResponse | null>(this.rolesUrl, body, { headers: this.authHeaders() });
    return req$.pipe(map(r => ({ Status: r?.Message ?? '', ID: r?.ID ?? role.ID })));
  }

  /** R4 — deletes a custom role; the server moves its users to "Member" (Message carries the count). */
  deleteRole(ID: number): Observable<{ Status: string }> {
    return this.http.delete<RoleActionResponse | null>(this.roleUrl(ID), { headers: this.authHeaders() })
      .pipe(map(r => ({ Status: r?.Message ?? '' })));
  }

  private roleUrl(ID: number): string {
    return `${this.rolesUrl}/${encodeURIComponent(String(ID))}`;
  }

  // ---------------- Access policies ----------------

  getPolicy(): Observable<AccessPolicy> {
    return this.respond(this.policy);
  }

  savePolicy(p: AccessPolicy): Observable<{ Status: string }> {
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    (Object.keys(p) as (keyof AccessPolicy)[]).forEach(k => {
      if (JSON.stringify(p[k]) !== JSON.stringify(this.policy[k])) { before[k] = this.policy[k]; after[k] = p[k]; }
    });
    this.policy = this.clone(p);
    this.log('Updated access policies', 'Security', 'Policy', 'Access policies', before, after);
    return this.respond({ Status: 'Access Policies Updated Successfully...' });
  }

  testSsoConnection(p: AccessPolicy): Observable<{ Ok: boolean; Message: string }> {
    const ok = !!p.SsoEntityId && /^https:\/\//i.test(p.SsoUrl) && (p.SsoProtocol === 'OIDC' || p.SsoCertificate.includes('BEGIN CERTIFICATE'));
    return of({
      Ok: ok,
      Message: ok ? `${p.SsoProtocol} handshake succeeded — metadata and signature verified.`
        : 'Connection failed — check the entity / client ID, an https SSO URL and a valid certificate.'
    }).pipe(delay(900));
  }

  // ---------------- Audit logs ----------------

  getAuditActors(): Observable<{ ID: number; Name: string }[]> {
    return this.respond(USERS.map(u => ({ ID: u.ID, Name: u.Name })));
  }

  getAuditLogs(start: number, length: number, filter: AuditFilter): Observable<PagedResult<AuditLog>> {
    const rows = this.filterAudit(filter);
    return this.respond({ Result: rows.slice(start, start + length), FilterRecords: rows.length });
  }

  getAuditLogsForExport(filter: AuditFilter): Observable<AuditLog[]> {
    return this.respond(this.filterAudit(filter));
  }

  private filterAudit(f: AuditFilter): AuditLog[] {
    const q = (f.Search || '').trim().toLowerCase();
    return this.audit.filter(a =>
      (!f.From || a.Timestamp.slice(0, 10) >= f.From) &&
      (!f.To || a.Timestamp.slice(0, 10) <= f.To) &&
      (!f.ActorID || a.ActorID === f.ActorID) &&
      (!f.ActionType || a.ActionType === f.ActionType) &&
      (!f.Result || a.Result === f.Result) &&
      (!q || `${a.Action} ${a.EntityType} ${a.EntityName} ${a.ActorName} ${a.IP}`.toLowerCase().includes(q))
    );
  }

  // ---------------- Integrations / webhooks / API keys ----------------

  getIntegrations(): Observable<Integration[]> {
    return this.respond(this.integrations);
  }

  saveIntegration(key: string, config: Record<string, string | boolean>, connect: boolean): Observable<{ Status: string }> {
    const i = this.integrations.find(x => x.Key === key);
    if (i) {
      const wasConnected = i.Connected;
      i.Config = { ...config };
      if (connect && !i.Connected) {
        i.Connected = true;
        i.ConnectedOn = new Date().toISOString();
        i.ConnectedBy = userName(CURRENT_USER_ID);
      }
      if (!wasConnected && i.Connected) this.log('Connected integration', 'Create', 'Integration', i.Name, null, { Connected: true });
    }
    return this.respond({ Status: connect ? `${i?.Name} Connected Successfully...` : 'Integration Updated Successfully...' });
  }

  disconnectIntegration(key: string): Observable<{ Status: string }> {
    const i = this.integrations.find(x => x.Key === key);
    if (i) {
      i.Connected = false; i.ConnectedOn = null; i.ConnectedBy = null;
      this.log('Disconnected integration', 'Delete', 'Integration', i.Name, { Connected: true }, { Connected: false });
    }
    return this.respond({ Status: `${i?.Name} Disconnected Successfully...` });
  }

  getWebhooks(): Observable<Webhook[]> {
    return this.respond(this.webhooks);
  }

  saveWebhook(w: Webhook): Observable<{ Status: string }> {
    const existing = this.webhooks.find(x => x.ID === w.ID);
    if (existing) {
      Object.assign(existing, this.clone(w));
      return this.respond({ Status: 'Webhook Updated Successfully...' });
    }
    const ID = Math.max(0, ...this.webhooks.map(x => x.ID)) + 1;
    this.webhooks.push({ ...this.clone(w), ID, LastStatus: 'Never', LastCode: null, LastDelivery: null, CreatedOn: new Date().toISOString() });
    this.log('Created webhook', 'Create', 'Webhook', w.Url, null, { Url: w.Url, Events: w.Events });
    return this.respond({ Status: 'Webhook Added Successfully...' });
  }

  deleteWebhook(ID: number): Observable<{ Status: string }> {
    const w = this.webhooks.find(x => x.ID === ID);
    this.webhooks = this.webhooks.filter(x => x.ID !== ID);
    if (w) this.log('Deleted webhook', 'Delete', 'Webhook', w.Url, { Url: w.Url }, null);
    return this.respond({ Status: 'Webhook Deleted Successfully!' });
  }

  sendTestWebhook(ID: number): Observable<{ Ok: boolean; Code: number; Ms: number }> {
    const w = this.webhooks.find(x => x.ID === ID);
    const ok = !!w && !w.Url.includes('fail');
    const code = ok ? 200 : 502;
    if (w) { w.LastStatus = ok ? 'Success' : 'Failed'; w.LastCode = code; w.LastDelivery = new Date().toISOString(); }
    return of({ Ok: ok, Code: code, Ms: 120 + Math.round(Math.random() * 300) }).pipe(delay(700));
  }

  getApiKeys(): Observable<ApiKey[]> {
    return this.respond(this.apiKeys);
  }

  /**
   * Generates a new key with crypto.getRandomValues. The full secret is returned ONLY from
   * this call; the service keeps just the prefix + last 4 characters.
   */
  createApiKey(name: string, scopes: string[], expiresOn: string | null): Observable<{ Status: string; Key: ApiKey; Secret: string }> {
    const secret = 'pk_live_' + this.randomString(40);
    const key: ApiKey = {
      ID: Math.max(0, ...this.apiKeys.map(k => k.ID)) + 1,
      Name: name, Prefix: 'pk_live_', Last4: secret.slice(-4), Scopes: [...scopes],
      CreatedOn: new Date().toISOString(), CreatedBy: userName(CURRENT_USER_ID), LastUsed: null, ExpiresOn: expiresOn
    };
    this.apiKeys.unshift(key);
    this.log('Generated API key', 'Security', 'API Key', name, null, { Scopes: scopes, ExpiresOn: expiresOn });
    return of({ Status: 'API Key Generated Successfully...', Key: this.clone(key), Secret: secret }).pipe(delay(this.latency));
  }

  revokeApiKey(ID: number): Observable<{ Status: string }> {
    const k = this.apiKeys.find(x => x.ID === ID);
    this.apiKeys = this.apiKeys.filter(x => x.ID !== ID);
    if (k) this.log('Revoked API key', 'Security', 'API Key', k.Name, { Active: true }, { Active: false });
    return this.respond({ Status: 'API Key Revoked Successfully!' });
  }

  /** Random [A-Za-z0-9] string using the Web Crypto API. */
  randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  // ---------------- Notifications & email ----------------

  getNotificationSettings(): Observable<NotificationSettings> {
    return this.respond(this.notify);
  }

  saveNotificationSettings(n: NotificationSettings): Observable<{ Status: string }> {
    this.notify = this.clone(n);
    return this.respond({ Status: 'Notification Settings Updated Successfully...' });
  }

  getEmailSettings(): Observable<EmailSettings> {
    return this.respond(this.email);
  }

  /** `password` is only replaced when a new non-empty value is supplied. */
  saveEmailSettings(s: EmailSettings, password: string | null): Observable<{ Status: string }> {
    if (password) this.smtpPassword = password;
    this.email = { ...this.clone(s), SmtpPasswordSet: !!this.smtpPassword };
    this.log('Updated email settings', 'Security', 'Email', 'SMTP / sender', null, { Host: s.SmtpHost, Port: s.SmtpPort });
    return this.respond({ Status: 'Email Settings Updated Successfully...' });
  }

  sendTestEmail(to: string): Observable<{ Ok: boolean; Message: string }> {
    const ok = !this.email.SmtpEnabled || (!!this.email.SmtpHost && this.email.SmtpPasswordSet);
    return of({
      Ok: ok,
      Message: ok ? `Test email queued for ${to}` : 'SMTP is enabled but host or password is missing'
    }).pipe(delay(800));
  }

  getEmailTemplates(): Observable<EmailTemplate[]> {
    return this.respond(this.templates);
  }

  saveEmailTemplate(t: EmailTemplate): Observable<{ Status: string }> {
    const existing = this.templates.find(x => x.ID === t.ID);
    if (existing) Object.assign(existing, this.clone(t), { UpdatedOn: new Date().toISOString() });
    return this.respond({ Status: 'Email Template Updated Successfully...' });
  }

  // ---------------- Billing ----------------

  getPlans(): Observable<Plan[]> {
    return this.respond(this.plans);
  }

  getSubscription(): Observable<Subscription> {
    return this.respond(this.subscription);
  }

  changePlan(key: PlanKey, cycle: 'Monthly' | 'Yearly'): Observable<{ Status: string }> {
    const before = { Plan: this.subscription.PlanKey, Cycle: this.subscription.Cycle };
    this.subscription.PlanKey = key;
    this.subscription.Cycle = cycle;
    this.log('Changed subscription plan', 'Update', 'Subscription', key, before, { Plan: key, Cycle: cycle });
    return this.respond({ Status: `Plan changed to ${key} (${cycle})` });
  }

  addSeats(count: number): Observable<{ Status: string }> {
    const before = this.subscription.Seats;
    this.subscription.Seats += count;
    this.log('Added seats', 'Update', 'Subscription', `${count} seats`, { Seats: before }, { Seats: this.subscription.Seats });
    return this.respond({ Status: `${count} seat(s) added Successfully...` });
  }

  getBillingContact(): Observable<BillingContact> {
    return this.respond(this.contact);
  }

  saveBillingContact(c: BillingContact): Observable<{ Status: string }> {
    this.contact = this.clone(c);
    return this.respond({ Status: 'Billing Contact Updated Successfully...' });
  }

  getInvoices(): Observable<Invoice[]> {
    return this.respond(this.invoices);
  }

  // ---------------- helpers ----------------

  roleName(ID: number | null | undefined): string {
    return this.roles.find(r => r.ID === ID)?.Name || '';
  }

  // Same as UserProfileService: AuthInterceptor also adds the token but skips requests that already
  // carry Authorization. No token -> no header (never "Bearer null").
  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return token ? new HttpHeaders().set('Authorization', `Bearer ${token}`) : new HttpHeaders();
  }

  private respond<T>(value: T): Observable<T> {
    return of(this.clone(value)).pipe(delay(this.latency));
  }

  private clone<T>(v: T): T {
    return v === undefined ? v : JSON.parse(JSON.stringify(v));
  }

  private log(Action: string, ActionType: AuditActionType, EntityType: string, EntityName: string,
    Before: Record<string, unknown> | null, After: Record<string, unknown> | null) {
    this.audit.unshift({
      ID: Math.max(0, ...this.audit.map(a => a.ID)) + 1, Timestamp: new Date().toISOString(),
      ActorID: CURRENT_USER_ID, ActorName: userName(CURRENT_USER_ID), Action, ActionType, EntityType, EntityName,
      IP: '103.21.58.14', UserAgent: 'Chrome 129 · Windows', Result: 'Success', Before, After
    });
  }

  private static perms(fn: (module: string, action: PermAction) => boolean): PermissionSet {
    const set: PermissionSet = {};
    PERM_MODULES.forEach(m => {
      set[m] = { View: false, Create: false, Edit: false, Delete: false, Manage: false };
      PERM_ACTIONS.forEach(a => set[m][a] = fn(m, a));
    });
    return set;
  }

  // ---------------- seed ----------------

  private seed() {
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600000).toISOString();

    // ---- users (directory + a few invited / suspended people) ----
    const lastActive = [0.2, 3, 26, 1.5, 50, 7, 140, 0.6];
    const twoFa = [true, true, false, true, false, true, true, false];
    this.users = USERS.map((u, i) => ({
      ID: u.ID, Name: u.Name, Email: u.Email, Designation: u.Designation, RoleID: u.RoleID, TeamID: u.TeamID,
      DepartmentID: u.DepartmentID, Location: u.Location,
      Status: u.Status === 'Inactive' ? 'Suspended' : u.Status, LastActive: hoursAgo(lastActive[i] ?? 10),
      TwoFactor: twoFa[i] ?? false, JoinedOn: u.JoinedOn
    }));
    this.users.push(
      { ID: 101, Name: 'Meera Nair', Email: 'meera.nair@example.com', Designation: 'UI Designer', RoleID: 4, TeamID: 4, DepartmentID: 2, Location: 'Kochi', Status: 'Invited', LastActive: null, TwoFactor: false, JoinedOn: daysFromToday(-2) },
      { ID: 102, Name: 'Arjun Desai', Email: 'arjun.desai@example.com', Designation: 'Support Engineer', RoleID: 5, TeamID: 6, DepartmentID: 4, Location: 'Surat', Status: 'Suspended', LastActive: hoursAgo(24 * 21), TwoFactor: false, JoinedOn: '2022-09-19' },
      { ID: 103, Name: 'Ishaan Kapoor', Email: 'ishaan.kapoor@example.com', Designation: 'QA Engineer', RoleID: 6, TeamID: 3, DepartmentID: 1, Location: 'Pune', Status: 'Invited', LastActive: null, TwoFactor: false, JoinedOn: daysFromToday(-5) },
    );

    // ---- roles ----
    const descr: Record<number, string> = {
      1: 'Full access, including billing and Super Admin transfer.',
      2: 'Manage workspace settings, people and security.',
      3: 'Plan and run projects, sprints and workflows.',
      4: 'Work on tasks and collaborate inside projects.',
      5: 'Read-only access to projects, tasks and reports.',
    };
    const colors: Record<number, string> = { 1: '#7A3FE4', 2: '#0043E0', 3: '#0E9AA7', 4: '#029848', 5: '#8A94A6' };
    const P = SettingsService.perms;
    const rolePerms: Record<number, PermissionSet> = {
      1: P(() => true),
      2: P((m, a) => m !== 'Billing' || a === 'View' || a === 'Edit'),
      3: P((m, a) => ['Projects', 'Tasks', 'Agile', 'Workspace'].includes(m) ? true
        : m === 'Workflows' ? a !== 'Delete' && a !== 'Manage'
          : m === 'Team' ? a === 'View' || a === 'Edit'
            : m === 'Reports' ? a === 'View' || a === 'Create' : false),
      4: P((m, a) => m === 'Projects' ? a === 'View'
        : ['Tasks', 'Agile', 'Workspace'].includes(m) ? ['View', 'Create', 'Edit'].includes(a)
          : ['Team', 'Workflows', 'Reports'].includes(m) ? a === 'View' : false),
      5: P((m, a) => ['Projects', 'Tasks', 'Team', 'Agile', 'Reports', 'Workspace'].includes(m) && a === 'View'),
    };
    // Role 1 is "Super Admin" (the shared mock directory still calls it Owner).
    this.roles = ROLES.map(r => ({
      ID: r.ID, Name: r.ID === SUPER_ADMIN_ROLE_ID ? 'Super Admin' : r.Name, Description: descr[r.ID] || '', IsSystem: true, Color: colors[r.ID] || '#0043E0',
      Permissions: rolePerms[r.ID] || P(() => false), UserCount: 0
    }));
    this.roles.push({
      ID: 6, Name: 'QA Reviewer', Description: 'Review and verify tasks; create quality reports.', IsSystem: false, Color: '#C77800',
      Permissions: P((m, a) => m === 'Tasks' ? ['View', 'Edit'].includes(a) : m === 'Reports' ? ['View', 'Create'].includes(a)
        : ['Projects', 'Agile'].includes(m) && a === 'View'), UserCount: 0
    });

    // ---- policy ----
    this.policy = {
      PwdMinLength: 10, PwdUpper: true, PwdNumber: true, PwdSymbol: false, PwdExpiryDays: 0, PwdReuseHistory: 3,
      IdleTimeoutMin: 30, MaxSessionHours: 24, ConcurrentSessions: 5, TwoFactor: 'Admins',
      SsoEnabled: false, SsoProtocol: 'SAML', SsoEntityId: '', SsoUrl: '', SsoCertificate: '',
      IpAllowlistEnabled: false, IpAllowlist: ['103.21.58.0/24', '49.36.12.88/32'],
      RestrictSignupDomains: true, AllowedDomains: ['example.com'], AuditRetentionDays: 180
    };

    this.seedAudit();
    this.seedIntegrations();

    this.webhooks = [
      { ID: 1, Url: 'https://hooks.acme.example.com/pm/tasks', Events: ['task.created', 'task.updated'], Secret: 'whsec_' + this.randomString(24), Active: true, LastStatus: 'Success', LastCode: 200, LastDelivery: hoursAgo(1.2), CreatedOn: hoursAgo(24 * 60) },
      { ID: 2, Url: 'https://erp.acme.example.com/webhooks/projects', Events: ['project.created', 'project.updated'], Secret: 'whsec_' + this.randomString(24), Active: true, LastStatus: 'Failed', LastCode: 504, LastDelivery: hoursAgo(5), CreatedOn: hoursAgo(24 * 30) },
      { ID: 3, Url: 'https://bi.acme.example.com/ingest/sprints', Events: ['sprint.started', 'sprint.completed'], Secret: 'whsec_' + this.randomString(24), Active: false, LastStatus: 'Never', LastCode: null, LastDelivery: null, CreatedOn: hoursAgo(24 * 4) },
    ];

    this.apiKeys = [
      { ID: 1, Name: 'Power BI connector', Prefix: 'pk_live_', Last4: '8f2K', Scopes: ['projects:read', 'tasks:read', 'reports:read'], CreatedOn: hoursAgo(24 * 120), CreatedBy: 'Ananya Rao', LastUsed: hoursAgo(2), ExpiresOn: daysFromToday(245) },
      { ID: 2, Name: 'CI pipeline', Prefix: 'pk_live_', Last4: 'Qa71', Scopes: ['tasks:read', 'tasks:write'], CreatedOn: hoursAgo(24 * 45), CreatedBy: 'Vikram Singh', LastUsed: hoursAgo(26), ExpiresOn: daysFromToday(12) },
      { ID: 3, Name: 'Legacy import script', Prefix: 'pk_live_', Last4: 'x9Pd', Scopes: ['projects:write', 'tasks:write', 'users:read'], CreatedOn: hoursAgo(24 * 300), CreatedBy: 'Aarav Sharma', LastUsed: hoursAgo(24 * 64), ExpiresOn: null },
    ];

    // ---- notifications ----
    const ch = (InApp: boolean, Email: boolean, Slack: boolean, Push: boolean) => ({ InApp, Email, Slack, Push });
    this.notify = {
      Events: [
        { Key: 'task_assigned', Label: 'Task assigned to me', Group: 'Tasks', Description: 'Someone assigns you a task', Channels: ch(true, true, true, true) },
        { Key: 'mentioned', Label: 'Mentioned in a comment', Group: 'Tasks', Description: '@mentions in comments and descriptions', Channels: ch(true, true, true, true) },
        { Key: 'status_changed', Label: 'Status changed', Group: 'Tasks', Description: 'Status changes on tasks you follow', Channels: ch(true, false, false, false) },
        { Key: 'comment_added', Label: 'New comment', Group: 'Tasks', Description: 'Comments on tasks you follow', Channels: ch(true, false, true, false) },
        { Key: 'due_soon', Label: 'Due soon', Group: 'Reminders', Description: '24 hours before a task is due', Channels: ch(true, true, false, true) },
        { Key: 'overdue', Label: 'Overdue', Group: 'Reminders', Description: 'When your task becomes overdue', Channels: ch(true, true, true, true) },
        { Key: 'approval_requested', Label: 'Approval requested', Group: 'Workflows', Description: 'A workflow step waits for your approval', Channels: ch(true, true, true, true) },
        { Key: 'approval_decided', Label: 'Approval decided', Group: 'Workflows', Description: 'Your request was approved or rejected', Channels: ch(true, true, false, false) },
        { Key: 'sprint_started', Label: 'Sprint started', Group: 'Agile', Description: 'A sprint you are part of starts', Channels: ch(true, false, true, false) },
        { Key: 'sprint_completed', Label: 'Sprint completed', Group: 'Agile', Description: 'Sprint review summary', Channels: ch(true, true, false, false) },
        { Key: 'weekly_digest', Label: 'Weekly digest', Group: 'Summaries', Description: 'Your week across projects', Channels: ch(false, true, false, false) },
        { Key: 'security_alert', Label: 'Security alerts', Group: 'Account', Description: 'New sign-ins, 2FA and password changes', Channels: ch(true, true, false, true) },
      ],
      DigestFrequency: 'Weekly', DigestTime: '09:00', QuietEnabled: true, QuietFrom: '21:00', QuietTo: '08:00', QuietDays: ['Sat', 'Sun']
    };
    this.email = {
      FromName: 'Acme PM', FromEmail: 'no-reply@acme.example.com', ReplyTo: 'support@acme.example.com', SmtpEnabled: true,
      SmtpHost: 'smtp.acme.example.com', SmtpPort: 587, SmtpUsername: 'pm-mailer', SmtpPasswordSet: true, SmtpSecurity: 'STARTTLS'
    };
    this.smtpPassword = this.randomString(16);
    this.templates = [
      { ID: 1, Key: 'invite', Name: 'User invitation', Subject: 'You are invited to join {{org.name}}', Body: 'Hi {{user.name}},\n\n{{actor.name}} has invited you to join {{org.name}} on Acme PM.\n\nAccept the invitation: {{link}}\n\nSee you there!', UpdatedOn: hoursAgo(24 * 40) },
      { ID: 2, Key: 'task_assigned', Name: 'Task assigned', Subject: '[{{project.name}}] {{task.title}} was assigned to you', Body: 'Hi {{user.name}},\n\n{{actor.name}} assigned you {{task.key}} — {{task.title}}.\nDue date: {{task.due}}\n\nOpen task: {{link}}', UpdatedOn: hoursAgo(24 * 12) },
      { ID: 3, Key: 'due_soon', Name: 'Due date reminder', Subject: 'Reminder: {{task.title}} is due {{task.due}}', Body: 'Hi {{user.name}},\n\nThis is a reminder that {{task.key}} — {{task.title}} in {{project.name}} is due on {{task.due}}.\n\nOpen task: {{link}}', UpdatedOn: hoursAgo(24 * 70) },
      { ID: 4, Key: 'password_reset', Name: 'Password reset', Subject: 'Reset your {{org.name}} password', Body: 'Hi {{user.name}},\n\nWe received a request to reset your password. The link below is valid for 30 minutes.\n\n{{link}}\n\nIf you did not request this, you can ignore this email.', UpdatedOn: hoursAgo(24 * 100) },
      { ID: 5, Key: 'weekly_digest', Name: 'Weekly digest', Subject: 'Your week at {{org.name}}', Body: 'Hi {{user.name}},\n\nHere is what happened in your projects this week. Highlights for {{project.name}} and more are waiting for you.\n\nView digest: {{link}}', UpdatedOn: hoursAgo(24 * 8) },
    ];

    // ---- billing ----
    this.plans = [
      { Key: 'Free', Name: 'Free', MonthlyPrice: 0, YearlyPrice: 0, Description: 'For small teams getting started.', Features: ['Up to 5 users', '3 projects', 'List & board views', 'Community support'], StorageGB: 2, AutomationRuns: 100, ApiCalls: 1000, MaxSeats: 5 },
      { Key: 'Team', Name: 'Team', MonthlyPrice: 8, YearlyPrice: 6.5, Description: 'Collaboration for growing teams.', Features: ['Unlimited projects', 'Gantt & calendar', 'Time tracking', 'Email support'], StorageGB: 20, AutomationRuns: 1000, ApiCalls: 10000, MaxSeats: 50 },
      { Key: 'Business', Name: 'Business', MonthlyPrice: 15, YearlyPrice: 12, Description: 'Advanced control and reporting.', Features: ['Everything in Team', 'Custom roles', 'Workflows & approvals', 'Audit logs (1 year)', 'Priority support'], StorageGB: 100, AutomationRuns: 10000, ApiCalls: 100000, MaxSeats: null, Popular: true },
      { Key: 'Enterprise', Name: 'Enterprise', MonthlyPrice: 25, YearlyPrice: 20, Description: 'Security & scale for large orgs.', Features: ['Everything in Business', 'SAML / OIDC SSO', 'IP allowlist', 'Unlimited audit retention', 'Dedicated CSM'], StorageGB: 1000, AutomationRuns: 100000, ApiCalls: 1000000, MaxSeats: null },
    ];
    this.subscription = {
      PlanKey: 'Business', Cycle: 'Monthly', Seats: 12, RenewalDate: daysFromToday(18), StorageUsedGB: 38.4,
      AutomationUsed: 6240, ApiUsed: 81300, PaymentBrand: 'Visa', PaymentLast4: '4242', PaymentExpiry: '08/28'
    };
    this.contact = {
      CompanyName: 'Acme Technologies Pvt. Ltd.', ContactName: 'Aarav Sharma', Email: 'accounts@acme.example.com', Phone: '+91 22 4000 1200',
      Address: '4th Floor, Orchid Business Park, Andheri East, Mumbai 400069', Country: 'India', TaxId: '27AABCA1234F1Z5'
    };
    this.invoices = [];
    const today = new Date();
    for (let i = 0; i < 9; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const seats = i < 3 ? 12 : i < 6 ? 10 : 8;
      const amount = seats * 15;
      this.invoices.push({
        ID: i + 1, Number: `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${String(1040 - i)}`,
        Date: this.ymdOf(d), PeriodFrom: this.ymdOf(d), PeriodTo: this.ymdOf(end), PlanName: 'Business (Monthly)', Seats: seats,
        Amount: amount, Tax: Math.round(amount * 0.18 * 100) / 100, Status: i === 0 ? 'Due' : 'Paid'
      });
    }
  }

  private ymdOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private seedIntegrations() {
    const iso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
    this.integrations = [
      { Key: 'slack', Name: 'Slack', Description: 'Post task updates and approvals to channels; act on them from Slack.', Category: 'Communication', Color: '#4A154B', Badge: 'Sl', Connected: true, ConnectedOn: iso(90), ConnectedBy: 'Aarav Sharma',
        Fields: [{ Key: 'workspace', Label: 'Slack workspace', Type: 'text', Placeholder: 'acme.slack.com' }, { Key: 'channel', Label: 'Default channel', Type: 'text', Placeholder: '#pm-updates' }, { Key: 'threads', Label: 'Reply in threads', Type: 'toggle' }],
        Config: { workspace: 'acme.slack.com', channel: '#pm-updates', threads: true } },
      { Key: 'teams', Name: 'Microsoft Teams', Description: 'Send notifications and adaptive cards to Teams channels.', Category: 'Communication', Color: '#5059C9', Badge: 'T', Connected: false, ConnectedOn: null, ConnectedBy: null,
        Fields: [{ Key: 'tenant', Label: 'Tenant domain', Type: 'text', Placeholder: 'acme.onmicrosoft.com' }, { Key: 'channel', Label: 'Default channel', Type: 'text', Placeholder: 'General' }],
        Config: {} },
      { Key: 'gcal', Name: 'Google Calendar', Description: 'Sync task due dates and milestones to calendars.', Category: 'Calendar', Color: '#1A73E8', Badge: 'GC', Connected: true, ConnectedOn: iso(30), ConnectedBy: 'Neha Gupta',
        Fields: [{ Key: 'calendar', Label: 'Calendar', Type: 'select', Options: ['Primary', 'Team calendar', 'Releases'] }, { Key: 'sync', Label: 'Sync direction', Type: 'select', Options: ['One-way (PM → Calendar)', 'Two-way'] }, { Key: 'milestones', Label: 'Include milestones', Type: 'toggle' }],
        Config: { calendar: 'Team calendar', sync: 'One-way (PM → Calendar)', milestones: true } },
      { Key: 'outlook', Name: 'Outlook', Description: 'Sync deadlines with Outlook / Microsoft 365 calendars.', Category: 'Calendar', Color: '#0F6CBD', Badge: 'O', Connected: false, ConnectedOn: null, ConnectedBy: null,
        Fields: [{ Key: 'calendar', Label: 'Calendar', Type: 'select', Options: ['Calendar', 'Team calendar'] }, { Key: 'milestones', Label: 'Include milestones', Type: 'toggle' }],
        Config: {} },
      { Key: 'github', Name: 'GitHub', Description: 'Link commits, branches and pull requests to tasks.', Category: 'Development', Color: '#24292F', Badge: 'GH', Connected: true, ConnectedOn: iso(150), ConnectedBy: 'Rohit Mehta',
        Fields: [{ Key: 'org', Label: 'Organization', Type: 'text', Placeholder: 'acme-tech' }, { Key: 'autoclose', Label: 'Close tasks on merged PR', Type: 'toggle' }],
        Config: { org: 'acme-tech', autoclose: true } },
      { Key: 'gitlab', Name: 'GitLab', Description: 'Link merge requests and pipelines to tasks.', Category: 'Development', Color: '#E24329', Badge: 'GL', Connected: false, ConnectedOn: null, ConnectedBy: null,
        Fields: [{ Key: 'url', Label: 'GitLab URL', Type: 'text', Placeholder: 'https://gitlab.com' }, { Key: 'group', Label: 'Group', Type: 'text', Placeholder: 'acme' }],
        Config: {} },
      { Key: 'jira', Name: 'Jira import', Description: 'Import projects, issues, sprints and users from Jira.', Category: 'Import', Color: '#0052CC', Badge: 'J', Connected: false, ConnectedOn: null, ConnectedBy: null,
        Fields: [{ Key: 'site', Label: 'Jira site', Type: 'text', Placeholder: 'acme.atlassian.net' }, { Key: 'scope', Label: 'Import', Type: 'select', Options: ['Issues only', 'Issues + sprints', 'Everything'] }],
        Config: {} },
      { Key: 'zapier', Name: 'Zapier', Description: 'Automate with 6,000+ apps using triggers and actions.', Category: 'Automation', Color: '#FF4F00', Badge: 'Z', Connected: false, ConnectedOn: null, ConnectedBy: null,
        Fields: [{ Key: 'account', Label: 'Zapier account email', Type: 'text', Placeholder: 'ops@acme.example.com' }],
        Config: {} },
      { Key: 'webhooks', Name: 'Webhooks', Description: 'Push real-time events to your own HTTPS endpoints.', Category: 'Developer', Color: '#0043E0', Badge: '{ }', Connected: true, ConnectedOn: iso(60), ConnectedBy: 'Vikram Singh',
        Fields: [{ Key: 'retries', Label: 'Retry failed deliveries', Type: 'select', Options: ['Off', '3 times', '5 times'] }, { Key: 'signing', Label: 'Sign payloads (HMAC SHA-256)', Type: 'toggle' }],
        Config: { retries: '3 times', signing: true } },
    ];
  }

  private seedAudit() {
    let s = 20240917;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
    const ips = ['103.21.58.14', '49.36.12.88', '106.51.77.203', '182.70.4.19', '157.32.140.6', '27.4.118.90'];
    const agents = ['Chrome 129 · Windows', 'Edge 129 · Windows', 'Safari 17 · macOS', 'Firefox 131 · Ubuntu', 'PM App 3.2 · Android', 'PM App 3.1 · iOS', 'API client'];
    const statuses = ['To Do', 'In Progress', 'In Review', 'Done'];
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const taskTitles = ['Login page redesign', 'Payment gateway retry', 'Leave balance API', 'ETL job for sales', 'SNMP polling service',
      'Lead scoring rules', 'Push notifications', 'Dashboard KPIs', 'Data quality checks', 'Export to Excel'];
    const roleNames = ROLES.map(r => r.ID === SUPER_ADMIN_ROLE_ID ? 'Super Admin' : r.Name);

    type Gen = () => Pick<AuditLog, 'Action' | 'ActionType' | 'EntityType' | 'EntityName' | 'Before' | 'After'> & { Fail?: boolean };
    const gens: { w: number; g: Gen }[] = [
      { w: 22, g: () => ({ Action: 'Signed in', ActionType: 'Login', EntityType: 'Session', EntityName: 'Web session', Before: null, After: null }) },
      { w: 5, g: () => ({ Action: 'Failed sign-in', ActionType: 'Login', EntityType: 'Session', EntityName: 'Invalid password', Before: null, After: null, Fail: true }) },
      { w: 20, g: () => {
        const p = pick(PROJECTS); const from = pick(statuses); const to = statuses[(statuses.indexOf(from) + 1) % 4];
        const assignee = pick(USERS).Name;
        return { Action: 'Updated task', ActionType: 'Update', EntityType: 'Task', EntityName: `${p.Prefix}-${10 + Math.floor(rnd() * 90)} ${pick(taskTitles)}`,
          Before: { Status: from, Priority: 'Medium', Assignee: assignee, DueDate: daysFromToday(3) },
          After: { Status: to, Priority: rnd() > .5 ? 'High' : 'Medium', Assignee: assignee, DueDate: rnd() > .6 ? daysFromToday(7) : daysFromToday(3) } };
      } },
      { w: 10, g: () => {
        const p = pick(PROJECTS);
        return { Action: 'Created task', ActionType: 'Create', EntityType: 'Task', EntityName: `${p.Prefix}-${100 + Math.floor(rnd() * 50)} ${pick(taskTitles)}`,
          Before: null, After: { Status: 'To Do', Priority: pick(priorities), Project: p.Name, Assignee: pick(USERS).Name } };
      } },
      { w: 5, g: () => {
        const p = pick(PROJECTS);
        return { Action: 'Deleted task', ActionType: 'Delete', EntityType: 'Task', EntityName: `${p.Prefix}-${Math.floor(rnd() * 90) + 5} ${pick(taskTitles)}`,
          Before: { Status: pick(statuses), Priority: pick(priorities), Project: p.Name }, After: null };
      } },
      { w: 6, g: () => {
        const p = pick(PROJECTS);
        return { Action: 'Updated project', ActionType: 'Update', EntityType: 'Project', EntityName: p.Name,
          Before: { Status: 'In Progress', Health: 'On Track', EndDate: daysFromToday(30) }, After: { Status: 'In Progress', Health: 'At Risk', EndDate: daysFromToday(44) } };
      } },
      { w: 6, g: () => {
        const u = pick(USERS); const from = pick(roleNames); const to = pick(roleNames.filter(r => r !== from));
        return { Action: 'Changed user role', ActionType: 'Security', EntityType: 'User', EntityName: u.Name, Before: { Role: from }, After: { Role: to } };
      } },
      { w: 4, g: () => ({ Action: 'Invited user', ActionType: 'Create', EntityType: 'User', EntityName: `${pick(['dev', 'qa', 'design', 'ops'])}${Math.floor(rnd() * 90)}@example.com`, Before: null, After: { Role: 'Member', Team: pick(TEAMS).Name } }) },
      { w: 3, g: () => ({ Action: 'Updated access policies', ActionType: 'Security', EntityType: 'Policy', EntityName: 'Access policies',
        Before: { PwdMinLength: 8, TwoFactor: 'Off', IdleTimeoutMin: 60 }, After: { PwdMinLength: 10, TwoFactor: 'Admins', IdleTimeoutMin: 30 } }) },
      { w: 6, g: () => ({ Action: 'Exported report', ActionType: 'Export', EntityType: 'Report', EntityName: pick(['Timesheet summary', 'Project portfolio', 'Sprint velocity', 'Workload by team']), Before: null, After: { Format: pick(['CSV', 'PDF', 'XLSX']) } }) },
      { w: 3, g: () => ({ Action: 'Generated API key', ActionType: 'Security', EntityType: 'API Key', EntityName: pick(['Power BI connector', 'CI pipeline', 'Zap automation']), Before: null, After: { Scopes: ['tasks:read'], ExpiresOn: daysFromToday(90) } }) },
      { w: 2, g: () => ({ Action: 'Updated workspace settings', ActionType: 'Update', EntityType: 'Organization', EntityName: 'Acme Technologies Pvt. Ltd.', Before: { Timezone: 'UTC', WeekStart: 'Sunday' }, After: { Timezone: 'Asia/Kolkata', WeekStart: 'Monday' } }) },
      { w: 2, g: () => ({ Action: 'Permission denied', ActionType: 'Security', EntityType: 'Billing', EntityName: 'Invoices', Before: null, After: null, Fail: true }) },
    ];
    const total = gens.reduce((a, x) => a + x.w, 0);
    const list: AuditLog[] = [];
    for (let i = 0; i < 150; i++) {
      let r = rnd() * total;
      const gen = gens.find(x => (r -= x.w) < 0) || gens[0];
      const e = gen.g();
      const actor = pick(USERS);
      const minutesAgo = Math.floor(rnd() * 30 * 24 * 60);
      list.push({
        ID: 0, Timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(), ActorID: actor.ID, ActorName: actor.Name,
        Action: e.Action, ActionType: e.ActionType, EntityType: e.EntityType, EntityName: e.EntityName,
        IP: pick(ips), UserAgent: e.EntityType === 'Report' && rnd() > .7 ? 'API client' : pick(agents.slice(0, 6)),
        Result: e.Fail ? 'Failed' : (rnd() > .97 ? 'Failed' : 'Success'), Before: e.Before, After: e.After
      });
    }
    list.sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
    list.forEach((a, i) => a.ID = list.length - i);
    this.audit = list;
  }
}
