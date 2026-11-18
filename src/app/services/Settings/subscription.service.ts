import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LicenseActionResponse, PlanCatalogItem, SubscriptionInfo, UploadLicenseRequest } from '../../Interface/access';

/** S1–S4 routes (API spec 005 §6). Kept together so a contract change is a one-line edit. */
const SUBSCRIPTION_URL = `${environment.baseUrl}Subscription`;
const PLANS_URL = `${SUBSCRIPTION_URL}/plans`;
const LICENSE_URL = `${SUBSCRIPTION_URL}/license`;

/** S3 statuses whose body is a `LicenseActionResponse` (validation L1–L8 = 400, downgrade L9 = 409). */
const LICENSE_RESPONSE_STATUSES = [400, 409];

function isLicenseActionResponse(body: unknown): body is LicenseActionResponse {
  return !!body && typeof body === 'object' && (body as { Success?: unknown }).Success === false
    && typeof (body as { Message?: unknown }).Message === 'string';
}

/**
 * Settings › Plan & License (API spec 005 §6.2–§6.5).
 * Old billing mock in SettingsService (getSubscription / getPlans / changePlan / addSeats) is untouched.
 */
@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  constructor(private http: HttpClient) {}

  /** S2 — the installed license, seats and which modules are included. Billing.View only (403 otherwise). */
  getSubscription(): Observable<SubscriptionInfo> {
    return this.http.get<SubscriptionInfo>(SUBSCRIPTION_URL);
  }

  /** S4 — plan catalog for "Available in …" (no prices). */
  getPlanCatalog(): Observable<PlanCatalogItem[]> {
    return this.http.get<PlanCatalogItem[]>(PLANS_URL);
  }

  /**
   * S3 — upload / replace the license (`.lic` text, JSON body, not multipart — §6.3). Billing.Edit only.
   * 400 / 409 answers carry a `LicenseActionResponse` (`Errors.LicenseText`, `Code: CONFIRM_DOWNGRADE` + `Impacts`);
   * they are emitted as a normal value with `Success: false`, so the caller branches on `Success` / `Code`
   * like every other action. 403 / 413 / network errors stay errors.
   */
  uploadLicense(licenseText: string, confirmDowngrade = false): Observable<LicenseActionResponse> {
    const body: UploadLicenseRequest = { LicenseText: licenseText, ConfirmDowngrade: confirmDowngrade };
    return this.http.post<LicenseActionResponse>(LICENSE_URL, body).pipe(
      catchError((err: unknown) =>
        err instanceof HttpErrorResponse && LICENSE_RESPONSE_STATUSES.includes(err.status) && isLicenseActionResponse(err.error)
          ? of(err.error)
          : throwError(() => err))
    );
  }
}
