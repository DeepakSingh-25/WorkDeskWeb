import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SettingsService } from './settings.service';
import { environment } from '../../../environments/environment';
import { PermissionSet, Role } from '../../Interface/settings';

describe('SettingsService (Roles)', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;

  const ROLES_URL = `${environment.baseUrl}Roles`;

  const PERMS: PermissionSet = { Projects: { View: true, Create: false, Edit: false, Delete: false, Manage: false } };

  const role = (over: Partial<Role> = {}): Role => ({
    ID: 0, Name: 'QA Reviewer', Description: 'Reviews', IsSystem: false, Color: '#0043E0',
    Permissions: PERMS, UserCount: 3, ...over
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getRoles sends GET Roles with the bearer token and returns the body as is', () => {
    const data = [role({ ID: 6, RowVersion: 'AAAA' })];
    let result: Role[] | undefined;
    service.getRoles().subscribe(r => result = r);

    const req = httpMock.expectOne(ROLES_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(data);
    expect(result).toEqual(data);
  });

  it('saveRole with ID 0 sends POST Roles without ID / IsSystem / UserCount / RowVersion', () => {
    let result: { Status: string; ID: number } | undefined;
    service.saveRole(role({ RowVersion: 'ignored' })).subscribe(r => result = r);

    const req = httpMock.expectOne(ROLES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ Name: 'QA Reviewer', Description: 'Reviews', Color: '#0043E0', Permissions: PERMS });
    for (const key of ['ID', 'IsSystem', 'UserCount', 'RowVersion']) {
      expect(Object.keys(req.request.body)).not.toContain(key);
    }
    req.flush({ Success: true, Message: 'Role added successfully.', ID: 9, Errors: null });
    expect(result).toEqual({ Status: 'Role added successfully.', ID: 9 });
  });

  it('saveRole with ID 6 sends PUT Roles/6 including RowVersion but not ID / IsSystem / UserCount', () => {
    let result: { Status: string; ID: number } | undefined;
    service.saveRole(role({ ID: 6, RowVersion: 'AAAA' })).subscribe(r => result = r);

    const req = httpMock.expectOne(`${ROLES_URL}/6`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      Name: 'QA Reviewer', Description: 'Reviews', Color: '#0043E0', Permissions: PERMS, RowVersion: 'AAAA'
    });
    for (const key of ['ID', 'IsSystem', 'UserCount']) {
      expect(Object.keys(req.request.body)).not.toContain(key);
    }
    req.flush({ Success: true, Message: 'Role updated successfully.', ID: 6, Errors: null });
    expect(result).toEqual({ Status: 'Role updated successfully.', ID: 6 });
  });

  it('saveRole falls back to the role ID and an empty Status on an empty body', () => {
    let result: { Status: string; ID: number } | undefined;
    service.saveRole(role({ ID: 6, RowVersion: 'AAAA' })).subscribe(r => result = r);

    httpMock.expectOne(`${ROLES_URL}/6`).flush(null);
    expect(result).toEqual({ Status: '', ID: 6 });
  });

  it('deleteRole sends DELETE Roles/6 and maps Message to Status', () => {
    let result: { Status: string } | undefined;
    service.deleteRole(6).subscribe(r => result = r);

    const req = httpMock.expectOne(`${ROLES_URL}/6`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ Success: true, Message: 'Role deleted. 2 user(s) moved to Member.', ID: 6, Errors: null });
    expect(result).toEqual({ Status: 'Role deleted. 2 user(s) moved to Member.' });
  });

  it('propagates an error body as HttpErrorResponse (409) without swallowing it', () => {
    let error: HttpErrorResponse | undefined;
    service.saveRole(role({ ID: 6, RowVersion: 'OLD' })).subscribe({ error: (e: HttpErrorResponse) => error = e });

    const body = { Success: false, Message: 'This role was changed by someone else. Reload and try again.', ID: null, Errors: null };
    httpMock.expectOne(`${ROLES_URL}/6`).flush(body, { status: 409, statusText: 'Conflict' });
    expect(error?.status).toBe(409);
    expect(error?.error).toEqual(body);
  });

  it('transferSuperAdmin sends POST Users/{id}/transfer-super-admin without a body and maps Message to Status', () => {
    let result: { Status: string } | undefined;
    service.transferSuperAdmin('8c1e-41aa').subscribe(r => result = r);

    const req = httpMock.expectOne(`${environment.baseUrl}Users/8c1e-41aa/transfer-super-admin`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush({ Success: true, Message: 'Priya Verma is now the Super Admin.', Errors: null });
    expect(result).toEqual({ Status: 'Priya Verma is now the Super Admin.' });
  });

  it('propagates a 403 on getRoles', () => {
    let error: HttpErrorResponse | undefined;
    service.getRoles().subscribe({ error: (e: HttpErrorResponse) => error = e });

    httpMock.expectOne(ROLES_URL).flush({ Success: false, Message: "You don't have permission to manage roles." },
      { status: 403, statusText: 'Forbidden' });
    expect(error?.status).toBe(403);
  });
});
