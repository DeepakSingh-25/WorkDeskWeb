import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '../../Interface/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private baseUrl = `${environment.baseUrl}Auth/`;

  // Display name shown in the headers; updated on login, profile save and logout.
  private fullName = new BehaviorSubject<string | null>(localStorage.getItem('fullName'));
  readonly fullName$ = this.fullName.asObservable();

  constructor(private http: HttpClient) {}

  // ─── Login ─────────────────────────────────────────────────────────────────
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}login`, request).pipe(
      tap((response) => {
        if (response.Success && response.Token) {
          this.saveSession(response);
        }
      })
    );
  }

  // ─── Register ──────────────────────────────────────────────────────────────
  // Session save nahi karte — signup ke baad user login page par khud login karega
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}register`, request);
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────
  forgotPassword(request: ForgotPasswordRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}forgot-password`, request);
  }

  // ─── Reset Password ────────────────────────────────────────────────────────
  resetPassword(request: ResetPasswordRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}reset-password`, request);
  }

  // ─── Change Password ───────────────────────────────────────────────────────
  // [Authorize] endpoint. AuthInterceptor also adds the token but skips requests that already carry
  // Authorization — setting it here too is deliberate belt-and-braces. No token -> no header
  // (never "Bearer null").
  // 400 / 404 bodies are ChangePasswordResponse too (read them from error.error).
  changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders().set('Authorization', `Bearer ${token}`) : new HttpHeaders();
    return this.http.post<ChangePasswordResponse>(`${this.baseUrl}change-password`, request, { headers });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private saveSession(response: AuthResponse): void {
    localStorage.setItem('token', response.Token!);
    if (response.User) {
      localStorage.setItem('userId', response.User.Id);
      this.setFullName(response.User.FullName);
      localStorage.setItem('email', response.User.Email);
      localStorage.setItem('phoneNumber', response.User.PhoneNumber ?? '');
    }
  }

  setFullName(name: string): void {
    localStorage.setItem('fullName', name);
    this.fullName.next(name);
  }

  logout(): void {
    const theme = localStorage.getItem('theme');
    localStorage.clear();
    if (theme) localStorage.setItem('theme', theme);
    this.fullName.next(null);
  }

  // Token hona kaafi nahi — expire ho chuka token bhi "logged out" maana jayega
  isLoggedIn(): boolean {
    const token = localStorage.getItem('token');
    return !!token && !this.isTokenExpired(token);
  }

  // JWT payload ka `exp` (seconds) padhta hai. Payload decode na ho to token invalid maana jata hai.
  private isTokenExpired(token: string): boolean {
    try {
      const payload = token.split('.')[1];
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const exp = JSON.parse(json)?.exp;
      return typeof exp === 'number' && exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // Signed-in user's Id (Guid string, saved at login). Display / UI hints only — the server takes the
  // caller id from the token.
  getUserId(): string | null {
    return localStorage.getItem('userId');
  }
}
