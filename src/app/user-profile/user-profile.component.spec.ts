import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { of } from 'rxjs';

import { UserProfileComponent } from './user-profile.component';
import { environment } from '../../environments/environment';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { ProfileResponse, ProfileSaveResponse } from '../Interface/user-profile';
import { CityItem, CountryItem, StateItem } from '../Interface/drpcommon';

describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let httpMock: HttpTestingController;
  let router: Router;
  let notifications: jasmine.SpyObj<NotificationsService>;
  let loader: jasmine.SpyObj<LoaderService>;
  let auth: AuthService;
  let photo: jasmine.SpyObj<ProfilePhotoService>;

  const PROFILE_URL = `${environment.baseUrl}Profile`;
  const COUNTRY_URL = `${environment.baseUrl}DrpCommonApi/DrpCountryList`;
  const STATE_URL = (id: number) => `${environment.baseUrl}DrpCommonApi/DrpStateList?CountryID=${id}`;
  const CITY_URL = (id: number) => `${environment.baseUrl}DrpCommonApi/DrpCityList?StateID=${id}`;

  const PROFILE: ProfileResponse = {
    Id: '8c1e',
    FullName: 'Asha Verma',
    Email: 'asha@example.com',
    PhoneNumber: '9876543210',
    CompanyName: 'Acme Pvt Ltd',
    AddressLine: '12, MG Road',
    CountryID: 1,
    StateID: 12,
    CityID: 345,
    PinCode: '560038',
    HasPhoto: false,
    UpdatedAt: null
  };
  const COUNTRIES: CountryItem[] = [{ ID: 1, CountryName: 'India' }, { ID: 2, CountryName: 'Nepal' }];
  const STATES: StateItem[] = [{ ID: 12, StateName: 'Karnataka' }];
  const CITIES: CityItem[] = [{ ID: 345, CityName: 'Bengaluru' }];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');

    notifications = jasmine.createSpyObj('NotificationsService', ['showNotification']);
    loader = jasmine.createSpyObj('LoaderService', ['showLoader', 'hideLoader']);
    photo = jasmine.createSpyObj('ProfilePhotoService', ['refresh', 'clear', 'save', 'remove'], {
      photo$: of(null),
      defaultPhoto: 'assets/images/profile.webp'
    });

    await TestBed.configureTestingModule({
      declarations: [UserProfileComponent],
      imports: [ReactiveFormsModule, NgSelectModule, RouterLink],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotificationsService, useValue: notifications },
        { provide: LoaderService, useValue: loader },
        { provide: ProfilePhotoService, useValue: photo }
      ]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    // Real AuthService (setFullName writes localStorage); only logout is spied.
    auth = TestBed.inject(AuthService);
    spyOn(auth, 'logout').and.callThrough();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // ngOnInit + flush GET Profile and the country list.
  function loadProfile(profile: ProfileResponse = PROFILE): void {
    fixture.detectChanges();
    httpMock.expectOne({ method: 'GET', url: PROFILE_URL }).flush(profile);
    httpMock.expectOne({ method: 'GET', url: COUNTRY_URL }).flush(COUNTRIES);
  }

  function flushLookups(): void {
    httpMock.expectOne(STATE_URL(1)).flush(STATES);
    httpMock.expectOne(CITY_URL(12)).flush(CITIES);
  }

  function control(name: string) {
    return component.userProfileForm.controls[name];
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should patch the form and load states/cities for the saved ids when the profile loads', () => {
    loadProfile();
    flushLookups();

    expect(photo.refresh).toHaveBeenCalled();
    expect(component.countryData).toEqual(COUNTRIES);
    expect(component.stateData).toEqual(STATES);
    expect(component.cityData).toEqual(CITIES);
    expect(component.userProfileForm.getRawValue()).toEqual({
      txtFullName: 'Asha Verma',
      txtEmail: 'asha@example.com',
      txtPhone: '9876543210',
      txtCompanyName: 'Acme Pvt Ltd',
      txtAddress: '12, MG Road',
      drpCountry: 1,
      drpState: 12,
      drpCity: 345,
      txtPinCode: '560038'
    });
    expect(component.userProfileForm.valid).toBeTrue();
  });

  it('should show and hide the loader around the profile load', () => {
    fixture.detectChanges();
    expect(loader.showLoader).toHaveBeenCalled();
    expect(loader.hideLoader).not.toHaveBeenCalled();
    expect(component.loading).toBeTrue();

    httpMock.expectOne(PROFILE_URL).flush(PROFILE);
    httpMock.expectOne(COUNTRY_URL).flush(COUNTRIES);
    flushLookups();

    expect(loader.hideLoader).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('should keep the Email control disabled after the profile loads', () => {
    loadProfile();
    flushLookups();

    expect(control('txtEmail').disabled).toBeTrue();
    expect(control('txtFullName').enabled).toBeTrue();
  });

  it('should disable the form while the profile is loading', () => {
    fixture.detectChanges();

    expect(component.userProfileForm.disabled).toBeTrue();

    httpMock.expectOne(PROFILE_URL).flush(PROFILE);
    httpMock.expectOne(COUNTRY_URL).flush(COUNTRIES);
    flushLookups();
  });

  it('should reject pin code 5600.8', () => {
    control('txtPinCode').setValue('5600.8');
    expect(control('txtPinCode').hasError('pattern')).toBeTrue();
  });

  it('should reject a 5-digit pin code', () => {
    control('txtPinCode').setValue('12345');
    expect(control('txtPinCode').hasError('pattern')).toBeTrue();
  });

  it('should accept a 6-digit pin code', () => {
    control('txtPinCode').setValue('560038');
    expect(control('txtPinCode').valid).toBeTrue();
  });

  it('should treat an empty phone as valid', () => {
    control('txtPhone').setValue('');
    expect(control('txtPhone').valid).toBeTrue();
  });

  it('should reject phone 12345', () => {
    control('txtPhone').setValue('12345');
    expect(control('txtPhone').hasError('pattern')).toBeTrue();
  });

  it('should clear state and city without throwing when onCountryChange gets undefined', () => {
    loadProfile();
    flushLookups();

    expect(() => component.onCountryChange(undefined)).not.toThrow();

    expect(control('drpState').value).toBeNull();
    expect(control('drpCity').value).toBeNull();
    expect(component.stateData).toEqual([]);
    expect(component.cityData).toEqual([]);
    httpMock.expectNone(req => req.url.includes('DrpStateList'));
  });

  it('should reset state and city and cancel the stale state request when the country changes', () => {
    loadProfile();
    const staleStates = httpMock.expectOne(STATE_URL(1));
    const staleCities = httpMock.expectOne(CITY_URL(12));

    component.onCountryChange(2);

    expect(staleStates.cancelled).toBeTrue();
    expect(staleCities.cancelled).toBeTrue();
    expect(control('drpState').value).toBeNull();
    expect(control('drpCity').value).toBeNull();

    const nepalStates: StateItem[] = [{ ID: 50, StateName: 'Bagmati' }];
    httpMock.expectOne(STATE_URL(2)).flush(nepalStates);

    expect(component.stateData).toEqual(nepalStates);
    expect(component.cityData).toEqual([]);
  });

  it('should toast the Message, store fullName and mark the form pristine when save succeeds', () => {
    loadProfile();
    flushLookups();
    control('txtFullName').setValue('  Asha V  ');
    control('txtPhone').setValue('');
    component.userProfileForm.markAsDirty();

    component.onSave();

    const req = httpMock.expectOne({ method: 'PUT', url: PROFILE_URL });
    expect(req.request.body).toEqual({
      FullName: 'Asha V',
      PhoneNumber: null,
      CompanyName: 'Acme Pvt Ltd',
      AddressLine: '12, MG Road',
      CountryID: 1,
      StateID: 12,
      CityID: 345,
      PinCode: '560038'
    });
    const saved: ProfileSaveResponse = {
      Success: true,
      Message: 'Profile updated successfully.',
      Profile: { ...PROFILE, FullName: 'Asha V', PhoneNumber: null },
      Errors: null
    };
    req.flush(saved);

    // Same country/state ids: lookups are not re-fetched (httpMock.verify in afterEach).
    expect(notifications.showNotification).toHaveBeenCalledWith('success', 'Profile updated successfully.');
    expect(localStorage.getItem('fullName')).toBe('Asha V');
    expect(component.userProfileForm.pristine).toBeTrue();
    expect(component.saving).toBeFalse();
  });

  it('should put the server error on drpState when save returns 400 with Errors.StateID', () => {
    loadProfile();
    flushLookups();

    component.onSave();

    httpMock.expectOne({ method: 'PUT', url: PROFILE_URL }).flush(
      { Success: false, Message: 'Please fix the highlighted fields.', Profile: null, Errors: { StateID: ['Select a state.'] } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(control('drpState').getError('server')).toBe('Select a state.');
    expect(component.serverError('drpState')).toBe('Select a state.');
    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Please fix the highlighted fields.');
  });

  it('should show a generic toast when save returns a 400 ProblemDetails body', () => {
    loadProfile();
    flushLookups();

    component.onSave();

    httpMock.expectOne({ method: 'PUT', url: PROFILE_URL }).flush(
      { type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1', title: 'One or more validation errors occurred.', status: 400, errors: { CountryID: ['Invalid'] } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(notifications.showNotification).toHaveBeenCalledWith('error', 'Please check the form and try again.');
    expect(control('drpCountry').getError('server')).toBeNull();
  });

  it('should log out and navigate to /login when GET Profile returns 401', () => {
    fixture.detectChanges();

    httpMock.expectOne(PROFILE_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    const countries = httpMock.expectOne(COUNTRY_URL);

    expect(countries.cancelled).toBeTrue();
    expect(photo.clear).toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(loader.hideLoader).toHaveBeenCalled();
  });

  it('should not send a PUT when the form is invalid', () => {
    loadProfile();
    flushLookups();
    control('txtPinCode').setValue('12345');

    component.onSave();

    httpMock.expectNone({ method: 'PUT', url: PROFILE_URL });
    expect(component.submitted).toBeTrue();
    expect(control('txtPinCode').touched).toBeTrue();
  });
});
