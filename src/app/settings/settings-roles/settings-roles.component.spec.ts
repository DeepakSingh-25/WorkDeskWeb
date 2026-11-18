import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { MANAGE_PEOPLE_HINT, SettingsRolesComponent } from './settings-roles.component';
import { PERM_ACTIONS, PERM_MODULES, SettingsService } from '../../services/Settings/settings.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { PermissionSet, Role } from '../../Interface/settings';
import { ACCESS_MODULES, EntitlementService } from '../../services/Access/entitlement.service';
import { AccessModule, ModuleAccess, MyAccess } from '../../Interface/access';

describe('SettingsRolesComponent', () => {
  let fixture: ComponentFixture<SettingsRolesComponent>;
  let component: SettingsRolesComponent;
  let service: jasmine.SpyObj<SettingsService>;
  let notifications: jasmine.SpyObj<NotificationsService>;
  let loader: LoaderService;
  let hideSpy: jasmine.Spy;

  const matrix = (): PermissionSet => {
    const set: PermissionSet = {};
    PERM_MODULES.forEach(m => set[m] = { View: false, Create: false, Edit: false, Delete: false, Manage: false });
    return set;
  };

  const makeRoles = (): Role[] => [
    { ID: 1, Name: 'Super Admin', Description: 'All', IsSystem: true, Color: '#7A3FE4', Permissions: matrix(), UserCount: 1, RowVersion: 'AA' },
    { ID: 6, Name: 'QA Reviewer', Description: 'QA', IsSystem: false, Color: '#C77800', Permissions: matrix(), UserCount: 2, RowVersion: 'BB' }
  ];

  const httpError = (status: number, body: unknown = null) => new HttpErrorResponse({ status, error: body });

  const adminRole = (over: Partial<Role> = {}): Role => ({
    ID: 2, Name: 'Admin', Description: 'Admin', IsSystem: true, Color: '#0043E0', Permissions: matrix(), UserCount: 3, RowVersion: 'CC', ...over
  });

  const accessFor = (roleId: number | null): MyAccess => {
    const modules = {} as Record<AccessModule, ModuleAccess>;
    ACCESS_MODULES.forEach(m => modules[m] = { InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: [] });
    return {
      UserID: 'u1', RoleID: roleId, Modules: modules, Version: 'v1',
      License: { State: 'Active', PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
        DaysLeft: null, ReadOnly: false, SeatsExceeded: false, Banner: null }
    };
  };

  const lockNoteText = () => (fixture.nativeElement as HTMLElement).querySelector('.lock-note')?.textContent ?? '';

  beforeEach(async () => {
    service = jasmine.createSpyObj<SettingsService>('SettingsService', ['getRoles', 'saveRole', 'deleteRole']);
    service.getRoles.and.callFake(() => of(makeRoles()));
    notifications = jasmine.createSpyObj<NotificationsService>('NotificationsService',
      ['showNotification', 'showConfirm', 'showdelete']);

    await TestBed.configureTestingModule({
      declarations: [SettingsRolesComponent],
      imports: [FormsModule, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: service },
        { provide: NotificationsService, useValue: notifications }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    loader = TestBed.inject(LoaderService);
    hideSpy = spyOn(loader, 'hideLoader').and.callThrough();
    fixture = TestBed.createComponent(SettingsRolesComponent);
    component = fixture.componentInstance;
  });

  it('should create and load roles, selecting the first', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(service.getRoles).toHaveBeenCalledTimes(1);
    expect(component.roles.length).toBe(2);
    expect(component.selectedId).toBe(1);
    expect(hideSpy).toHaveBeenCalled();
  });

  it('toggle: any action implies View, and clearing View clears the row', () => {
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);
    expect(component.locked).toBeFalse();

    component.toggle('Tasks', 'Delete');
    expect(component.has('Tasks', 'Delete')).toBeTrue();
    expect(component.has('Tasks', 'View')).toBeTrue();

    component.toggle('Tasks', 'View');
    PERM_ACTIONS.forEach(a => expect(component.has('Tasks', a)).toBeFalse());
  });

  it('toggle does nothing on a system (locked) role', () => {
    fixture.detectChanges();
    expect(component.locked).toBeTrue();
    component.toggle('Tasks', 'View');
    expect(component.has('Tasks', 'View')).toBeFalse();
  });

  it('the Super Admin role is never editable, even when the API says CanEdit', () => {
    service.getRoles.and.callFake(() => of(makeRoles().map(r => ({ ...r, CanEdit: true }))));
    spyOn(TestBed.inject(EntitlementService), 'current').and.returnValue(accessFor(1));
    fixture.detectChanges();

    expect(component.selectedId).toBe(1);
    expect(component.locked).toBeTrue();
    expect(component.lockNote).toBe('Super Admin always has every permission.');
    expect(lockNoteText()).toContain('Super Admin always has every permission.');
  });

  it('CanEdit true on a built-in role: matrix editable, name stays locked, no Delete in the menu', () => {
    service.getRoles.and.callFake(() => of([...makeRoles(), adminRole({ CanEdit: true })]));
    fixture.detectChanges();
    component.onSelectRole(component.roles[2]);
    fixture.detectChanges();

    expect(component.locked).toBeFalse();
    expect(component.canRename).toBeFalse();
    component.toggle('Tasks', 'Edit');
    expect(component.has('Tasks', 'Edit')).toBeTrue();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.lock-note')).toBeNull();
    expect(el.querySelector('input[aria-label="Role name"]')).toBeNull();
    const menus = Array.from(el.querySelectorAll('.role-item')).map(i => i.textContent ?? '');
    expect(menus[2]).not.toContain('Delete');
    expect(menus[1]).toContain('Delete');

    service.saveRole.and.returnValue(of({ Status: 'Role updated successfully.', ID: 2 }));
    component.onSave();
    const sent = service.saveRole.calls.mostRecent().args[0];
    expect(sent.ID).toBe(2);
    expect(sent.Name).toBe('Admin');
    expect(sent.Permissions['Tasks'].Edit).toBeTrue();
  });

  it('CanEdit false on a built-in role: locked with the "Only the Super Admin" note', () => {
    service.getRoles.and.callFake(() => of([...makeRoles(), adminRole({ CanEdit: false })]));
    spyOn(TestBed.inject(EntitlementService), 'current').and.returnValue(accessFor(1));
    fixture.detectChanges();
    component.onSelectRole(component.roles[2]);
    fixture.detectChanges();

    expect(component.locked).toBeTrue();
    expect(lockNoteText()).toContain('Only the Super Admin can change built-in roles.');
    component.toggle('Tasks', 'View');
    expect(component.has('Tasks', 'View')).toBeFalse();
  });

  it('without CanEdit (older API): built-in roles 2–5 are editable only for the Super Admin', () => {
    service.getRoles.and.callFake(() => of([...makeRoles(), adminRole()]));
    const current = spyOn(TestBed.inject(EntitlementService), 'current').and.returnValue(accessFor(2));
    fixture.detectChanges();
    component.onSelectRole(component.roles[2]);

    expect(component.locked).toBeTrue();
    expect(component.lockNote).toBe('Only the Super Admin can change built-in roles.');
    expect(component.canEditRole(component.roles[1])).toBeTrue();     // custom role stays editable

    current.and.returnValue(accessFor(1));
    expect(component.locked).toBeFalse();
    expect(component.canEditRole(component.roles[0])).toBeFalse();    // Super Admin role: never

    current.and.returnValue(null);
    expect(component.locked).toBeTrue();                              // A1 not loaded → locked
  });

  it('CanEdit false on a custom role locks it', () => {
    service.getRoles.and.callFake(() => of(makeRoles().map(r => ({ ...r, CanEdit: r.ID === 6 ? false : undefined }))));
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);
    expect(component.locked).toBeTrue();
    expect(component.lockNote).toBe("You can't change this role.");
  });

  it('dirty ignores RowVersion but notices permission changes', () => {
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);
    expect(component.dirty).toBeFalse();

    component.working!.RowVersion = 'CHANGED';
    expect(component.dirty).toBeFalse();

    component.toggle('Projects', 'View');
    expect(component.dirty).toBeTrue();
  });

  it('a 409 on save shows the server message and reloads the list, keeping the role selected', () => {
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);
    component.toggle('Projects', 'View');
    service.getRoles.calls.reset();
    service.saveRole.and.returnValue(throwError(() => httpError(409, {
      Success: false, Message: 'This role was changed by someone else. Reload and try again.', ID: null, Errors: null
    })));

    component.onSave();

    expect(service.saveRole).toHaveBeenCalledTimes(1);
    expect(notifications.showNotification).toHaveBeenCalledWith('error',
      'This role was changed by someone else. Reload and try again.');
    expect(service.getRoles).toHaveBeenCalledTimes(1);
    expect(component.selectedId).toBe(6);
    expect(component.dirty).toBeFalse();   // stale edits are discarded
  });

  it('a failing load hides the loader and leaves the list empty (403 toast)', () => {
    service.getRoles.and.returnValue(throwError(() => httpError(403, { Success: false, Message: '' })));
    fixture.detectChanges();

    expect(component.roles).toEqual([]);
    expect(component.working).toBeNull();
    expect(hideSpy).toHaveBeenCalled();
    expect(notifications.showNotification).toHaveBeenCalledWith('error', "You don't have permission to manage roles.");
  });

  it('an offline load (status 0) shows the offline text', () => {
    service.getRoles.and.returnValue(throwError(() => httpError(0)));
    fixture.detectChanges();

    expect(notifications.showNotification).toHaveBeenCalledWith('error',
      'Could not reach the server. Check your connection and try again.');
    expect(hideSpy).toHaveBeenCalled();
  });

  it('create error keeps the drawer open, shows the Name error and does not reload', () => {
    fixture.detectChanges();
    component.openCreate();
    expect(component.showCreate).toBeTrue();
    component.createForm.patchValue({ txtName: 'Brand New' });
    service.getRoles.calls.reset();
    service.saveRole.and.returnValue(throwError(() => httpError(400, {
      Success: false, Message: 'Please fix the highlighted fields.', ID: null,
      Errors: { Name: ['A role with this name already exists.'] }
    })));

    component.onCreate();

    expect(component.showCreate).toBeTrue();
    expect(notifications.showNotification).toHaveBeenCalledWith('error',
      'Please fix the highlighted fields. A role with this name already exists.');
    expect(service.getRoles).not.toHaveBeenCalled();
  });

  it('create success closes the drawer and reloads with the new ID', () => {
    fixture.detectChanges();
    component.openCreate();
    component.createForm.patchValue({ txtName: 'Brand New' });
    service.getRoles.calls.reset();
    service.saveRole.and.returnValue(of({ Status: 'Role added successfully.', ID: 6 }));

    component.onCreate();

    const sent = service.saveRole.calls.mostRecent().args[0];
    expect(sent.ID).toBe(0);
    expect(sent.Name).toBe('Brand New');
    expect(component.showCreate).toBeFalse();
    expect(service.getRoles).toHaveBeenCalledTimes(1);
  });

  it('delete 404 reloads the list', async () => {
    fixture.detectChanges();
    notifications.showdelete.and.resolveTo(true);
    service.deleteRole.and.returnValue(throwError(() => httpError(404, {
      Success: false, Message: 'Role not found.', ID: null, Errors: null
    })));
    service.getRoles.calls.reset();

    component.onDelete(component.roles[1]);
    await fixture.whenStable();

    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Role not found.');
    expect(service.getRoles).toHaveBeenCalledTimes(1);
  });

  it('a role without a Workspace row (older API) gets an empty one; save sends all 9 modules', () => {
    service.getRoles.and.callFake(() => of(makeRoles().map(r => {
      const { Workspace, ...rest } = r.Permissions;
      return { ...r, Permissions: rest };
    })));
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);
    expect(component.dirty).toBeFalse();
    expect(component.has('Workspace', 'View')).toBeFalse();

    component.toggle('Workspace', 'Edit');
    service.saveRole.and.returnValue(of({ Status: 'ok', ID: 6 }));
    component.onSave();

    const sent = service.saveRole.calls.mostRecent().args[0];
    expect(Object.keys(sent.Permissions).length).toBe(9);
    expect(sent.Permissions['Workspace'].Edit).toBeTrue();
  });

  it('a module not in the plan is greyed: toggles are ignored and its stored values are sent back unchanged', () => {
    const modules = {} as Record<AccessModule, ModuleAccess>;
    ACCESS_MODULES.forEach(m => modules[m] = { InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: [] });
    modules.Workflows = { InPlan: false, View: false, Create: false, Edit: false, Delete: false, Manage: false, AvailableIn: ['Enterprise'] };
    const access: MyAccess = {
      UserID: 'u1', RoleID: 1, Modules: modules, Version: 'v1',
      License: { State: 'Active', PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
        DaysLeft: null, ReadOnly: false, SeatsExceeded: false, Banner: null }
    };
    spyOn(TestBed.inject(EntitlementService), 'current').and.returnValue(access);
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);

    expect(component.planLocked('Workflows')).toBeTrue();
    expect(component.planLocked('Tasks')).toBeFalse();
    expect(component.planHint('Workflows')).toBe('Available in Enterprise');

    component.toggle('Workflows', 'View');
    component.toggleRow('Workflows');
    component.toggleCol('View');
    expect(component.has('Workflows', 'View')).toBeFalse();
    expect(component.has('Tasks', 'View')).toBeTrue();
    expect(component.colAll('View')).toBeTrue();       // the locked row doesn't count

    fixture.detectChanges();
    const row = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.not-in-plan'));
    expect(row.length).toBe(1);
    expect(row[0].textContent).toContain('Not in plan');

    service.saveRole.and.returnValue(of({ Status: 'ok', ID: 6 }));
    component.onSave();
    const sent = service.saveRole.calls.mostRecent().args[0];
    expect(sent.Permissions['Workflows']).toEqual({ View: false, Create: false, Edit: false, Delete: false, Manage: false });
  });

  it('the loader is hidden after a failed save (no stale spinner)', () => {
    fixture.detectChanges();
    component.onSelectRole(component.roles[1]);
    hideSpy.calls.reset();
    const failing: Observable<{ Status: string; ID: number }> = throwError(() => httpError(500));
    service.saveRole.and.returnValue(failing);

    component.onSave();

    expect(hideSpy).toHaveBeenCalled();
    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Could not save the role. Please try again.');
  });

  it('the Settings row explains that Manage = users & roles (note, row tooltip, cell tooltip)', () => {
    fixture.detectChanges();
    expect(component.rowNote('Settings')).toBe(MANAGE_PEOPLE_HINT);
    expect(component.rowNote('Tasks')).toBeNull();
    expect(component.moduleHints['Settings']).toContain(MANAGE_PEOPLE_HINT);
    expect(component.cellHint('Settings', 'Manage')).toContain('users');
    expect(component.cellHint('Settings', 'Edit')).toBeNull();
    expect(component.cellHint('Tasks', 'Manage')).toBeNull();

    const el = fixture.nativeElement as HTMLElement;
    const notes = Array.from(el.querySelectorAll('.perm-table .row-note')).map(n => n.textContent?.trim());
    expect(notes).toEqual([MANAGE_PEOPLE_HINT]);
    const cell = el.querySelector('input[aria-label^="Settings Manage"]')?.closest('td');
    expect(cell?.getAttribute('title')).toBe(component.cellHint('Settings', 'Manage'));
    expect(el.querySelector('input[aria-label="Tasks Manage"]')?.closest('td')?.hasAttribute('title')).toBeFalse();
  });
});
