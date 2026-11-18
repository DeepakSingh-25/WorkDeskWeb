import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of } from 'rxjs';
import { moduleGuard } from './module.guard';
import { ACCESS_MODULES, EntitlementService } from '../services/Access/entitlement.service';
import { AccessAction, AccessModule, LicenseState, ModuleAccess, MyAccess } from '../Interface/access';

function makeAccess(state: LicenseState = 'Active', change: (m: Record<AccessModule, ModuleAccess>) => void = () => {}): MyAccess {
  const modules = {} as Record<AccessModule, ModuleAccess>;
  ACCESS_MODULES.forEach(m => modules[m] = {
    InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: []
  });
  change(modules);
  return {
    UserID: 'u1', RoleID: 4, Modules: modules, Version: 'v1',
    License: {
      State: state, PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
      DaysLeft: null, ReadOnly: state === 'Expired', SeatsExceeded: false, Banner: null
    }
  };
}

const none = (inPlan: boolean, availableIn: string[] = []): ModuleAccess => ({
  InPlan: inPlan, View: false, Create: false, Edit: false, Delete: false, Manage: false, AvailableIn: availableIn
});

describe('moduleGuard', () => {
  let entitlement: jasmine.SpyObj<EntitlementService>;

  const run = async (module: AccessModule, action?: AccessAction): Promise<boolean | string> => {
    const result = TestBed.runInInjectionContext(() =>
      moduleGuard(module, action)({} as ActivatedRouteSnapshot, { url: '/x' } as RouterStateSnapshot));
    const value = isObservable(result) ? await firstValueFrom(result as Observable<boolean | UrlTree>) : result;
    return value instanceof UrlTree ? TestBed.inject(Router).serializeUrl(value) : value as boolean;
  };

  beforeEach(() => {
    entitlement = jasmine.createSpyObj<EntitlementService>('EntitlementService', ['ensureLoaded']);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: EntitlementService, useValue: entitlement }]
    });
  });

  it('allows when the module and action are allowed', async () => {
    entitlement.ensureLoaded.and.returnValue(of(makeAccess()));
    expect(await run('Agile')).toBeTrue();
    expect(await run('Agile', 'Delete')).toBeTrue();
  });

  it('module not in plan → reason=plan', async () => {
    entitlement.ensureLoaded.and.returnValue(of(makeAccess('Active', m => m.Workflows = none(false, ['Enterprise']))));
    expect(await run('Workflows')).toBe('/accessdenied?module=Workflows&reason=plan');
  });

  it('in plan but the role lacks the action → reason=role', async () => {
    entitlement.ensureLoaded.and.returnValue(of(makeAccess('Active', m => m.Agile = { ...m.Agile, Edit: false })));
    expect(await run('Agile')).toBeTrue();
    expect(await run('Agile', 'Edit')).toBe('/accessdenied?module=Agile&reason=role');
  });

  it('always-on modules never report plan / license', async () => {
    entitlement.ensureLoaded.and.returnValue(of(makeAccess('Unlicensed', m => m.Billing = none(true))));
    expect(await run('Billing')).toBe('/accessdenied?module=Billing&reason=role');
  });

  it('no valid license → reason=license', async () => {
    entitlement.ensureLoaded.and.returnValue(of(makeAccess('Unlicensed', m => m.Projects = none(false))));
    expect(await run('Projects')).toBe('/accessdenied?module=Projects&reason=license');
  });

  it('expired (read-only) license blocks writes with reason=license', async () => {
    entitlement.ensureLoaded.and.returnValue(of(makeAccess('Expired', m => m.Tasks = { ...m.Tasks, Create: false })));
    expect(await run('Tasks', 'Create')).toBe('/accessdenied?module=Tasks&reason=license');
  });

  it('A1 failed (null) → reason=error', async () => {
    entitlement.ensureLoaded.and.returnValue(of(null));
    expect(await run('Reports')).toBe('/accessdenied?module=Reports&reason=error');
  });

  it('A1 failed never locks out the always-on Billing / Settings', async () => {
    entitlement.ensureLoaded.and.returnValue(of(null));
    expect(await run('Billing')).toBeTrue();
    expect(await run('Settings', 'Manage')).toBeTrue();
  });
});
