import { Component, ChangeDetectionStrategy, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AccessDeniedReason, AccessModule, MyAccess } from '../Interface/access';
import { AuthService } from '../services/Auth/auth.service';
import { EntitlementService, isAccessModule } from '../services/Access/entitlement.service';

const REASONS: AccessDeniedReason[] = ['plan', 'license', 'role', 'error'];

// Where "Try again" goes once access could be loaded (the guard runs again there).
const MODULE_ROUTES: Record<AccessModule, string> = {
  Projects: '/projects', Tasks: '/tasks', Team: '/team', Agile: '/agile', Workflows: '/workflows',
  Reports: '/reports', Workspace: '/workspace', Settings: '/settings', Billing: '/settings/billing'
};

/**
 * /accessdenied?module=Agile&reason=plan|license|role|error (set by moduleGuard).
 * Without a reason it shows the old generic text. Query params are only used when they are known
 * values, so the page never prints arbitrary text from the URL.
 */
@Component({
    selector: 'app-accessdenied',
    templateUrl: './accessdenied.component.html',
    styleUrl: './accessdenied.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AccessdeniedComponent implements OnInit {
  reason: AccessDeniedReason | null = null;
  module: AccessModule | null = null;
  access: MyAccess | null = null;
  loggedIn = false;
  retrying = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private entitlement: EntitlementService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const reason = params.get('reason');
      const module = params.get('module');
      this.reason = REASONS.find(r => r === reason) ?? null;
      this.module = isAccessModule(module) ? module : null;
      this.loggedIn = this.authService.isLoggedIn();
      this.loadAccess();
    });
  }

  /** "Workflows" or a neutral word when the URL had no known module. */
  get moduleName(): string { return this.module ?? 'this page'; }

  get planName(): string { return this.access?.License.PlanName || 'current plan'; }

  get availableIn(): string {
    return this.module ? (this.access?.Modules[this.module]?.AvailableIn ?? []).join(', ') : '';
  }

  get licenseExpired(): boolean { return this.access?.License.State === 'Expired'; }

  /** Only people who may see Billing get the "View plan & license" button. */
  get canSeeBilling(): boolean { return !!this.access?.Modules.Billing?.View; }

  onRetry() {
    if (this.retrying) return;
    this.retrying = true;
    this.entitlement.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(a => {
      this.retrying = false;
      this.access = a;
      if (a) this.router.navigateByUrl(this.module ? MODULE_ROUTES[this.module] : '/dashboard');
    });
  }

  private loadAccess() {
    // The error page offers its own retry; signed-out visitors have no access to load.
    if (!this.loggedIn || this.reason === 'error') { this.access = this.entitlement.current(); return; }
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(a => this.access = a);
  }
}
