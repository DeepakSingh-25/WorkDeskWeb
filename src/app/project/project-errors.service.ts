import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ProjectActionResponse } from '../Interface/project';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { NotificationsService } from '../services/notifications.service';

export const PROJECT_GENERIC_ERROR = 'Something went wrong. Please try again.';
const NO_PERMISSION = "You don't have permission to do this.";
const OFFLINE = 'Could not reach the server. Check your connection and try again.';

/**
 * Error helpers shared by the project screens — same rules as settings-users.component.ts
 * (handleError / errorMessage / endSession), ek jagah par taaki 7 components me copy na ho.
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectErrorsService {
  constructor(
    private notificationsService: NotificationsService,
    private authService: AuthService,
    private photoService: ProfilePhotoService,
    private router: Router
  ) { }

  /**
   * 401 ⇒ end the session. Otherwise toast the server message (+ field errors) or the fallback.
   * Returns true when our data is stale (404 / 409) and the caller should reload.
   */
  handle(err: unknown, fallback: string): boolean {
    if (err instanceof HttpErrorResponse && err.status === 401) { this.endSession(); return false; }
    this.notificationsService.showNotification('error', this.message(err, fallback));
    return err instanceof HttpErrorResponse && (err.status === 404 || err.status === 409);
  }

  /** Only trust the body when it is our ProjectActionResponse / spec 005 403 shape (ProblemDetails is not). */
  message(err: unknown, fallback: string): string {
    if (!(err instanceof HttpErrorResponse)) return fallback || PROJECT_GENERIC_ERROR;
    const body = this.body(err);
    if (body) {
      const fieldMessages = body.Errors ? Object.values(body.Errors).flat().filter(m => !!m) : [];
      const text = [body.Message, ...fieldMessages].filter(m => !!m).join(' ');
      if (text) return text;
    }
    if (err.status === 0) return OFFLINE;
    if (err.status === 403) return NO_PERMISSION;
    return fallback || PROJECT_GENERIC_ERROR;
  }

  /** `Code` from a ProjectActionResponse error body, or null. */
  code(err: unknown): string | null {
    const body = err instanceof HttpErrorResponse ? this.body(err) : null;
    return typeof body?.Code === 'string' ? body.Code : null;
  }

  /** 400 field errors (PascalCase field names), or null. */
  fieldErrors(err: unknown): Record<string, string[]> | null {
    const body = err instanceof HttpErrorResponse ? this.body(err) : null;
    return body?.Errors ?? null;
  }

  isStatus(err: unknown, status: number): boolean {
    return err instanceof HttpErrorResponse && err.status === status;
  }

  private body(err: HttpErrorResponse): Partial<ProjectActionResponse> | null {
    const body: unknown = err.error;
    if (!body || typeof body !== 'object') return null;
    const b = body as Partial<ProjectActionResponse>;
    return b.Success === false ? b : null;
  }

  // 401: end the session and go to /login. AuthInterceptor normally did it already and navigated —
  // then don't navigate a second time (same as SettingsUsersComponent).
  private endSession() {
    this.photoService.clear();
    this.authService.logout();
    const current = this.router.url.split('?')[0];
    if (this.router.currentNavigation() || current.startsWith('/login')) return;
    this.router.navigate(['/login']);
  }
}
