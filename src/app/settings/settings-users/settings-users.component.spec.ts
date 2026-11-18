import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { of, throwError } from 'rxjs';

import { SettingsUsersComponent } from './settings-users.component';
import { SettingsService } from '../../services/Settings/settings.service';
import { AuthService } from '../../services/Auth/auth.service';
import { NotificationsService } from '../../services/notifications.service';
import { EntitlementService } from '../../services/Access/entitlement.service';
import { RoleLookup, SettingsUser } from '../../Interface/settings';

describe('SettingsUsersComponent', () => {
  let fixture: ComponentFixture<SettingsUsersComponent>;
  let component: SettingsUsersComponent;
  let service: jasmine.SpyObj<SettingsService>;
  let notifications: jasmine.SpyObj<NotificationsService>;
  let entitlement: jasmine.SpyObj<EntitlementService>;
  let auth: jasmine.SpyObj<AuthService>;

  const ROLES: RoleLookup[] = [
    { ID: 1, Name: 'Super Admin', Description: '', IsSystem: true, Color: '#7A3FE4', UserCount: 1 },
    { ID: 2, Name: 'Admin', Description: '', IsSystem: true, Color: '#0043E0', UserCount: 1 },
    { ID: 4, Name: 'Member', Description: '', IsSystem: true, Color: '#029848', UserCount: 2 }
  ];

  const user = (ID: string, Name: string, RoleID: number, Status: SettingsUser['Status'] = 'Active'): SettingsUser => ({
    ID, Name, Email: `${ID}@example.com`, Designation: null, RoleID, TeamID: null, DepartmentID: null, Location: null,
    Status, LastActive: null, TwoFactor: false, JoinedOn: '2026-01-01', RowVersion: 'AA'
  });

  const USERS: SettingsUser[] = [
    user('me', 'Aarav Sharma', 1),
    user('admin', 'Priya Verma', 2),
    user('member', 'Rohit Mehta', 4),
    user('invited', 'Meera Nair', 4, 'Invited')
  ];

  const start = (meId: string) => {
    auth.getUserId.and.returnValue(meId);
    fixture = TestBed.createComponent(SettingsUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const byId = (id: string) => component.users.find(u => u.ID === id)!;

  beforeEach(async () => {
    service = jasmine.createSpyObj<SettingsService>('SettingsService', [
      'getTeams', 'getDepartments', 'getRoleLookup', 'getUsers', 'getSeats', 'updateUser', 'updateUsers',
      'sendPasswordReset', 'removeUser', 'transferSuperAdmin'
    ]);
    service.getTeams.and.returnValue(of([]));
    service.getDepartments.and.returnValue(of([]));
    service.getRoleLookup.and.callFake(() => of(ROLES));
    service.getUsers.and.callFake(() => of(USERS));
    service.getSeats.and.returnValue(of({ Seats: 10, SeatsUsed: 4 }));
    notifications = jasmine.createSpyObj<NotificationsService>('NotificationsService',
      ['showNotification', 'showConfirm', 'showdelete']);
    entitlement = jasmine.createSpyObj<EntitlementService>('EntitlementService', ['ensureLoaded', 'refresh', 'can'],
      { access$: of(null) });
    entitlement.ensureLoaded.and.returnValue(of(null));
    entitlement.refresh.and.returnValue(of(null));
    entitlement.can.and.returnValue(false);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getUserId', 'logout', 'getToken']);
    auth.getToken.and.returnValue(null);

    await TestBed.configureTestingModule({
      declarations: [SettingsUsersComponent],
      imports: [FormsModule, ReactiveFormsModule, NgSelectModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: service },
        { provide: NotificationsService, useValue: notifications },
        { provide: EntitlementService, useValue: entitlement },
        { provide: AuthService, useValue: auth }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('should create and load users with roles', () => {
    start('me');
    expect(component).toBeTruthy();
    expect(component.users.length).toBe(4);
    expect(component.roleName(1)).toBe('Super Admin');
  });

  it('Super Admin is never offered in role dropdowns, also not to the Super Admin', () => {
    start('me');
    expect(component.isSuperAdmin).toBeTrue();
    expect(component.assignableRoles.map(r => r.ID)).toEqual([2, 4]);

    component.openEdit(byId('member'));
    expect(component.editRoles.map(r => r.ID)).toEqual([2, 4]);
  });

  it('bulk change role ignores Super Admin as target', () => {
    start('me');
    component.selected.add('member');
    component.bulkRoleID = 1;
    component.bulkChangeRole();
    expect(notifications.showConfirm).not.toHaveBeenCalled();
    expect(service.updateUsers).not.toHaveBeenCalled();
  });

  it('Transfer Super Admin is offered by the Super Admin on other Active users only', () => {
    start('me');
    fixture.detectChanges();
    expect(component.canTransferSuperAdmin(byId('admin'))).toBeTrue();
    expect(component.canTransferSuperAdmin(byId('member'))).toBeTrue();
    expect(component.canTransferSuperAdmin(byId('me'))).toBeFalse();
    expect(component.canTransferSuperAdmin(byId('invited'))).toBeFalse();

    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.dropdown-item'))
      .filter(b => b.textContent?.includes('Transfer Super Admin'));
    expect(items.length).toBe(2);
  });

  it('Transfer Super Admin is hidden for everyone else (Admin), and the Super Admin row is locked', () => {
    start('admin');
    fixture.detectChanges();
    expect(component.isSuperAdmin).toBeFalse();
    USERS.forEach(u => expect(component.canTransferSuperAdmin(u)).toBeFalse());
    expect(component.canManage(byId('me'))).toBeFalse();
    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.dropdown-item'))
      .filter(b => b.textContent?.includes('Transfer Super Admin'));
    expect(items.length).toBe(0);
  });

  it('confirmed transfer calls the API, toasts the Message, reloads users and refreshes access', async () => {
    start('me');
    notifications.showConfirm.and.resolveTo(true);
    const done = 'Priya Verma is now the Super Admin. You are now an Admin.';
    service.transferSuperAdmin.and.returnValue(of({ Status: done }));
    service.getUsers.calls.reset();

    component.onTransferSuperAdmin(byId('admin'));
    await fixture.whenStable();

    expect(notifications.showConfirm).toHaveBeenCalledWith(
      'Transfer Super Admin? Priya Verma becomes Super Admin. You become Admin. Only one Super Admin can exist.');
    expect(service.transferSuperAdmin).toHaveBeenCalledWith('admin');
    expect(notifications.showNotification).toHaveBeenCalledWith('success', done);
    expect(service.getUsers).toHaveBeenCalledTimes(1);
    expect(entitlement.refresh).toHaveBeenCalledTimes(1);
  });

  it('cancelled transfer does nothing', async () => {
    start('me');
    notifications.showConfirm.and.resolveTo(false);
    component.onTransferSuperAdmin(byId('admin'));
    await fixture.whenStable();
    expect(service.transferSuperAdmin).not.toHaveBeenCalled();
  });

  it('a failed transfer shows the server message and does not refresh access', async () => {
    start('me');
    notifications.showConfirm.and.resolveTo(true);
    service.transferSuperAdmin.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { Success: false, Message: 'The Super Admin role can only be handed over to an active user.', Errors: null }
    })));

    component.onTransferSuperAdmin(byId('admin'));
    await fixture.whenStable();

    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'The Super Admin role can only be handed over to an active user.');
    expect(entitlement.refresh).not.toHaveBeenCalled();
  });

  it('a 401 on transfer ends the session', async () => {
    start('me');
    notifications.showConfirm.and.resolveTo(true);
    service.transferSuperAdmin.and.returnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    component.onTransferSuperAdmin(byId('admin'));
    await fixture.whenStable();

    expect(auth.logout).toHaveBeenCalled();
  });
});
