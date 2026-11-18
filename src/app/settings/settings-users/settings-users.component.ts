import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, defer, finalize, forkJoin, switchMap } from 'rxjs';
import {
  BulkUserResponse, RoleLookup, SeatInfo, SettingsLookupItem, SettingsUser, SUPER_ADMIN_ROLE_ID, UpdateUserRequest, UserActionResponse,
  UserStatusPatch
} from '../../Interface/settings';
import { SettingsService } from '../../services/Settings/settings.service';
import { AuthService } from '../../services/Auth/auth.service';
import { ProfilePhotoService } from '../../services/User-Profile/profile-photo.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { SettingsUi } from '../settings-ui';
import { EntitlementService } from '../../services/Access/entitlement.service';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const NO_PERMISSION = "You don't have permission to manage users.";
const OFFLINE = 'Could not reach the server. Check your connection and try again.';
const MAX_BULK = 100;   // API spec 003-settings-users §4.3: 1–100 IDs per bulk call

@Component({
    selector: 'app-settings-users',
    templateUrl: './settings-users.component.html',
    styleUrl: './settings-users.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsUsersComponent implements OnInit {
  ui = SettingsUi;
  currentUserId: string | null;

  users: SettingsUser[] = [];
  roles: RoleLookup[] = [];
  teams: SettingsLookupItem[] = [];
  departments: SettingsLookupItem[] = [];
  seats: SeatInfo | null = null;
  canSeeBilling = false;

  searchValue = '';
  roleFilter: number | null = null;
  teamFilter: number | null = null;
  statusTab = '';
  statusTabs = ['', 'Active', 'Invited', 'Suspended'];
  sortColumn = 'Name';
  sortColumnDir = 'asc';
  recordsPerPageOptions = [10, 25, 50];
  cardsPerPage = 10;
  currentPage = 1;

  showMoreFilters = false;
  showMoreEdit = false;
  selected = new Set<string>();
  bulkRoleID: number | null = null;

  editUser: SettingsUser | null = null;
  editForm: FormGroup;
  readonly maxBulk = MAX_BULK;

  // Every reload goes through this Subject; switchMap drops an older in-flight load, so results
  // can't be applied out of order.
  private reload$ = new Subject<void>();
  // Confirm dialogs (Promises) can resolve after the page is gone — then do nothing.
  private destroyed = false;

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
    this.currentUserId = this.authService.getUserId();
    this.destroyRef.onDestroy(() => this.destroyed = true);
    this.editForm = this.fb.group({
      txtName: new FormControl('', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]),
      txtDesignation: new FormControl('', [Validators.maxLength(100)]),
      drpRoleID: new FormControl<number | null>(null, [Validators.required]),
      drpTeamID: new FormControl<number | null>(null),
      drpDepartmentID: new FormControl<number | null>(null),
      txtLocation: new FormControl('', [Validators.maxLength(100)]),
      chkTwoFactor: new FormControl(false),
    });
  }

  ngOnInit() {
    // Seat card "Manage" link → Plan & License, only for people who may open it (spec 005 §8.2).
    this.entitlement.access$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.canSeeBilling = this.entitlement.can('Billing'));
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.settingsService.getTeams().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => this.teams = d ?? [],
      error: (err: HttpErrorResponse) => this.handleLookupError(err, 'Could not load teams.')
    });
    this.settingsService.getDepartments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => this.departments = d ?? [],
      error: (err: HttpErrorResponse) => this.handleLookupError(err, 'Could not load departments.')
    });
    // Roles + users together, so role names / Super Admin checks never run against a stale role list.
    // defer: the loader is shown only when the new load subscribes — i.e. after switchMap has
    // cancelled (and finalized / hidden) the previous one.
    this.reload$.pipe(
      switchMap(() => defer(() => {
        this.loaderService.showLoader();
        return forkJoin({ roles: this.settingsService.getRoleLookup(), users: this.settingsService.getUsers() });
      }).pipe(
        finalize(() => this.loaderService.hideLoader()),
        catchError((err: HttpErrorResponse) => {
          this.handleError(err, 'Could not load users. Please try again.');
          return EMPTY;   // keep reload$ alive for the next reload
        })
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ roles, users }) => this.applyUsers(roles ?? [], users ?? []));

    this.reload$.pipe(
      switchMap(() => this.settingsService.getSeats().pipe(
        catchError((err: HttpErrorResponse) => {
          this.handleLookupError(err, 'Could not load seat usage.');
          return EMPTY;
        })
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(s => this.seats = s);

    this.loadData();
  }

  loadData() {
    if (!this.destroyed) this.reload$.next();
  }

  private applyUsers(roles: RoleLookup[], users: SettingsUser[]) {
    this.roles = roles;
    this.users = users;
    const byId = new Map(this.users.map(x => [x.ID, x]));
    this.selected.forEach(id => {
      const u = byId.get(id);
      if (!u || !this.isSelectable(u)) this.selected.delete(id);
    });
    this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
  }

  /**
   * Runs one user action with the global loader. The loader is hidden in finalize (also when the
   * page is destroyed mid-request); a reload, if wanted, starts after that so it shows its own loader.
   * onSuccess returns true to reload; errors reload on 404 / 409 (our list is stale).
   */
  private runAction<T>(request: Observable<T>, onSuccess: (res: T) => boolean, fallback: string,
    onError?: (err: HttpErrorResponse) => void) {
    let reload = false;
    this.loaderService.showLoader();
    request.pipe(
      finalize(() => {
        this.loaderService.hideLoader();
        if (reload) this.loadData();
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => reload = onSuccess(res),
      error: (err: HttpErrorResponse) => {
        onError?.(err);
        reload = this.handleError(err, fallback);
      }
    });
  }

  // ---------- derived ----------

  get seatsUsed(): number { return this.seats?.SeatsUsed ?? 0; }
  get seatsTotal(): number { return this.seats?.Seats ?? 0; }
  get seatPct(): number { return this.seatsTotal ? Math.min(100, this.seatsUsed / this.seatsTotal * 100) : 0; }
  // null while seats are unknown — then the UI doesn't block and the server decides (409).
  get seatsFree(): number | null { return this.seats ? this.seats.Seats - this.seats.SeatsUsed : null; }

  count(status: string): number {
    return this.baseFiltered.filter(u => !status || u.Status === status).length;
  }

  private get baseFiltered(): SettingsUser[] {
    const q = this.searchValue.trim().toLowerCase();
    return this.users.filter(u =>
      (!this.roleFilter || u.RoleID === this.roleFilter) &&
      (!this.teamFilter || u.TeamID === this.teamFilter) &&
      (!q || `${u.Name} ${u.Email} ${u.Designation ?? ''}`.toLowerCase().includes(q)));
  }

  get filtered(): SettingsUser[] {
    const dir = this.sortColumnDir === 'asc' ? 1 : -1;
    const key = (u: SettingsUser): string => {
      switch (this.sortColumn) {
        case 'Role': return this.roleName(u.RoleID);
        case 'Status': return u.Status;
        case 'LastActive': return u.LastActive || '';
        default: return u.Name;
      }
    };
    return this.baseFiltered.filter(u => !this.statusTab || u.Status === this.statusTab)
      .sort((a, b) => key(a).localeCompare(key(b)) * dir);
  }

  get pageRows(): SettingsUser[] {
    const start = (this.currentPage - 1) * Number(this.cardsPerPage);
    return this.filtered.slice(start, start + Number(this.cardsPerPage));
  }

  get FilterRecords(): number { return this.filtered.length; }
  get totalPages(): number { return Math.ceil(this.FilterRecords / Number(this.cardsPerPage)); }
  get pageNumbers(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }
  get hasFilters(): boolean { return !!(this.searchValue || this.roleFilter || this.teamFilter); }

  roleName(id: number | null): string { return this.roles.find(r => r.ID === id)?.Name || '—'; }
  teamName(id: number | null): string { return this.teams.find(t => t.ID === id)?.Name || '—'; }

  // ---------- permissions (mirror of server rules B2 / B3, spec 003-settings-users §5) ----------

  isSelf(u: SettingsUser): boolean {
    return !!this.currentUserId && u.ID.toLowerCase() === this.currentUserId.toLowerCase();
  }

  // Role ID 1 = Super Admin (the name comes from the API; the ID never changes).
  isSuperAdminRole(roleId: number | null): boolean {
    return roleId === SUPER_ADMIN_ROLE_ID;
  }

  get isSuperAdmin(): boolean {
    const me = this.users.find(u => this.isSelf(u));
    return !!me && this.isSuperAdminRole(me.RoleID);
  }

  // Only one Super Admin exists — it is handed over with "Transfer Super Admin", never picked as a role.
  get assignableRoles(): RoleLookup[] {
    return this.roles.filter(r => !this.isSuperAdminRole(r.ID));
  }

  // Drawer list: keep Super Admin in it when the target is the Super Admin, so the (locked) value still shows.
  get editRoles(): RoleLookup[] {
    return this.editUser && this.isSuperAdminRole(this.editUser.RoleID) ? this.roles : this.assignableRoles;
  }

  // Role change / suspend / reactivate / remove: never self, and the Super Admin only by the Super Admin.
  canManage(u: SettingsUser): boolean {
    return !this.isSelf(u) && (this.isSuperAdmin || !this.isSuperAdminRole(u.RoleID));
  }

  canResetPassword(u: SettingsUser): boolean {
    return u.Status === 'Active' && (this.isSuperAdmin || !this.isSuperAdminRole(u.RoleID));
  }

  // Only the current Super Admin, only to another Active user.
  canTransferSuperAdmin(u: SettingsUser): boolean {
    return this.isSuperAdmin && !this.isSelf(u) && u.Status === 'Active' && !this.isSuperAdminRole(u.RoleID);
  }

  canReactivate(u: SettingsUser): boolean {
    return u.Status === 'Suspended' && (this.seatsFree === null || this.seatsFree > 0);
  }

  // ---------- filters / sorting / paging ----------

  onFilterChange() { this.currentPage = 1; }

  getSearchValue(event: Event) {
    this.searchValue = (event.target as HTMLInputElement).value;
    this.onFilterChange();
  }

  clearFilters() {
    this.searchValue = ''; this.roleFilter = null; this.teamFilter = null;
    this.onFilterChange();
  }

  setStatusTab(s: string) { this.statusTab = s; this.onFilterChange(); }

  orderBy(column: string) {
    this.sortColumnDir = this.sortColumn === column && this.sortColumnDir === 'asc' ? 'desc' : 'asc';
    this.sortColumn = column;
  }

  sortIcon(column: string): string {
    return this.sortColumn === column && this.sortColumnDir === 'desc'
      ? '../../assets/images/certificate/bottom-arrow.svg'
      : '../../assets/images/certificate/top-arrow.svg';
  }

  onRecordsPerPageChange() { this.currentPage = 1; }
  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }
  goToPage(p: number) { this.currentPage = p; }

  // ---------- selection ----------

  isSelectable(u: SettingsUser): boolean { return this.canManage(u); }

  toggleSelect(u: SettingsUser) {
    if (this.selected.has(u.ID)) this.selected.delete(u.ID); else this.selected.add(u.ID);
  }

  get allPageSelected(): boolean {
    const rows = this.pageRows.filter(u => this.isSelectable(u));
    return rows.length > 0 && rows.every(u => this.selected.has(u.ID));
  }

  toggleAllPage() {
    const rows = this.pageRows.filter(u => this.isSelectable(u));
    const all = this.allPageSelected;
    rows.forEach(u => all ? this.selected.delete(u.ID) : this.selected.add(u.ID));
  }

  clearSelection() { this.selected.clear(); this.bulkRoleID = null; }

  private get selectedUsers(): SettingsUser[] { return this.users.filter(u => this.selected.has(u.ID)); }
  // The API takes 1–100 IDs per bulk call.
  get overBulkLimit(): boolean { return this.selected.size > MAX_BULK; }
  get canBulkSuspend(): boolean { return !this.overBulkLimit && this.selectedUsers.some(u => u.Status === 'Active'); }
  // Only Suspended users can be reactivated (Invited are skipped by the server).
  get canBulkReactivate(): boolean {
    return !this.overBulkLimit && this.selectedUsers.some(u => u.Status === 'Suspended')
      && (this.seatsFree === null || this.seatsFree > 0);
  }

  bulkChangeRole() {
    if (!this.bulkRoleID || this.overBulkLimit || this.isSuperAdminRole(this.bulkRoleID)) return;
    const ids = [...this.selected];
    const role = this.roleName(this.bulkRoleID);
    this.notificationsService.showConfirm(`Change role of ${ids.length} user(s) to "${role}"?`).then(ok => {
      if (!ok || this.destroyed || !this.bulkRoleID) return;
      this.runAction(this.settingsService.updateUsers(ids, { RoleID: this.bulkRoleID }),
        res => this.onBulkDone(res), 'Could not change the role. Please try again.');
    });
  }

  bulkStatus(status: UserStatusPatch['Status']) {
    if (this.overBulkLimit) return;
    const ids = [...this.selected];
    const verb = status === 'Suspended' ? 'Suspend' : 'Reactivate';
    this.notificationsService.showConfirm(`${verb} ${ids.length} user(s)?`).then(ok => {
      if (!ok || this.destroyed) return;
      this.runAction(this.settingsService.updateUsers(ids, { Status: status }),
        res => this.onBulkDone(res), `Could not ${verb.toLowerCase()} the users. Please try again.`);
    });
  }

  private onBulkDone(res: BulkUserResponse): boolean {
    // Whole call rejected (e.g. Code SEAT_LIMIT): the server's sentence says what to do — show it as is.
    const text = res.Success === false && res.Message ? res.Message : this.bulkText(res);
    this.notificationsService.showNotification(res.Updated > 0 ? 'success' : 'error', text);
    this.clearSelection();
    return true;
  }

  // "2 users updated, 1 skipped. Already suspended."
  private bulkText(res: BulkUserResponse): string {
    const updated = res.Updated ?? 0;
    const skipped = res.Skipped ?? [];
    const text = `${updated} user${updated === 1 ? '' : 's'} updated`;
    if (!skipped.length) return `${text}.`;
    const reasons = [...new Set(skipped.map(s => s.Reason).filter(Boolean))].join(' ');
    return `${text}, ${skipped.length} skipped.${reasons ? ' ' + reasons : ''}`;
  }

  // ---------- row actions ----------

  onResetPassword(u: SettingsUser) {
    if (!this.canResetPassword(u)) return;
    this.notificationsService.showConfirm(`Send a password reset link to ${u.Email}?`).then(ok => {
      if (!ok || this.destroyed) return;
      this.runAction(this.settingsService.sendPasswordReset(u.ID), res => {
        this.notificationsService.showNotification('success', res.Status || `Password reset email sent to ${u.Email}`);
        // Reset token write badal deta hai user ka RowVersion — reload, warna agla drawer save false 409 dega.
        return true;
      }, 'Could not send the password reset. Please try again.');
    });
  }

  onToggleSuspend(u: SettingsUser) {
    if (!this.canManage(u) || u.Status === 'Invited') return;
    const suspend = u.Status === 'Active';
    if (!suspend && !this.canReactivate(u)) return;
    const msg = suspend ? `Suspend ${u.Name}? They will be signed out and lose access immediately.` : `Reactivate ${u.Name}?`;
    this.notificationsService.showConfirm(msg).then(ok => {
      if (!ok || this.destroyed) return;
      this.runAction(this.settingsService.updateUser(u.ID, { Status: suspend ? 'Suspended' : 'Active' }), () => {
        this.notificationsService.showNotification('success', `${u.Name} ${suspend ? 'suspended' : 'reactivated'}`);
        return true;
      }, `Could not ${suspend ? 'suspend' : 'reactivate'} ${u.Name}. Please try again.`);
    });
  }

  onTransferSuperAdmin(u: SettingsUser) {
    if (!this.canTransferSuperAdmin(u)) return;
    const msg = `Transfer Super Admin? ${u.Name} becomes Super Admin. You become Admin. Only one Super Admin can exist.`;
    this.notificationsService.showConfirm(msg).then(ok => {
      if (!ok || this.destroyed || !this.canTransferSuperAdmin(u)) return;
      this.runAction(this.settingsService.transferSuperAdmin(u.ID), res => {
        this.notificationsService.showNotification('success', res.Status || `${u.Name} is now the Super Admin.`);
        this.clearSelection();
        // My own role changed (now Admin) — reload what I may use.
        this.entitlement.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        return true;
      }, 'Could not transfer the Super Admin role. Please try again.');
    });
  }

  onRemove(u: SettingsUser) {
    if (!this.canManage(u)) return;
    this.notificationsService.showdelete(`Remove ${u.Name} (${u.Email}) from the workspace? Their tasks stay but become unassigned.`).then(ok => {
      if (!ok || this.destroyed) return;
      this.runAction(this.settingsService.removeUser(u.ID), res => {
        this.notificationsService.showNotification('success', res.Status || `${u.Name} removed`);
        this.selected.delete(u.ID);
        return true;
      }, `Could not remove ${u.Name}. Please try again.`);
    });
  }

  // ---------- edit drawer ----------

  openEdit(u: SettingsUser) {
    this.showMoreEdit = false;
    this.editUser = u;
    this.editForm.reset({
      txtName: u.Name, txtDesignation: u.Designation ?? '', drpRoleID: u.RoleID, drpTeamID: u.TeamID,
      drpDepartmentID: u.DepartmentID, txtLocation: u.Location ?? '', chkTwoFactor: u.TwoFactor
    });
    // Only the Super Admin may edit the Super Admin at all (B3) — read-only drawer for everyone else.
    if (!this.canEdit(u)) { this.editForm.disable(); return; }
    this.editForm.enable();
    // Own role is locked (B2).
    if (this.canManage(u)) this.editForm.controls['drpRoleID'].enable();
    else this.editForm.controls['drpRoleID'].disable();
    // 2-step can only be switched off here — users turn it on themselves (§5.5).
    if (u.TwoFactor) this.editForm.controls['chkTwoFactor'].enable();
    else this.editForm.controls['chkTwoFactor'].disable();
  }

  // Self may edit own details (not role); others only when canManage.
  canEdit(u: SettingsUser): boolean { return this.isSelf(u) || this.canManage(u); }

  closeEdit() { this.editUser = null; }

  onSaveEdit() {
    if (!this.editUser || !this.canEdit(this.editUser)) return;
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const v = this.editForm.getRawValue();
    const u = this.editUser;
    const request: UpdateUserRequest = {
      Name: String(v.txtName ?? '').trim(),
      Designation: this.optionalText(v.txtDesignation),
      RoleID: v.drpRoleID,
      TeamID: v.drpTeamID ?? null,
      DepartmentID: v.drpDepartmentID ?? null,
      Location: this.optionalText(v.txtLocation),
      TwoFactor: u.TwoFactor && !!v.chkTwoFactor,
      RowVersion: u.RowVersion
    };
    this.runAction(this.settingsService.updateUser(u.ID, request), res => {
      this.notificationsService.showNotification('success', res.Status || 'User updated successfully.');
      this.editUser = null;
      return true;
    }, 'Could not save the user. Please try again.', err => {
      // 409 (changed by someone else) / 404 (gone): the drawer data is stale — close it; the list reloads.
      if (err.status === 404 || err.status === 409) this.editUser = null;
    });
  }

  private optionalText(value: unknown): string | null {
    const s = String(value ?? '').trim();
    return s ? s : null;
  }

  // ---------- errors ----------

  // End the session on 401, otherwise toast the API message. (The loader is hidden by finalize.)
  // Returns true when our list is stale (404 / 409 after an action) and should be reloaded.
  private handleError(err: HttpErrorResponse, fallback: string): boolean {
    if (err.status === 401) { this.endSession(); return false; }
    this.notificationsService.showNotification('error', this.errorMessage(err, fallback));
    return err.status === 404 || err.status === 409;
  }

  // Lookups (teams / departments / seats) don't use the loader.
  private handleLookupError(err: HttpErrorResponse, message: string) {
    if (err.status === 401) { this.endSession(); return; }
    this.notificationsService.showNotification('error', err.status === 0 ? OFFLINE : message);
  }

  // Only trust the body when it is our UserActionResponse / BulkUserResponse shape (ProblemDetails is not).
  private errorMessage(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as Partial<UserActionResponse> | null;
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
  // already and navigates first — then don't navigate a second time (same as SettingsOrganizationComponent).
  private endSession() {
    this.editUser = null;
    this.photoService.clear();
    this.authService.logout();
    const current = this.router.url.split('?')[0];
    if (this.router.currentNavigation() || current.startsWith('/login')) return;
    this.router.navigate(['/login']);
  }
}
