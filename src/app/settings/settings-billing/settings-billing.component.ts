import { Component, ChangeDetectionStrategy, DestroyRef, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { faCopy, faLock, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import {
  CONFIRM_DOWNGRADE_CODE, LicenseActionResponse, LicenseImpacts, LicenseState, SubscriptionInfo, SubscriptionModule
} from '../../Interface/access';
import { SubscriptionService } from '../../services/Settings/subscription.service';
import { EntitlementService } from '../../services/Access/entitlement.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { SettingsUi } from '../settings-ui';

/** Server limit is 16 KB of license text (spec 005 §5.5 L1); checked here only for a friendlier message. */
const MAX_LICENSE_BYTES = 16 * 1024;
const GENERIC_ERROR = 'Could not install the license. Please try again.';

/**
 * Settings › Plan & License (spec 005 §8.3): plan, validity, seats, Installation ID, modules, license card,
 * and "Upload license" (S3) with the downgrade confirmation (409 CONFIRM_DOWNGRADE → resend with ConfirmDowngrade).
 */
@Component({
    selector: 'app-settings-billing',
    templateUrl: './settings-billing.component.html',
    styleUrl: './settings-billing.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsBillingComponent implements OnInit {
  ui = SettingsUi;
  faCopy = faCopy;
  faLock = faLock;
  faWarn = faTriangleExclamation;

  @ViewChild('licenseFile') licenseFile?: ElementRef<HTMLInputElement>;

  info: SubscriptionInfo | null = null;
  loadError = '';
  canUpload = false;

  uploading = false;
  uploadError = '';
  /** Set while the downgrade confirmation is open; the text is resent with ConfirmDowngrade: true. */
  impacts: LicenseImpacts | null = null;
  impactsMessage = '';
  private pendingText: string | null = null;
  private destroyed = false;

  constructor(
    private subscriptionService: SubscriptionService,
    private entitlement: EntitlementService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => this.destroyed = true);
  }

  ngOnInit() {
    this.entitlement.access$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => { if (a) this.canUpload = this.entitlement.can('Billing', 'Edit'); });
    // A1 failed and nothing known → show the button; the server (Billing.Edit) still decides.
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.canUpload = this.entitlement.current() ? this.entitlement.can('Billing', 'Edit') : true);
    this.load();
  }

  load() {
    this.loadError = '';
    this.loaderService.showLoader();
    this.subscriptionService.getSubscription().pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => this.info = res,
      error: (err: HttpErrorResponse) => this.loadError = err?.status === 403
        ? "You don't have permission to view the plan and license."
        : 'Could not load your plan and license.'
    });
  }

  // ---------- upload (S3) ----------

  chooseFile() {
    if (this.uploading) return;
    this.licenseFile?.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';                    // same file can be picked again after a fix
    if (!file) return;
    this.uploadError = '';
    if (file.size > MAX_LICENSE_BYTES) { this.uploadError = 'This file is too big to be a WorkDesk license.'; return; }

    const reader = new FileReader();
    reader.onload = () => { if (!this.destroyed) this.send(typeof reader.result === 'string' ? reader.result : '', false); };
    reader.onerror = () => { if (!this.destroyed) this.uploadError = 'Could not read the file.'; };
    reader.readAsText(file);
  }

  confirmDowngrade() {
    const text = this.pendingText;
    this.closeDowngrade();
    if (text !== null) this.send(text, true);
  }

  @HostListener('document:keydown.escape')
  closeDowngrade() {
    this.impacts = null;
    this.impactsMessage = '';
    this.pendingText = null;
  }

  /** Plain-language lines for the confirmation (§8.3). */
  impactLines(i: LicenseImpacts): string[] {
    const lines: string[] = [];
    if (i.PlanFrom !== i.PlanTo) lines.push(`Plan changes from ${i.PlanFrom || 'none'} to ${i.PlanTo}.`);
    if (i.ModulesRemoved.length) {
      lines.push(`${i.ModulesRemoved.join(', ')} will be locked. Your data is kept and comes back after an upgrade.`);
    }
    if (i.SeatsTo < i.SeatsFrom || i.SeatsUsed > i.SeatsTo) {
      const over = i.SeatsUsed > i.SeatsTo ? ': no new users until you are under the limit' : '';
      lines.push(`Seats go from ${i.SeatsFrom} to ${i.SeatsTo}, ${i.SeatsUsed} in use${over}.`);
    }
    return lines;
  }

  private send(text: string, confirm: boolean) {
    this.uploading = true;
    this.uploadError = '';
    this.loaderService.showLoader();
    this.subscriptionService.uploadLicense(text, confirm).pipe(
      finalize(() => { this.uploading = false; this.loaderService.hideLoader(); }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => this.onUploadResult(res, text),
      error: (err: HttpErrorResponse) => this.uploadError = this.uploadErrorText(err)
    });
  }

  private onUploadResult(res: LicenseActionResponse, text: string) {
    if (res.Success) {
      this.notificationsService.showNotification('success', res.Message || 'License installed.');
      this.load();
      this.entitlement.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      return;
    }
    if (res.Code === CONFIRM_DOWNGRADE_CODE && res.Impacts) {
      this.pendingText = text;
      this.impacts = res.Impacts;
      this.impactsMessage = res.Message;
      return;
    }
    this.uploadError = res.Errors?.['LicenseText']?.[0] || res.Message || GENERIC_ERROR;
  }

  private uploadErrorText(err: HttpErrorResponse): string {
    if (err?.status === 403) return "You don't have permission to upload a license.";
    if (err?.status === 413) return 'This file is too big to be a WorkDesk license.';
    if (err?.status === 0) return 'Could not reach the server. Check your connection and try again.';
    const body: unknown = err?.error;
    const message = body && typeof body === 'object' ? (body as { Message?: unknown }).Message : null;
    return typeof message === 'string' && message ? message : GENERIC_ERROR;
  }

  // ---------- view helpers ----------

  get seatPct(): number {
    const i = this.info;
    return i && i.Seats > 0 ? Math.min(100, Math.round(i.SeatsUsed / i.Seats * 100)) : 0;
  }

  get seatsOver(): boolean { return !!this.info && this.info.SeatsUsed > this.info.Seats; }

  stateLabel(i: SubscriptionInfo): string {
    if (i.IsTrial && (i.State === 'Active' || i.State === 'Grace')) return 'Trial';
    switch (i.State) {
      case 'Active': return 'Active';
      case 'Grace': return 'Expired · grace period';
      case 'Expired': return 'Expired';
      case 'NotYetValid': return 'Not started yet';
      case 'Invalid': return 'Not valid';
      default: return 'No license';
    }
  }

  stateClass(state: LicenseState): string {
    switch (state) {
      case 'Active': return 'st-completed';
      case 'Grace': return 'st-pending';
      default: return 'st-cancelled';
    }
  }

  /** Limit text for the modules table (only where a limit applies). */
  limitText(m: SubscriptionModule): string {
    const l = this.info?.Limits;
    if (!l || !m.InPlan) return '';
    if (m.Module === 'Projects') return l.MaxProjects ? `Up to ${l.MaxProjects} projects` : 'Unlimited projects';
    if (m.Module === 'Workspace') return l.StorageGB ? `${l.StorageGB} GB storage` : 'Unlimited storage';
    return '';
  }

  copyInstallationId() {
    const id = this.info?.InstallationID;
    if (!id) return;
    navigator.clipboard?.writeText(id).then(
      () => this.notificationsService.showNotification('success', 'Installation ID copied'),
      () => this.notificationsService.showNotification('error', 'Could not copy the Installation ID')
    );
  }
}
