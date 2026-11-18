import { Injectable, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subscription, firstValueFrom } from 'rxjs';
import { UserProfileService } from './user-profile.service';
import { PhotoSaveResponse } from '../../Interface/user-profile';

const LEGACY_KEY_PREFIX = 'profilePhoto:';
const MAX_SIDE = 256;
const GENERIC_ERROR = 'Could not update the photo. Please try again.';
const PHOTO_TOO_LARGE = 'Image must be 2 MB or smaller.';
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 10000;

// Error carrying the HTTP status (if any) so callers can react to 401.
export class ProfilePhotoError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ProfilePhotoError';
  }
}

// Profile photo, stored on the server (api/Profile/photo). `<img src>` cannot send the bearer
// header, so the photo is fetched as a blob and exposed as an object URL on photo$.
@Injectable({ providedIn: 'root' })
export class ProfilePhotoService implements OnDestroy {
  readonly defaultPhoto = 'assets/images/profile.webp';
  private photo = new BehaviorSubject<string | null>(null);
  readonly photo$ = this.photo.asObservable();

  private objectUrl: string | null = null;
  private refreshSub?: Subscription;
  // Bumped by clear(); results of requests started before a sign-out are dropped.
  private generation = 0;
  private refreshGen = -1;

  constructor(private userProfileService: UserProfileService) {
    // Migration: photos used to live in localStorage; they are dropped, not uploaded.
    this.purgeLegacyKeys();
  }

  // Load the logged-in user's photo. 401 clears it; other errors keep the current state
  // (header calls this too).
  refresh(): void {
    if (!this.hasToken()) {
      this.refreshSub?.unsubscribe();
      this.setPhoto(null);
      return;
    }
    // Both headers and the profile page call this on load. Reuse the request in flight:
    // cancelling it aborts the HTTP call and the API logs a TaskCanceledException.
    if (this.refreshSub && !this.refreshSub.closed && this.refreshGen === this.generation) return;
    this.refreshSub?.unsubscribe();
    const gen = this.refreshGen = this.generation;
    this.refreshSub = this.userProfileService.getPhoto().subscribe({
      next: blob => {
        if (gen === this.generation) this.setPhoto(blob);
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) this.setPhoto(null);
      }
    });
  }

  // Resize the picked image and upload it. Resolves with the API message.
  async save(file: File): Promise<string> {
    const gen = this.generation;
    const blob = await this.resize(file);
    let res: PhotoSaveResponse;
    try {
      res = await firstValueFrom(this.userProfileService.uploadPhoto(blob, 'profile.jpg'));
    } catch (err) {
      throw this.toError(err);
    }
    if (!res?.Success) {
      throw new ProfilePhotoError(res?.Message || GENERIC_ERROR);
    }
    // Signed out while uploading: don't show the photo to whoever is next.
    if (gen !== this.generation) return res.Message;
    // A slower in-flight refresh must not overwrite the photo just uploaded.
    this.refreshSub?.unsubscribe();
    this.setPhoto(blob);
    return res.Message;
  }

  // Delete the photo on the server. Resolves with the API message.
  async remove(): Promise<string> {
    const gen = this.generation;
    let res: PhotoSaveResponse;
    try {
      res = await firstValueFrom(this.userProfileService.deletePhoto());
    } catch (err) {
      throw this.toError(err);
    }
    if (!res?.Success) {
      throw new ProfilePhotoError(res?.Message || GENERIC_ERROR);
    }
    if (gen !== this.generation) return res.Message;
    this.refreshSub?.unsubscribe();
    this.setPhoto(null);
    return res.Message;
  }

  // Logout: forget the photo and any legacy browser-stored copies.
  clear(): void {
    this.generation++;
    this.refreshSub?.unsubscribe();
    this.setPhoto(null);
    this.purgeLegacyKeys();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.revoke();
  }

  private setPhoto(blob: Blob | null): void {
    this.revoke();
    if (blob) {
      this.objectUrl = URL.createObjectURL(blob);
    }
    this.photo.next(this.objectUrl);
  }

  private revoke(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private toError(err: unknown): ProfilePhotoError {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return new ProfilePhotoError('Your session has expired. Please sign in again.', 401);
      const body = err.error as Partial<PhotoSaveResponse> | null;
      // 413 may come from the server/proxy with no usable body; prefer the API message when present.
      if (err.status === 413) {
        const apiMessage = body && typeof body === 'object' && typeof body.Success === 'boolean'
          && typeof body.Message === 'string' && body.Message ? body.Message : null;
        return new ProfilePhotoError(apiMessage ?? PHOTO_TOO_LARGE, 413);
      }
      if (err.status === 400 && body && body.Success === false && body.Message) {
        return new ProfilePhotoError(body.Message, 400);
      }
      return new ProfilePhotoError(GENERIC_ERROR, err.status);
    }
    return new ProfilePhotoError(GENERIC_ERROR);
  }

  private hasToken(): boolean {
    try { return !!localStorage.getItem('token'); } catch { return false; }
  }

  private purgeLegacyKeys(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LEGACY_KEY_PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch { }
  }

  // Centre-crop to a square, scale down to 256px, encode as JPEG.
  private resize(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        // Guard against decompression bombs before allocating a canvas.
        if (img.width * img.height > MAX_PIXELS || img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
          reject(new ProfilePhotoError('This image is too large.'));
          return;
        }
        const side = Math.min(img.width, img.height);
        const size = Math.min(side, MAX_SIDE);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new ProfilePhotoError('This file is not a valid image.')); return; }
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new ProfilePhotoError('This file is not a valid image.')),
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new ProfilePhotoError('This file is not a valid image.')); };
      img.src = url;
    });
  }
}
