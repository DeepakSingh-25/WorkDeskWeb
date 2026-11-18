import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccessAction, AccessModule, LicenseSummary, ModuleAccess, MyAccess } from '../../Interface/access';
import { AuthService } from '../Auth/auth.service';

/** All 9 PermissionCatalog modules, in matrix order (API spec 005 §2.2). */
export const ACCESS_MODULES: AccessModule[] =
  ['Projects', 'Tasks', 'Team', 'Agile', 'Workflows', 'Reports', 'Workspace', 'Settings', 'Billing'];
/** Modules the plan / license decides about. Settings and Billing are always on (lock-out prevention). */
export const PLAN_GATED_MODULES: AccessModule[] = ['Projects', 'Tasks', 'Team', 'Agile', 'Workflows', 'Reports', 'Workspace'];
export const ACCESS_ACTIONS: AccessAction[] = ['View', 'Create', 'Edit', 'Delete', 'Manage'];

export function isAccessModule(value: string | null | undefined): value is AccessModule {
  return !!value && (ACCESS_MODULES as string[]).includes(value);
}

export function isPlanGated(module: AccessModule): boolean {
  return PLAN_GATED_MODULES.includes(module);
}

/**
 * What the signed-in user may use: plan/license × role, per module (A1 `GET api/Access/me`).
 * UX only (sidebar, guards, greyed rows) — the API is the real gate.
 * Memory only — kuch bhi localStorage me nahi jaata.
 */
@Injectable({
  providedIn: 'root'
})
export class EntitlementService {
  private access = new BehaviorSubject<MyAccess | null>(null);
  readonly access$ = this.access.asObservable();

  private load$: Observable<MyAccess | null> | null = null;
  private loadedFor: string | null = null;      // token the cached answer belongs to
  private loadedAt = 0;                         // Date.now() of the last successful load (0 = never)

  constructor(private http: HttpClient, private authService: AuthService) {}

  /**
   * Loads A1 once per token (parallel callers share one request). A new login = a new token = refetch,
   * without touching AuthService. Emits null when signed out or when the call failed (failure is not
   * cached — the next call tries again; the last good answer stays in access$).
   */
  ensureLoaded(): Observable<MyAccess | null> {
    const token = this.authService.getToken();
    if (!token) {
      this.clear();
      return of(null);
    }
    if (this.load$ && this.loadedFor === token) return this.load$;

    if (this.loadedFor !== token) { this.access.next(null); this.loadedAt = 0; }
    this.loadedFor = token;
    const req$: Observable<MyAccess | null> = this.fetch().pipe(
      tap(a => {
        if (this.loadedFor !== token) return;
        this.loadedAt = Date.now();
        this.access.next(a);
      }),
      catchError(() => {
        if (this.load$ === req$) this.load$ = null;
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.load$ = req$;
    return req$;
  }

  /** Drops the cached answer and loads again (after a license upload, a role save, a plan 403 …). */
  refresh(): Observable<MyAccess | null> {
    this.load$ = null;
    return this.ensureLoaded();
  }

  /**
   * Refreshes only when the last good answer is older than `maxAgeMs` (window focus / periodic check, §7.5).
   * Signed out or never loaded → nothing to refresh (ensureLoaded is the caller's job then).
   */
  refreshIfStale(maxAgeMs: number): void {
    if (!this.authService.getToken() || !this.loadedAt) return;
    if (Date.now() - this.loadedAt >= maxAgeMs) this.refresh().subscribe();
  }

  /** Last loaded answer, or null when not loaded (yet). */
  current(): MyAccess | null {
    return this.access.value;
  }

  can(module: AccessModule, action: AccessAction = 'View'): boolean {
    return !!this.moduleAccess(module)?.[action];
  }

  inPlan(module: AccessModule): boolean {
    return !!this.moduleAccess(module)?.InPlan;
  }

  license(): LicenseSummary | null {
    return this.access.value?.License ?? null;
  }

  private moduleAccess(module: AccessModule): ModuleAccess | undefined {
    return this.access.value?.Modules[module];
  }

  private clear() {
    this.load$ = null;
    this.loadedFor = null;
    this.loadedAt = 0;
    if (this.access.value) this.access.next(null);
  }

  /** A1. `Cache-Control: no-store` is set by the API. */
  private fetch(): Observable<MyAccess> {
    return this.http.get<MyAccess>(`${environment.baseUrl}Access/me`);
  }
}
