import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';

// exp seconds mein; signature check frontend par nahi hota, isliye dummy chalega
function fakeJwt(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ sub: '1', exp: expSeconds }));
  return `x.${payload}.y`;
}

describe('authGuard', () => {
  const run = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    );

  beforeEach(() => {
    localStorage.removeItem('token');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.removeItem('token'));

  it('allows a valid token', () => {
    localStorage.setItem('token', fakeJwt(Date.now() / 1000 + 3600));
    expect(run('/projects')).toBeTrue();
  });

  it('redirects to /login when there is no token', () => {
    const result = run('/projects/5') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login');
  });

  it('clears an expired token and redirects', () => {
    localStorage.setItem('token', fakeJwt(Date.now() / 1000 - 10));
    expect(run('/tasks')).toBeInstanceOf(UrlTree);
    expect(localStorage.getItem('token')).toBeNull();
  });
});
