import { Component, ChangeDetectionStrategy, DestroyRef, HostListener, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { LicenseState, MyAccess } from '../Interface/access';
import { EntitlementService } from '../services/Access/entitlement.service';

/** States where gated modules are off or read-only → red strip; Grace / seats / clock → amber. */
const DANGER_STATES: LicenseState[] = ['Unlicensed', 'Invalid', 'NotYetValid', 'Expired'];
const FOCUS_REFRESH_MS = 60 * 1000;           // spec 005 §7.5: window focus, ≥ 60 s since the last load
const PERIODIC_REFRESH_MS = 5 * 60 * 1000;    // spec 005 §7.5: every 5 min

/**
 * License strip under the header (spec 005 §8.1): Grace / Expired / Unlicensed / Invalid / seats over limit /
 * clock warning. The text is A1 `License.Banner` — the API already words it per caller (actionable for
 * Billing viewers, neutral for everyone else, seats / clock only for Billing viewers), so this component
 * never decides "admin or not" itself. The "Plan & License" link shows only with Billing.View.
 * Dismiss = this browser tab only (memory); a different message shows again.
 * Also keeps A1 fresh while the app is open: on window focus and every 5 minutes.
 */
@Component({
    selector: 'app-license-banner',
    templateUrl: './license-banner.component.html',
    styleUrl: './license-banner.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LicenseBannerComponent implements OnInit {
  /** Memory only (no storage): survives layout re-renders, gone on reload. */
  private static dismissed: string | null = null;

  faWarn = faTriangleExclamation;

  text: string | null = null;
  danger = false;
  canSeeBilling = false;

  constructor(private entitlement: EntitlementService, private destroyRef: DestroyRef) {}

  /** Test helper: forget the dismissed message. */
  static resetDismissed() { LicenseBannerComponent.dismissed = null; }

  ngOnInit() {
    this.entitlement.access$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(a => this.apply(a));
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    interval(PERIODIC_REFRESH_MS).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.entitlement.refreshIfStale(PERIODIC_REFRESH_MS));
  }

  @HostListener('window:focus')
  onWindowFocus() {
    this.entitlement.refreshIfStale(FOCUS_REFRESH_MS);
  }

  get visible(): boolean {
    return !!this.text && this.text !== LicenseBannerComponent.dismissed;
  }

  dismiss() {
    LicenseBannerComponent.dismissed = this.text;
  }

  private apply(access: MyAccess | null) {
    this.text = access?.License.Banner?.trim() || null;
    this.danger = !!access && DANGER_STATES.includes(access.License.State);
    this.canSeeBilling = !!access?.Modules.Billing?.View;
  }
}
