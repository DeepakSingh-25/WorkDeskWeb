import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { ChangepasswordComponent } from './changepassword.component';
import { environment } from '../../environments/environment';
import { NotificationsService } from '../services/notifications.service';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';

describe('ChangepasswordComponent', () => {
  let component: ChangepasswordComponent;
  let fixture: ComponentFixture<ChangepasswordComponent>;
  let httpMock: HttpTestingController;
  let router: Router;
  let urlSpy: jasmine.Spy<() => string>;
  let auth: AuthService;
  let notifications: jasmine.SpyObj<NotificationsService>;
  let photo: jasmine.SpyObj<ProfilePhotoService>;

  const CHANGE_URL = `${environment.baseUrl}Auth/change-password`;
  const PATTERN_MESSAGE = 'Password must be at least 8 characters and contain an uppercase letter, a lowercase letter, a number and a special character (@$!%*?&).';

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  function fill(current: string, next: string, confirm: string): void {
    component.changepasswordForm.setValue({
      txtCurrentPassword: current,
      txtNewPassword: next,
      txtConfirmPassword: confirm,
    });
  }

  function fillValid(): void {
    fill('OldPass@123', 'NewPass@456', 'NewPass@456');
  }

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('theme', 'dark');

    notifications = jasmine.createSpyObj('NotificationsService', ['showNotification']);
    photo = jasmine.createSpyObj('ProfilePhotoService', ['clear']);

    await TestBed.configureTestingModule({
      declarations: [ChangepasswordComponent],
      imports: [ReactiveFormsModule, RouterLink, FontAwesomeModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotificationsService, useValue: notifications },
        { provide: ProfilePhotoService, useValue: photo },
      ]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    spyOn(router, 'navigate').and.resolveTo(true);
    // The page under test lives at /changepassword (no real navigation happens in these tests).
    urlSpy = spyOnProperty(router, 'url', 'get').and.returnValue('/changepassword');
    auth = TestBed.inject(AuthService);
    spyOn(auth, 'logout').and.callThrough();

    fixture = TestBed.createComponent(ChangepasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the three required messages and send no request when the form is empty', () => {
    component.onSave();
    fixture.detectChanges();

    httpMock.expectNone(CHANGE_URL);
    expect(text()).toContain('Current password is required.');
    expect(text()).toContain('New password is required.');
    expect(text()).toContain('Please confirm your new password.');
  });

  it('should show the pattern message for a weak new password and send no request', () => {
    fill('OldPass@123', 'abc', 'abc');
    component.onSave();
    fixture.detectChanges();

    httpMock.expectNone(CHANGE_URL);
    expect(text()).toContain(PATTERN_MESSAGE);
  });

  it('should set passwordMismatch on the group without touching the confirm control errors', () => {
    fill('OldPass@123', 'NewPass@456', 'NewPass@789');

    expect(component.changepasswordForm.hasError('passwordMismatch')).toBeTrue();
    expect(component.changepasswordForm.controls['txtConfirmPassword'].errors).toBeNull();

    component.onSave();
    fixture.detectChanges();
    httpMock.expectNone(CHANGE_URL);
    expect(text()).toContain('Passwords do not match.');
  });

  it('should set sameAsCurrent on the group when the new password equals the current one', () => {
    fill('SamePass@123', 'SamePass@123', 'SamePass@123');

    expect(component.changepasswordForm.hasError('sameAsCurrent')).toBeTrue();
    expect(component.changepasswordForm.controls['txtNewPassword'].errors).toBeNull();

    component.onSave();
    fixture.detectChanges();
    httpMock.expectNone(CHANGE_URL);
    expect(text()).toContain('New password must be different from the current password.');
  });

  it('should POST the mapped request, toast, log out and go to /login on 200', () => {
    fillValid();
    component.onSave();

    const req = httpMock.expectOne(CHANGE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      CurrentPassword: 'OldPass@123',
      NewPassword: 'NewPass@456',
      ConfirmPassword: 'NewPass@456',
    });
    req.flush({ Success: true, Message: 'Password changed successfully. Please log in again.', Errors: null });

    expect(notifications.showNotification).toHaveBeenCalledWith('success', 'Password changed successfully. Please log in again.');
    expect(photo.clear).toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(component.saving).toBeFalse();
  });

  it('should map Errors.CurrentPassword on 400, clear only that field and stay logged in', () => {
    fillValid();
    component.onSave();

    httpMock.expectOne(CHANGE_URL).flush(
      { Success: false, Message: 'Current password is incorrect.', Errors: { CurrentPassword: ['Current password is incorrect.'] } },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    const current = component.changepasswordForm.controls['txtCurrentPassword'];
    expect(current.value).toBe('');
    expect(current.errors?.['server']).toBe('Current password is incorrect.');
    expect(component.changepasswordForm.controls['txtNewPassword'].value).toBe('NewPass@456');
    expect(component.changepasswordForm.controls['txtConfirmPassword'].value).toBe('NewPass@456');
    expect(text()).toContain('Current password is incorrect.');
    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Current password is incorrect.');
    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('test-token');
  });

  it('should clear a server error on the next value change', () => {
    fillValid();
    component.onSave();
    httpMock.expectOne(CHANGE_URL).flush(
      { Success: false, Message: 'New password must be different from the current password.', Errors: { NewPassword: ['New password must be different from the current password.'] } },
      { status: 400, statusText: 'Bad Request' }
    );
    expect(component.changepasswordForm.controls['txtNewPassword'].errors?.['server']).toBeTruthy();

    component.changepasswordForm.controls['txtCurrentPassword'].setValue('Other@1234');

    expect(component.changepasswordForm.controls['txtNewPassword'].errors).toBeNull();
  });

  it('should log out and go to /login on 401', () => {
    fillValid();
    component.onSave();

    httpMock.expectOne(CHANGE_URL).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(photo.clear).toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should log out but not navigate again on 401 when the interceptor already moved to /login', () => {
    urlSpy.and.returnValue('/login');
    fillValid();
    component.onSave();

    httpMock.expectOne(CHANGE_URL).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should explain and log out on 404 with an API body', () => {
    fillValid();
    component.onSave();

    httpMock.expectOne(CHANGE_URL).flush(
      { Success: false, Message: 'Account not found or deactivated.', Errors: null },
      { status: 404, statusText: 'Not Found' }
    );

    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Your account was not found or is deactivated.');
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should show the generic message and stay logged in on a routing 404 with no body', () => {
    fillValid();
    component.onSave();

    httpMock.expectOne(CHANGE_URL).flush(null, { status: 404, statusText: 'Not Found' });

    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Something went wrong. Please try again.');
    expect(notifications.showNotification).not.toHaveBeenCalledWith('error', 'Your account was not found or is deactivated.');
    expect(auth.logout).not.toHaveBeenCalled();
    expect(photo.clear).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('test-token');
  });

  it('should show the generic message and keep the form on a server error', () => {
    fillValid();
    component.onSave();

    httpMock.expectOne(CHANGE_URL).flush(null, { status: 500, statusText: 'Server Error' });

    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Something went wrong. Please try again.');
    expect(component.changepasswordForm.controls['txtNewPassword'].value).toBe('NewPass@456');
    expect(auth.logout).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });

  it('should ignore a second submit while saving', () => {
    fillValid();
    component.onSave();
    component.onSave();

    const reqs = httpMock.match(CHANGE_URL);
    expect(reqs.length).toBe(1);
    expect(component.saving).toBeTrue();
    reqs[0].flush({ Success: true, Message: 'ok', Errors: null });
    expect(component.saving).toBeFalse();
  });

  it('should clear the fields, the submitted flag and the show-password toggles on reset', () => {
    fill('a', 'b', 'c');
    component.onSave();
    httpMock.expectNone(CHANGE_URL);
    component.toggleCurrentPassword();
    component.toggleNewPassword();
    component.toggleConfirmPassword();

    component.resetForm();
    fixture.detectChanges();

    expect(component.changepasswordForm.getRawValue()).toEqual({
      txtCurrentPassword: '',
      txtNewPassword: '',
      txtConfirmPassword: '',
    });
    expect(component.submitted).toBeFalse();
    expect(component.showCurrentPassword).toBeFalse();
    expect(component.showNewPassword).toBeFalse();
    expect(component.showConfirmPassword).toBeFalse();
    expect(text()).not.toContain('Current password is required.');
  });
});
