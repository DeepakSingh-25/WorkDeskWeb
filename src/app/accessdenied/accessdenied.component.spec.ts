import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AccessdeniedComponent } from './accessdenied.component';
import { AuthService } from '../services/Auth/auth.service';
import { ACCESS_MODULES, EntitlementService } from '../services/Access/entitlement.service';
import { AccessModule, LicenseState, ModuleAccess, MyAccess } from '../Interface/access';

function makeAccess(state: LicenseState = 'Active', billingView = true): MyAccess {
  const modules = {} as Record<AccessModule, ModuleAccess>;
  ACCESS_MODULES.forEach(m => modules[m] = {
    InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: []
  });
  modules.Workflows = { InPlan: false, View: false, Create: false, Edit: false, Delete: false, Manage: false, AvailableIn: ['Enterprise'] };
  modules.Billing = { ...modules.Billing, View: billingView };
  return {
    UserID: 'u1', RoleID: 2, Modules: modules, Version: 'v1',
    License: {
      State: state, PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
      DaysLeft: null, ReadOnly: state === 'Expired', SeatsExceeded: false, Banner: null
    }
  };
}

describe('AccessdeniedComponent', () => {
  let component: AccessdeniedComponent;
  let fixture: ComponentFixture<AccessdeniedComponent>;
  let auth: jasmine.SpyObj<AuthService>;
  let entitlement: jasmine.SpyObj<EntitlementService>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map(b => b.textContent?.trim());

  const setup = async (query: Record<string, string>, access: MyAccess | null = makeAccess(), loggedIn = true) => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn']);
    auth.isLoggedIn.and.returnValue(loggedIn);
    entitlement = jasmine.createSpyObj<EntitlementService>('EntitlementService', ['ensureLoaded', 'refresh', 'current']);
    entitlement.ensureLoaded.and.returnValue(of(access));
    entitlement.refresh.and.returnValue(of(access));
    entitlement.current.and.returnValue(null);

    await TestBed.configureTestingModule({
      declarations: [AccessdeniedComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
        { provide: AuthService, useValue: auth },
        { provide: EntitlementService, useValue: entitlement }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AccessdeniedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('should create (generic text without a reason)', async () => {
    await setup({});
    expect(component).toBeTruthy();
    expect(text()).toContain('Access Denied !');
    expect(buttons()).toContain('Go to dashboard');
  });

  it('signed-out visitor gets the Login button', async () => {
    await setup({}, null, false);
    expect(buttons()).toContain('Login');
    expect(buttons()).not.toContain('Go to dashboard');
    expect(entitlement.ensureLoaded).not.toHaveBeenCalled();
  });

  it('reason=plan shows the upgrade text, plan name, Available in and the billing button', async () => {
    await setup({ reason: 'plan', module: 'Workflows' });
    expect(text()).toContain('Upgrade your plan');
    expect(text()).toContain('Workflows is not included in your plan Pro');
    expect(text()).toContain('Available in: Enterprise');
    expect(buttons()).toContain('View plan & license');
  });

  it('reason=plan without Billing.View asks the administrator instead', async () => {
    await setup({ reason: 'plan', module: 'Workflows' }, makeAccess('Active', false));
    expect(buttons()).not.toContain('View plan & license');
    expect(text()).toContain('Ask your administrator to upgrade the plan');
  });

  it('reason=license with an expired license says read-only', async () => {
    await setup({ reason: 'license', module: 'Tasks' }, makeAccess('Expired'));
    expect(text()).toContain('Your license has expired');
    expect(text()).toContain('read-only');
  });

  it('reason=role names the module', async () => {
    await setup({ reason: 'role', module: 'Agile' });
    expect(text()).toContain("You don't have access to Agile");
    expect(buttons()).not.toContain('View plan & license');
  });

  it('reason=error offers Try again, which refreshes and goes back to the module', async () => {
    await setup({ reason: 'error', module: 'Reports' });
    expect(text()).toContain("We couldn't check your access to Reports");
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    component.onRetry();

    expect(entitlement.refresh).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('/reports');
  });

  it('unknown query values are ignored (no text from the URL)', async () => {
    await setup({ reason: 'hack', module: '<b>evil</b>' });
    expect(component.reason).toBeNull();
    expect(component.module).toBeNull();
    expect(text()).toContain('Access Denied !');
  });
});
