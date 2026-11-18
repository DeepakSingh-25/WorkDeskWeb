import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProfilePhotoError, ProfilePhotoService } from './profile-photo.service';
import { environment } from '../../../environments/environment';

describe('ProfilePhotoService', () => {
  let service: ProfilePhotoService;
  let httpMock: HttpTestingController;
  let createSpy: jasmine.Spy;
  let revokeSpy: jasmine.Spy;
  let emitted: (string | null)[];

  const PHOTO_URL = `${environment.baseUrl}Profile/photo`;
  const image = () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProfilePhotoService);
    httpMock = TestBed.inject(HttpTestingController);
    createSpy = spyOn(URL, 'createObjectURL').and.returnValues('blob:first', 'blob:second', 'blob:third');
    revokeSpy = spyOn(URL, 'revokeObjectURL');
    emitted = [];
    service.photo$.subscribe(p => emitted.push(p));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should emit null and make no request when refresh is called without a token', () => {
    localStorage.removeItem('token');

    service.refresh();

    httpMock.expectNone(PHOTO_URL);
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('should emit an object URL when refresh gets a 200 image', () => {
    service.refresh();

    httpMock.expectOne(PHOTO_URL).flush(image());

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(emitted[emitted.length - 1]).toBe('blob:first');
  });

  it('should revoke the previous object URL when refresh runs a second time', () => {
    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());

    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());

    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(emitted[emitted.length - 1]).toBe('blob:second');
  });

  it('should revoke and emit null when refresh gets a 204', () => {
    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());

    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(null, { status: 204, statusText: 'No Content' });

    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('should keep the current photo when refresh fails', () => {
    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());

    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(null, { status: 500, statusText: 'Server Error' });

    expect(revokeSpy).not.toHaveBeenCalled();
    expect(emitted[emitted.length - 1]).toBe('blob:first');
  });

  it('should clear the photo when refresh gets a 401', () => {
    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());

    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('should reuse the in-flight request when refresh is called twice', () => {
    service.refresh();
    service.refresh();

    const reqs = httpMock.match(PHOTO_URL);
    expect(reqs.length).toBe(1);
    expect(reqs[0].cancelled).toBeFalse();
    reqs[0].flush(image());
  });

  it('should drop a refresh result that arrives after clear', () => {
    service.refresh();
    const req = httpMock.expectOne(PHOTO_URL);

    service.clear();

    expect(req.cancelled).toBeTrue();
    expect(createSpy).not.toHaveBeenCalled();
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('should DELETE, revoke and emit null when remove succeeds', fakeAsync(() => {
    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());
    let message: string | undefined;

    service.remove().then(m => message = m);
    const req = httpMock.expectOne(PHOTO_URL);
    expect(req.request.method).toBe('DELETE');
    req.flush({ Success: true, Message: 'Profile photo removed.', HasPhoto: false });
    flushMicrotasks();

    expect(message).toBe('Profile photo removed.');
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(emitted[emitted.length - 1]).toBeNull();
  }));

  it('should remove legacy profilePhoto keys and revoke the URL when clear is called', () => {
    service.refresh();
    httpMock.expectOne(PHOTO_URL).flush(image());
    localStorage.setItem('profilePhoto:user-1', 'data:image/png;base64,AAA');
    localStorage.setItem('profilePhoto:user-2', 'data:image/png;base64,BBB');
    localStorage.setItem('theme', 'dark');

    service.clear();

    expect(localStorage.getItem('profilePhoto:user-1')).toBeNull();
    expect(localStorage.getItem('profilePhoto:user-2')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  describe('save', () => {
    const file = new File(['raw'], 'me.png', { type: 'image/png' });
    let resized: Blob;

    beforeEach(() => {
      // Skip real image decoding / canvas work.
      resized = image();
      spyOn(service as any, 'resize').and.returnValue(Promise.resolve(resized));
    });

    it('should upload the resized photo and emit its object URL when the API succeeds', fakeAsync(() => {
      let message: string | undefined;

      service.save(file).then(m => message = m);
      flushMicrotasks();
      const req = httpMock.expectOne(PHOTO_URL);
      expect(req.request.method).toBe('POST');
      expect((req.request.body as FormData).get('File')).toEqual(jasmine.any(File));
      req.flush({ Success: true, Message: 'Profile photo updated.', HasPhoto: true });
      flushMicrotasks();

      expect(message).toBe('Profile photo updated.');
      expect(createSpy).toHaveBeenCalledWith(resized);
      expect(emitted[emitted.length - 1]).toBe('blob:first');
    }));

    it('should reject with the 2 MB message when the upload returns 413', fakeAsync(() => {
      let error: ProfilePhotoError | undefined;

      service.save(file).catch(e => error = e);
      flushMicrotasks();
      httpMock.expectOne(PHOTO_URL).flush(null, { status: 413, statusText: 'Payload Too Large' });
      flushMicrotasks();

      expect(error).toEqual(jasmine.any(ProfilePhotoError));
      expect(error!.message).toBe('Image must be 2 MB or smaller.');
      expect(error!.status).toBe(413);
    }));

    it('should reject with the API Message when the upload returns Success=false', fakeAsync(() => {
      let error: ProfilePhotoError | undefined;

      service.save(file).catch(e => error = e);
      flushMicrotasks();
      httpMock.expectOne(PHOTO_URL).flush({ Success: false, Message: 'Unsupported image type.', HasPhoto: false });
      flushMicrotasks();

      expect(error).toEqual(jasmine.any(ProfilePhotoError));
      expect(error!.message).toBe('Unsupported image type.');
      expect(emitted[emitted.length - 1]).toBeNull();
    }));

    it('should reject with status 401 when the upload is unauthorized', fakeAsync(() => {
      let error: ProfilePhotoError | undefined;

      service.save(file).catch(e => error = e);
      flushMicrotasks();
      httpMock.expectOne(PHOTO_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
      flushMicrotasks();

      expect(error!.status).toBe(401);
    }));
  });
});
