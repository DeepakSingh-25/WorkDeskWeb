import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { ChangePasswordRequest } from '../../Interface/auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const CHANGE_PASSWORD_URL = `${environment.baseUrl}Auth/change-password`;
  const REQUEST: ChangePasswordRequest = {
    CurrentPassword: 'OldPass@123',
    NewPassword: 'NewPass@456',
    ConfirmPassword: 'NewPass@456',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should POST the request to Auth/change-password with the bearer token', () => {
    localStorage.setItem('token', 'test-token');
    let message: string | undefined;

    service.changePassword(REQUEST).subscribe(res => message = res.Message);

    const req = httpMock.expectOne(CHANGE_PASSWORD_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(REQUEST);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush({ Success: true, Message: 'Password changed successfully. Please log in again.', Errors: null });

    expect(message).toBe('Password changed successfully. Please log in again.');
  });

  it('should not send an Authorization header when there is no token', () => {
    service.changePassword(REQUEST).subscribe();

    const req = httpMock.expectOne(CHANGE_PASSWORD_URL);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ Success: true, Message: 'ok', Errors: null });
  });
});
