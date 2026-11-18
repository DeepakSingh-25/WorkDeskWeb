import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { UserProfileService } from './user-profile.service';
import { environment } from '../../../environments/environment';
import { PhotoSaveResponse, ProfileResponse, ProfileSaveResponse, UpdateProfileRequest } from '../../Interface/user-profile';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let httpMock: HttpTestingController;

  const PROFILE_URL = `${environment.baseUrl}Profile`;
  const PHOTO_URL = `${environment.baseUrl}Profile/photo`;

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
    HasPhoto: true,
    UpdatedAt: '2026-10-14T09:30:00Z'
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(UserProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should GET Profile with the bearer token and return the profile object', () => {
    let result: ProfileResponse | undefined;
    service.getProfile().subscribe(r => result = r);

    const req = httpMock.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(PROFILE);

    expect(result).toEqual(PROFILE);
    expect(Array.isArray(result)).toBeFalse();
  });

  it('should PUT Profile with the request body and Authorization header', () => {
    const body: UpdateProfileRequest = {
      FullName: 'Asha Verma',
      PhoneNumber: null,
      CompanyName: 'Acme Pvt Ltd',
      AddressLine: '12, MG Road',
      CountryID: 1,
      StateID: 12,
      CityID: 345,
      PinCode: '560038'
    };
    const response: ProfileSaveResponse = { Success: true, Message: 'Profile updated successfully.', Profile: PROFILE, Errors: null };
    let result: ProfileSaveResponse | undefined;

    service.updateProfile(body).subscribe(r => result = r);

    const req = httpMock.expectOne(PROFILE_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('should return the blob when getPhoto responds 200 with an image', () => {
    const image = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    let result: Blob | null | undefined;

    service.getPhoto().subscribe(r => result = r);

    const req = httpMock.expectOne(PHOTO_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(image);

    expect(result).toBe(image);
  });

  it('should return null when getPhoto responds 204', () => {
    let result: Blob | null | undefined;

    service.getPhoto().subscribe(r => result = r);

    httpMock.expectOne(PHOTO_URL).flush(null, { status: 204, statusText: 'No Content' });

    expect(result).toBeNull();
  });

  it('should return null when getPhoto responds 200 with a non-image body', () => {
    let result: Blob | null | undefined;

    service.getPhoto().subscribe(r => result = r);

    httpMock.expectOne(PHOTO_URL).flush(new Blob(['<html></html>'], { type: 'text/html' }));

    expect(result).toBeNull();
  });

  it('should send no Authorization header when there is no token', () => {
    localStorage.removeItem('token');

    service.getProfile().subscribe();

    const req = httpMock.expectOne(PROFILE_URL);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush(PROFILE);
  });

  it('should POST FormData with field File and no manual Content-Type when uploading a photo', () => {
    const image = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    const response: PhotoSaveResponse = { Success: true, Message: 'Profile photo updated.', HasPhoto: true };
    let result: PhotoSaveResponse | undefined;

    service.uploadPhoto(image, 'profile.jpg').subscribe(r => result = r);

    const req = httpMock.expectOne(PHOTO_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(jasmine.any(FormData));
    const form = req.request.body as FormData;
    const file = form.get('File') as File;
    expect(file).toEqual(jasmine.any(File));
    expect(file.name).toBe('profile.jpg');
    expect(req.request.headers.has('Content-Type')).toBeFalse();
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('should use DELETE when deleting the photo', () => {
    const response: PhotoSaveResponse = { Success: true, Message: 'Profile photo removed.', HasPhoto: false };
    let result: PhotoSaveResponse | undefined;

    service.deletePhoto().subscribe(r => result = r);

    const req = httpMock.expectOne(PHOTO_URL);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('should surface an HTTP error to the caller when GET Profile fails', () => {
    let status: number | undefined;

    service.getProfile().subscribe({ error: err => status = err.status });

    httpMock.expectOne(PROFILE_URL).flush(null, { status: 500, statusText: 'Server Error' });

    expect(status).toBe(500);
  });
});
