import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';
import { EntitlementService } from '../services/Access/entitlement.service';

describe('AuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.setItem('token', 'abc');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('token');
  });

  it('adds the bearer token to API requests', () => {
    http.get(`${environment.baseUrl}Profile`).subscribe();
    const req = httpMock.expectOne(`${environment.baseUrl}Profile`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    req.flush({});
  });

  it('never sends the token to other hosts', () => {
    http.get('https://example.com/data').subscribe();
    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('logs out and goes to /login on 401, and still passes the error on', () => {
    spyOn(router, 'navigate').and.resolveTo(true);
    let errorStatus = 0;
    http.get(`${environment.baseUrl}Profile`).subscribe({ error: e => (errorStatus = e.status) });
    httpMock.expectOne(`${environment.baseUrl}Profile`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(errorStatus).toBe(401);
    expect(localStorage.getItem('token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('403 with a plan / license Code refreshes entitlements exactly once and rethrows', () => {
    const entitlement = TestBed.inject(EntitlementService);
    const refresh = spyOn(entitlement, 'refresh').and.returnValue(of(null));
    let errorStatus = 0;
    http.get(`${environment.baseUrl}Workflows`).subscribe({ error: e => (errorStatus = e.status) });
    httpMock.expectOne(`${environment.baseUrl}Workflows`).flush(
      { Success: false, Message: 'Workflows is not included in your plan.', Errors: null, Code: 'MODULE_NOT_IN_PLAN',
        Module: 'Workflows', Action: 'View', UpgradeRequired: true, AvailableIn: ['Enterprise'] },
      { status: 403, statusText: 'Forbidden' });

    expect(errorStatus).toBe(403);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBe('abc');
  });

  it('403 NO_PERMISSION (or no Code) does not refresh entitlements', () => {
    const refresh = spyOn(TestBed.inject(EntitlementService), 'refresh').and.returnValue(of(null));
    http.get(`${environment.baseUrl}Users`).subscribe({ error: () => {} });
    httpMock.expectOne(`${environment.baseUrl}Users`).flush({ Success: false, Code: 'NO_PERMISSION' }, { status: 403, statusText: 'Forbidden' });
    http.get(`${environment.baseUrl}Roles`).subscribe({ error: () => {} });
    httpMock.expectOne(`${environment.baseUrl}Roles`).flush({ Success: false, Message: 'x', Errors: null }, { status: 403, statusText: 'Forbidden' });
    expect(refresh).not.toHaveBeenCalled();
  });
});
