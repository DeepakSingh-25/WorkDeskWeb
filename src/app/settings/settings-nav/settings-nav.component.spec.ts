import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { SettingsNavComponent, canManagePeople } from './settings-nav.component';
import { ACCESS_MODULES, EntitlementService } from '../../services/Access/entitlement.service';
import { AuthService } from '../../services/Auth/auth.service';
import { AccessModule, ModuleAccess, MyAccess } from '../../Interface/access';

function makeAccess(roleId: number | null, change: (m: Record<AccessModule, ModuleAccess>) => void = () => {}): MyAccess {
  const modules = {} as Record<AccessModule, ModuleAccess>;
  ACCESS_MODULES.forEach(m => modules[m] = {
    InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: []
  });
  change(modules);
  return {
    UserID: 'u1', RoleID: roleId, Modules: modules, Version: 'v1',
    License: {
      State: 'Active', PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
      DaysLeft: null, ReadOnly: false, SeatsExceeded: false, Banner: null
    }
  };
}

const noSettingsManage = (m: Record<AccessModule, ModuleAccess>) => m.Settings = { ...m.Settings, Manage: false };

describe('SettingsNavComponent', () => {
  let fixture: ComponentFixture<SettingsNavComponent>;
  let component: SettingsNavComponent;
  let http: HttpTestingController;
  let entitlement: EntitlementService;

  const titles = () => component.groups.map(g => g.Title);
  const flushAccess = (access: MyAccess) =>
    http.expectOne(r => r.url.endsWith('Access/me')).flush(access);

  beforeEach(async () => {
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getToken']);
    auth.getToken.and.returnValue('token-1');

    await TestBed.configureTestingModule({
      declarations: [SettingsNavComponent],
      imports: [FontAwesomeModule, RouterModule.forRoot([])],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: auth }]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    entitlement = TestBed.inject(EntitlementService);
    fixture = TestBed.createComponent(SettingsNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('unknown access (not loaded yet) shows Users / Roles', () => {
    expect(titles()).toContain('People & Access');
    flushAccess(makeAccess(4));
  });

  it('A1 failed → still shows Users / Roles (the API answers 403)', () => {
    http.expectOne(r => r.url.endsWith('Access/me')).flush(null, { status: 500, statusText: 'Server Error' });
    expect(entitlement.current()).toBeNull();
    expect(titles()).toContain('People & Access');
  });

  it('Settings.Manage → shows Users / Roles, even for a custom (non Super Admin/Admin) role', () => {
    flushAccess(makeAccess(7));
    expect(titles()).toEqual(['Workspace', 'People & Access', 'Billing']);
  });

  it('no Settings.Manage → hides Users / Roles, even for the Admin role ID', () => {
    flushAccess(makeAccess(2, noSettingsManage));
    expect(titles()).toEqual(['Workspace', 'Billing']);
  });

  it('canManagePeople follows the Settings.Manage cell, not the role ID', () => {
    flushAccess(makeAccess(1, noSettingsManage));
    expect(canManagePeople(entitlement)).toBeFalse();
    entitlement.refresh().subscribe();
    flushAccess(makeAccess(null));
    expect(canManagePeople(entitlement)).toBeTrue();
  });
});
