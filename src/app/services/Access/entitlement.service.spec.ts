import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { Observable, of, throwError } from 'rxjs';
import { ACCESS_ACTIONS, ACCESS_MODULES, EntitlementService } from './entitlement.service';
import { AccessModule, ModuleAccess, MyAccess } from '../../Interface/access';

type Fetchable = { fetch: () => Observable<MyAccess> };

function makeAccess(version: string, change: (m: Record<AccessModule, ModuleAccess>) => void = () => {}): MyAccess {
  const modules = {} as Record<AccessModule, ModuleAccess>;
  ACCESS_MODULES.forEach(m => modules[m] = {
    InPlan: true, View: true, Create: false, Edit: false, Delete: false, Manage: false, AvailableIn: []
  });
  change(modules);
  return {
    UserID: 'u1', RoleID: 4, Modules: modules, Version: version,
    License: {
      State: 'Active', PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
      DaysLeft: null, ReadOnly: false, SeatsExceeded: false, Banner: null
    }
  };
}

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'token-a');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EntitlementService);
  });

  afterEach(() => localStorage.clear());

  it('calls A1 GET Access/me once and publishes the answer', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    let result: MyAccess | null = null;
    service.ensureLoaded().subscribe(a => result = a);
    service.ensureLoaded().subscribe();

    const req = httpMock.expectOne(`${environment.baseUrl}Access/me`);
    expect(req.request.method).toBe('GET');
    req.flush(makeAccess('v1'));

    expect((result as MyAccess | null)?.Version).toBe('v1');
    expect(service.current()?.Version).toBe('v1');
    expect(Object.keys(service.current()!.Modules).sort()).toEqual([...ACCESS_MODULES].sort());
    ACCESS_ACTIONS.forEach(x => expect(typeof service.current()!.Modules.Tasks[x]).toBe('boolean'));
    httpMock.verify();
  });

  it('A1 HTTP error → null, last good answer kept, next call retries', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    service.ensureLoaded().subscribe();
    httpMock.expectOne(`${environment.baseUrl}Access/me`).flush(makeAccess('v1'));

    let after: MyAccess | null | undefined;
    service.refresh().subscribe(a => after = a);
    httpMock.expectOne(`${environment.baseUrl}Access/me`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(after).toBeNull();
    expect(service.current()?.Version).toBe('v1');

    service.ensureLoaded().subscribe();
    httpMock.expectOne(`${environment.baseUrl}Access/me`).flush(makeAccess('v2'));
    expect(service.current()?.Version).toBe('v2');
    httpMock.verify();
  });

  it('refreshIfStale only refetches once the answer is old enough', () => {
    const spy = spyOn(service as unknown as Fetchable, 'fetch').and.returnValue(of(makeAccess('v1')));
    const now = spyOn(Date, 'now').and.returnValue(1_000_000);
    service.refreshIfStale(60000);               // never loaded → nothing
    expect(spy).not.toHaveBeenCalled();
    service.ensureLoaded().subscribe();
    service.refreshIfStale(60000);
    expect(spy).toHaveBeenCalledTimes(1);
    now.and.returnValue(1_061_000);
    service.refreshIfStale(60000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('parallel ensureLoaded() calls share one fetch', () => {
    const spy = spyOn(service as unknown as Fetchable, 'fetch').and.returnValue(of(makeAccess('v1')));
    service.ensureLoaded().subscribe();
    service.ensureLoaded().subscribe();
    service.ensureLoaded().subscribe();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a new token (new login) fetches again', () => {
    const spy = spyOn(service as unknown as Fetchable, 'fetch').and.returnValues(of(makeAccess('v1')), of(makeAccess('v2')));
    service.ensureLoaded().subscribe();
    localStorage.setItem('token', 'token-b');
    let version = '';
    service.ensureLoaded().subscribe(a => version = a?.Version ?? '');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(version).toBe('v2');
  });

  it('refresh() fetches again with the same token', () => {
    const spy = spyOn(service as unknown as Fetchable, 'fetch').and.returnValue(of(makeAccess('v1')));
    service.ensureLoaded().subscribe();
    service.refresh().subscribe();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('signed out → null without fetching, and the snapshot is cleared', () => {
    const spy = spyOn(service as unknown as Fetchable, 'fetch').and.returnValue(of(makeAccess('v1')));
    service.ensureLoaded().subscribe();
    localStorage.removeItem('token');
    let result: MyAccess | null | undefined;
    service.ensureLoaded().subscribe(a => result = a);
    expect(result).toBeNull();
    expect(service.current()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a failed fetch emits null and is not cached', () => {
    const spy = spyOn(service as unknown as Fetchable, 'fetch').and.returnValues(
      throwError(() => new Error('offline')), of(makeAccess('v1')));
    let first: MyAccess | null | undefined;
    service.ensureLoaded().subscribe(a => first = a);
    expect(first).toBeNull();
    let second: MyAccess | null | undefined;
    service.ensureLoaded().subscribe(a => second = a);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(second?.Version).toBe('v1');
  });

  it('can / inPlan truth table', () => {
    spyOn(service as unknown as Fetchable, 'fetch').and.returnValue(of(makeAccess('v1', m => {
      m.Workflows = { InPlan: false, View: false, Create: false, Edit: false, Delete: false, Manage: false, AvailableIn: ['Enterprise'] };
      m.Tasks = { ...m.Tasks, Edit: true };
      m.Billing = { ...m.Billing, View: false };
    })));
    expect(service.can('Tasks')).toBeFalse();          // nothing loaded yet
    expect(service.inPlan('Tasks')).toBeFalse();
    expect(service.license()).toBeNull();

    service.ensureLoaded().subscribe();

    expect(service.can('Tasks')).toBeTrue();
    expect(service.can('Tasks', 'Edit')).toBeTrue();
    expect(service.can('Tasks', 'Delete')).toBeFalse();
    expect(service.inPlan('Workflows')).toBeFalse();
    expect(service.can('Workflows')).toBeFalse();
    expect(service.inPlan('Billing')).toBeTrue();
    expect(service.can('Billing')).toBeFalse();
    expect(service.license()?.PlanCode).toBe('Pro');
  });
});
