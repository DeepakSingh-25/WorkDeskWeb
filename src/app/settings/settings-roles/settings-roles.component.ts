import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import {
  EDITABLE_SYSTEM_ROLE_IDS, PermAction, PermissionSet, Role, RoleActionResponse, SUPER_ADMIN_ROLE_ID
} from '../../Interface/settings';
import { PERM_ACTIONS, PERM_MODULES, SettingsService } from '../../services/Settings/settings.service';
import { AuthService } from '../../services/Auth/auth.service';
import { ProfilePhotoService } from '../../services/User-Profile/profile-photo.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { EntitlementService, isAccessModule } from '../../services/Access/entitlement.service';
import { SettingsUi } from '../settings-ui';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const NO_PERMISSION = "You don't have permission to manage roles.";
const OFFLINE = 'Could not reach the server. Check your connection and try again.';
/** Settings.Manage is the cell the API policies ManageUsers / ManageRoles check. */
export const MANAGE_PEOPLE_HINT = 'Manage = users & roles';

@Component({
    selector: 'app-settings-roles',
    templateUrl: './settings-roles.component.html',
    styleUrl: './settings-roles.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsRolesComponent implements OnInit {
  ui = SettingsUi;
  faLock = faLock;
  modules = PERM_MODULES;
  actions = PERM_ACTIONS;
  moduleHints: Record<string, string> = {
    Projects: 'Projects, milestones, members', Tasks: 'Tasks, subtasks, comments, time logs', Team: 'People, teams, workload',
    Agile: 'Backlog, sprints, boards', Workflows: 'Automations and approvals', Reports: 'Dashboards and exports',
    Workspace: 'Documents, wiki, files',
    Settings: `Workspace, security, integrations. ${MANAGE_PEOPLE_HINT}`, Billing: 'Plan, invoices, payment'
  };
  roleColors = ['#0043E0', '#7A3FE4', '#0E9AA7', '#029848', '#C77800', '#E0401C', '#D6336C', '#8A94A6'];

  roles: Role[] = [];
  selectedId: number | null = null;
  working: Role | null = null;
  private original = '';
  // Confirm dialogs (Promises) can resolve after the page is gone — then do nothing.
  private destroyed = false;

  compareMode = false;
  compareA: number | null = null;
  compareB: number | null = null;

  showCreate = false;
  createForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private authService: AuthService,
    private photoService: ProfilePhotoService,
    private router: Router,
    private entitlement: EntitlementService,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => this.destroyed = true);
    this.createForm = this.fb.group({
      txtName: new FormControl('', [Validators.required, Validators.maxLength(40)]),
      txtDescription: new FormControl('', [Validators.maxLength(160)]),
      drpCopyFrom: new FormControl<number | null>(null),
      Color: new FormControl('#0043E0'),
    });
  }

  ngOnInit() {
    // Plan info for greying rows of modules that are not in the plan (memory cache, one call).
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.loadRoles();
  }

  loadRoles(selectId?: number) {
    if (this.destroyed) return;
    this.loaderService.showLoader();
    this.settingsService.getRoles().pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        const r = (res ?? []).map(x => this.withAllModules(x));
        this.roles = r;
        const id = selectId ?? this.selectedId ?? r[0]?.ID ?? null;
        this.select(r.find(x => x.ID === id) || r[0]);
        // Compare ke IDs: unset ya delete ho chuke role par ho to dobara default karo.
        if (!r.some(x => x.ID === this.compareA)) this.compareA = r[0]?.ID ?? null;
        if (!r.some(x => x.ID === this.compareB)) this.compareB = r[1]?.ID ?? null;
      },
      // roles stays as it is (empty on first load); 401 ends the session, else a toast.
      error: (err: HttpErrorResponse) => { this.handleError(err, 'Could not load roles. Please try again.'); }
    });
  }

  /**
   * Runs one save / create / delete with the global loader. The loader is hidden in finalize (also when
   * the page is destroyed mid-request); a reload, if wanted, starts after that so it shows its own loader.
   * onSuccess returns the ID to reload with (undefined = keep selection) or null for no reload;
   * on 404 / 409 (our list is stale) reloadOnStale decides whether the list is refreshed.
   */
  private runAction<T>(request: Observable<T>, onSuccess: (res: T) => number | null | undefined, fallback: string,
    reloadOnStale = true) {
    let reload = false;
    let reloadId: number | undefined;
    this.loaderService.showLoader();
    request.pipe(
      finalize(() => {
        this.loaderService.hideLoader();
        if (reload) this.loadRoles(reloadId);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        const id = onSuccess(res);
        reload = id !== null;
        reloadId = id ?? undefined;
      },
      error: (err: HttpErrorResponse) => {
        // 409 / 404: stale edits are discarded, the list is refreshed and the same role stays selected.
        reload = this.handleError(err, fallback) && reloadOnStale;
        reloadId = this.selectedId ?? undefined;
      }
    });
  }

  private select(r: Role | undefined) {
    if (!r) { this.selectedId = null; this.working = null; return; }
    this.selectedId = r.ID;
    this.working = JSON.parse(JSON.stringify(r));
    this.original = JSON.stringify(r.Permissions) + r.Name + r.Description;
  }

  get dirty(): boolean {
    return !!this.working && (JSON.stringify(this.working.Permissions) + this.working.Name + this.working.Description) !== this.original;
  }

  /**
   * May the caller change this role's permissions? The API says so per role (CanEdit). Older API without
   * CanEdit: custom roles yes; built-in Admin / PM / Member / Viewer only for the Super Admin (A1 RoleID 1).
   * The Super Admin role itself never (it always has every permission).
   */
  canEditRole(r: Role | null | undefined): boolean {
    if (!r || r.ID === SUPER_ADMIN_ROLE_ID) return false;
    if (typeof r.CanEdit === 'boolean') return r.CanEdit;
    if (!r.IsSystem) return true;
    return EDITABLE_SYSTEM_ROLE_IDS.includes(r.ID) && this.entitlement.current()?.RoleID === SUPER_ADMIN_ROLE_ID;
  }

  get locked(): boolean { return !this.canEditRole(this.working); }

  /** Built-in roles keep their name and description, even when their permissions may change. */
  get canRename(): boolean { return !this.locked && !!this.working && !this.working.IsSystem; }

  /** Why the selected role is read-only. */
  get lockNote(): string {
    if (this.working?.ID === SUPER_ADMIN_ROLE_ID) return 'Super Admin always has every permission.';
    if (this.working?.IsSystem) return 'Only the Super Admin can change built-in roles.';
    return "You can't change this role.";
  }

  lockTitle(r: Role): string {
    return r.IsSystem ? "Built-in role — you can't change it" : "You can't change this role";
  }

  onSelectRole(r: Role) {
    if (r.ID === this.selectedId) return;
    this.compareMode = false;
    if (!this.dirty) { this.select(r); return; }
    this.notificationsService.showConfirm('You have unsaved permission changes. Discard them?').then(ok => { if (ok) this.select(r); });
  }

  permCount(r: Role): number {
    return this.modules.reduce((n, m) => n + this.actions.filter(a => r.Permissions[m]?.[a]).length, 0);
  }

  // Every PERM_MODULES row exists (all false when the server didn't send it), so the matrix never
  // writes into a missing row and a save always sends all modules.
  private withAllModules(r: Role): Role {
    const Permissions: PermissionSet = { ...r.Permissions };
    this.modules.forEach(m => Permissions[m] ??= { View: false, Create: false, Edit: false, Delete: false, Manage: false });
    return { ...r, Permissions };
  }

  // ---------- plan (spec 005 §8.2) ----------

  /** Module not in the plan: row greyed and read-only. Values stay stored and are sent back unchanged. */
  planLocked(m: string): boolean {
    const access = this.entitlement.current();
    return !!access && isAccessModule(m) && !access.Modules[m]?.InPlan;
  }

  planHint(m: string): string {
    const plans = isAccessModule(m) ? this.entitlement.current()?.Modules[m]?.AvailableIn ?? [] : [];
    return plans.length ? `Available in ${plans.join(', ')}` : 'Not included in your plan';
  }

  private get editableModules(): string[] { return this.modules.filter(m => !this.planLocked(m)); }

  // ---------- matrix ----------

  has(m: string, a: PermAction): boolean { return !!this.working?.Permissions[m]?.[a]; }

  /** Short note under a row name; only Settings has one (its Manage cell = manage users & roles). */
  rowNote(m: string): string | null { return m === 'Settings' ? MANAGE_PEOPLE_HINT : null; }

  /** Tooltip for one cell whose meaning is wider than its column name. */
  cellHint(m: string, a: PermAction): string | null {
    return m === 'Settings' && a === 'Manage' ? 'Lets people add, edit and remove users and change roles' : null;
  }

  toggle(m: string, a: PermAction) {
    if (this.locked || !this.working || this.planLocked(m)) return;
    const row = this.working.Permissions[m];
    row[a] = !row[a];
    if (a === 'View' && !row.View) this.actions.forEach(x => row[x] = false);       // no view → nothing else
    if (a !== 'View' && row[a]) row.View = true;                                     // anything implies view
  }

  rowAll(m: string): boolean { return this.actions.every(a => this.has(m, a)); }
  rowSome(m: string): boolean { return !this.rowAll(m) && this.actions.some(a => this.has(m, a)); }
  colAll(a: PermAction): boolean { return this.editableModules.every(m => this.has(m, a)); }
  colSome(a: PermAction): boolean { return !this.colAll(a) && this.editableModules.some(m => this.has(m, a)); }

  toggleRow(m: string) {
    if (this.locked || !this.working || this.planLocked(m)) return;
    const val = !this.rowAll(m);
    this.actions.forEach(a => this.working!.Permissions[m][a] = val);
  }

  toggleCol(a: PermAction) {
    if (this.locked || !this.working) return;
    const val = !this.colAll(a);
    this.editableModules.forEach(m => {
      const row = this.working!.Permissions[m];
      row[a] = val;
      if (val && a !== 'View') row.View = true;
      if (!val && a === 'View') this.actions.forEach(x => row[x] = false);
    });
  }

  onDiscard() {
    const r = this.roles.find(x => x.ID === this.selectedId);
    this.select(r);
  }

  onSave() {
    if (!this.working || this.locked) return;
    if (!this.working.Name.trim()) { this.notificationsService.showNotification('error', 'Role Name is Required'); return; }
    if (this.roles.some(r => r.ID !== this.working!.ID && r.Name.toLowerCase() === this.working!.Name.trim().toLowerCase())) {
      this.notificationsService.showNotification('error', 'A role with this name already exists'); return;
    }
    // Built-in roles: Name / Description / Color go back exactly as loaded (the API rejects any change).
    const name = this.working.IsSystem ? this.working.Name : this.working.Name.trim();
    this.runAction(this.settingsService.saveRole({ ...this.working, Name: name }), res => {
      this.notificationsService.showNotification('success', res.Status || 'Role updated');
      // Saved my own role → my effective access changed; reload A1 (spec 005 §7.5).
      const myRoleId = this.entitlement.current()?.RoleID;
      if (myRoleId != null && res.ID === myRoleId) this.entitlement.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      return res.ID;
    }, 'Could not save the role. Please try again.');
  }

  // ---------- create / clone / delete ----------

  openCreate(copyFrom: Role | null = null) {
    const go = () => {
      this.createForm.reset({
        txtName: copyFrom ? `${copyFrom.Name} (copy)` : '', txtDescription: copyFrom?.Description || '',
        drpCopyFrom: copyFrom?.ID ?? null, Color: copyFrom?.Color || '#0043E0'
      });
      this.showCreate = true;
    };
    if (this.dirty) this.notificationsService.showConfirm('You have unsaved permission changes. Discard them?').then(ok => { if (ok) { this.onDiscard(); go(); } });
    else go();
  }

  onCreate() {
    if (this.createForm.invalid) { this.createForm.markAllAsTouched(); return; }
    const v = this.createForm.value;
    const name = String(v.txtName).trim();
    if (this.roles.some(r => r.Name.toLowerCase() === name.toLowerCase())) {
      this.notificationsService.showNotification('error', 'A role with this name already exists'); return;
    }
    const source = this.roles.find(r => r.ID === v.drpCopyFrom);
    const empty: PermissionSet = {};
    this.modules.forEach(m => empty[m] = { View: false, Create: false, Edit: false, Delete: false, Manage: false });
    const role: Role = {
      ID: 0, Name: name, Description: v.txtDescription || '', IsSystem: false, Color: v.Color, UserCount: 0,
      Permissions: source ? JSON.parse(JSON.stringify(source.Permissions)) : empty
    };
    // Drawer stays open on error (400 Errors.Name etc.); it closes only on success. No reload on error.
    this.runAction(this.settingsService.saveRole(role), res => {
      this.notificationsService.showNotification('success', res.Status || 'Role added');
      this.showCreate = false;
      this.compareMode = false;
      return res.ID;
    }, 'Could not create the role. Please try again.', false);
  }

  onDelete(r: Role) {
    const extra = r.UserCount ? ` ${r.UserCount} user(s) with this role will be moved to "Member".` : '';
    this.notificationsService.showdelete(`Delete the role "${r.Name}"?${extra}`).then(ok => {
      if (!ok || this.destroyed) return;
      this.runAction(this.settingsService.deleteRole(r.ID), res => {
        this.notificationsService.showNotification('success', res.Status || 'Role deleted');
        if (this.selectedId === r.ID) { this.selectedId = null; this.working = null; }
        this.roles = this.roles.filter(x => x.ID !== r.ID);   // reload fail ho to bhi list stale na rahe
        return undefined;
      }, 'Could not delete the role. Please try again.');
    });
  }

  // ---------- errors ----------

  // End the session on 401, otherwise toast the API message. (The loader is hidden by finalize.)
  // Returns true when our list is stale (404 / 409) and should be reloaded.
  private handleError(err: HttpErrorResponse, fallback: string): boolean {
    if (err.status === 401) { this.endSession(); return false; }
    this.notificationsService.showNotification('error', this.errorMessage(err, fallback));
    return err.status === 404 || err.status === 409;
  }

  // Only trust the body when it is our RoleActionResponse shape (ProblemDetails is not).
  private errorMessage(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as Partial<RoleActionResponse> | null;
    if (body && typeof body === 'object' && body.Success === false) {
      const fieldMessages = body.Errors ? Object.values(body.Errors).flat().filter(m => !!m) : [];
      const text = [body.Message, ...fieldMessages].filter(m => !!m).join(' ');
      if (text) return text;
    }
    if (err.status === 0) return OFFLINE;
    if (err.status === 403) return NO_PERMISSION;
    return fallback || GENERIC_ERROR;
  }

  // 401: end the session and go to /login (dashboard after sign-in). AuthInterceptor normally does this
  // already and navigates first — then don't navigate a second time (same as SettingsUsersComponent).
  private endSession() {
    this.showCreate = false;
    this.photoService.clear();
    this.authService.logout();
    const current = this.router.url.split('?')[0];
    if (this.router.currentNavigation() || current.startsWith('/login')) return;
    this.router.navigate(['/login']);
  }

  // ---------- compare ----------

  toggleCompare() {
    this.compareMode = !this.compareMode;
    if (this.compareMode && this.selectedId) this.compareA = this.selectedId;
  }

  roleById(id: number | null): Role | undefined { return this.roles.find(r => r.ID === id); }

  cmp(id: number | null, m: string, a: PermAction): boolean { return !!this.roleById(id)?.Permissions[m]?.[a]; }

  isDiff(m: string, a: PermAction): boolean { return this.cmp(this.compareA, m, a) !== this.cmp(this.compareB, m, a); }

  get diffCount(): number {
    return this.modules.reduce((n, m) => n + this.actions.filter(a => this.isDiff(m, a)).length, 0);
  }
}
