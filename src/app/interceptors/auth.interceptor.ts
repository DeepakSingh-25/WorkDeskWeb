import { Injectable, Injector } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { NotificationsService } from '../services/notifications.service';
import { EntitlementService } from '../services/Access/entitlement.service';
import { LICENSE_DENIED_CODES } from '../Interface/access';

// Har API request par Bearer token lagata hai, aur 401 aane par session khatam karke /login bhejta hai.
// Sirf apni API (environment.baseUrl) ke liye — bahar ke URLs par token kabhi nahi jaata.
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  // AuthService / ProfilePhotoService khud HttpClient use karte hain, isliye unhe Injector se
  // baad mein lete hain — constructor mein inject karne par circular dependency (NG0200) aata hai.
  constructor(
    private injector: Injector,
    private router: Router,
    private notificationsService: NotificationsService
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!req.url.startsWith(environment.baseUrl)) return next.handle(req);

    const token = this.injector.get(AuthService).getToken();
    const authReq = token && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(authReq).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) this.onUnauthorized();
        if (error instanceof HttpErrorResponse && error.status === 403) this.onForbidden(error);
        // Error aage bhejte hain, taaki component apna loader / message sambhal sake
        return throwError(() => error);
      })
    );
  }

  private onUnauthorized(): void {
    const authService = this.injector.get(AuthService);
    // Ek saath kai requests 401 dein to sirf pehli wali logout + message kare
    if (!authService.getToken()) return;

    this.injector.get(ProfilePhotoService).clear();
    authService.logout();
    this.notificationsService.showNotification('error', 'Session expired. Please login again.');

    this.router.navigate(['/login']);
  }

  // 403 with a plan / license Code (spec 005 §7.3) = our cached A1 is stale (downgrade, expiry, new license on
  // another instance). Reload it so sidebar / guards / banner catch up. NO_PERMISSION etc. don't trigger it.
  // EntitlementService uses HttpClient → Injector se lazy (circular DI otherwise). Error is still rethrown.
  private onForbidden(error: HttpErrorResponse): void {
    const body: unknown = error.error;
    const code = body && typeof body === 'object' ? (body as { Code?: unknown }).Code : null;
    if (typeof code !== 'string' || !LICENSE_DENIED_CODES.includes(code)) return;
    this.injector.get(EntitlementService).refresh().subscribe();
  }
}
