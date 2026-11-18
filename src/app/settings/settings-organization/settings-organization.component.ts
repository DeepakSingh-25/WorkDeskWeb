import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { OrgLogoSaveResponse, OrgSaveResponse, OrgSettings, UpdateOrgRequest } from '../../Interface/settings';
import { CountryItem } from '../../Interface/drpcommon';
import { SettingsService } from '../../services/Settings/settings.service';
import { DrpcommonService } from '../../services/DrpCommon/drpcommon.service';
import { AuthService } from '../../services/Auth/auth.service';
import { ProfilePhotoService } from '../../services/User-Profile/profile-photo.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { SettingsUi } from '../settings-ui';

const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_TOO_LARGE = 'Logo must be 1 MB or smaller.';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const ADMIN_ONLY = 'Only admins can change these settings.';
const CONFLICT = 'These settings were changed by someone else. Reload to see the latest values.';

// API field (request / Errors key) -> form control
const SERVER_FIELD_MAP: Record<string, string> = {
  Name: 'txtName',
  Website: 'txtWebsite',
  Industry: 'drpIndustry',
  Size: 'drpSize',
  AddressLine: 'txtAddress',
  City: 'txtCity',
  State: 'txtState',
  CountryID: 'drpCountry',
  PostalCode: 'txtPostalCode',
  Timezone: 'drpTimezone',
  DateFormat: 'drpDateFormat',
  Currency: 'drpCurrency',
  WeekStart: 'drpWeekStart',
  FiscalYearStart: 'drpFiscalStart',
  DefaultVisibility: 'drpVisibility',
  TaskIdStyle: 'drpTaskIdStyle',
  WorkingDays: 'WorkingDays',
  WorkStart: 'txtWorkStart',
  WorkEnd: 'txtWorkEnd',
  PrimaryColor: 'PrimaryColor',
};

// Client-side message per control (same wording as the API, spec 003 §4)
const FIELD_MESSAGES: Record<string, string> = {
  txtName: 'Organization Name is Required',
  drpCountry: 'Country is Required',
  txtWebsite: 'Enter a valid web address starting with http(s)://',
  txtPostalCode: 'Invalid postal code',
  drpTimezone: 'Choose a time zone',
  txtWorkStart: 'Enter a start time',
  txtWorkEnd: 'Enter an end time',
};

// Controls hidden behind a collapsed section — expanded when they carry an error.
const PROFILE_MORE = ['txtWebsite', 'drpIndustry', 'drpSize', 'txtAddress', 'txtCity', 'txtState', 'txtPostalCode'];
const REGIONAL_MORE = ['drpCurrency', 'drpWeekStart', 'drpFiscalStart'];
const ADVANCED = ['drpVisibility', 'drpTaskIdStyle', 'PrimaryColor'];

@Component({
    selector: 'app-settings-organization',
    templateUrl: './settings-organization.component.html',
    styleUrl: './settings-organization.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsOrganizationComponent implements OnInit, OnDestroy {
  ui = SettingsUi;
  faCircleInfo = faCircleInfo;
  orgForm: FormGroup;
  loaded = false;
  loadError = '';
  saving = false;
  canEdit = false;
  logoError = '';
  logoBusy = false;
  hasLogo = false;
  logoUrl: string | null = null;    // object URL of the logo blob
  showMoreProfile = false;
  showMoreRegional = false;
  showAdvanced = false;

  countries: CountryItem[] = [];
  industries = ['Information Technology', 'Financial Services', 'Healthcare', 'Manufacturing', 'Retail & E-commerce', 'Education', 'Consulting', 'Government', 'Other'];
  sizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
  timezones = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
  dateFormats = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];
  currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];
  months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  taskIdStyles = [
    { Value: 'PROJECT-123', Label: 'Project prefix + number', Example: 'CRM-142' },
    { Value: 'PROJECT-YY-123', Label: 'Prefix + year + number', Example: 'CRM-26-142' },
    { Value: '#123', Label: 'Global number', Example: '#4821' },
    { Value: 'T-123', Label: 'Generic "T" prefix', Example: 'T-4821' },
  ];
  swatches = ['#0043E0', '#7A3FE4', '#0E9AA7', '#029848', '#C77800', '#E0401C', '#D6336C', '#1F2937'];

  // Server (400) messages keyed by control name. Kept OUT of control.errors: Angular re-runs validators
  // when a collapsed section renders its controls (addControl -> updateValueAndValidity), which would
  // wipe setErrors({ server }). Cleared per control on valueChanges and on every applyOrg().
  serverErrors: Record<string, string> = {};

  private version = '';
  private lastOrg: OrgSettings | null = null; // last applied server values (Discard re-applies them)
  private logoStamp: string | null = null;   // LogoUpdatedAt the current logoUrl belongs to
  private loadSub?: Subscription;
  private logoSub?: Subscription;

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private drpcommonService: DrpcommonService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private authService: AuthService,
    private photoService: ProfilePhotoService,
    private router: Router,
    private destroyRef: DestroyRef
  ) {
    this.orgForm = this.fb.group({
      txtName: new FormControl('', [Validators.required, Validators.maxLength(100)]),
      txtWebsite: new FormControl('', [Validators.pattern(/^https?:\/\/[^\s]+\.[^\s]+$/i)]),
      drpIndustry: new FormControl(''),
      drpSize: new FormControl(''),
      txtAddress: new FormControl(''),
      txtCity: new FormControl(''),
      txtState: new FormControl(''),
      drpCountry: new FormControl<number | null>(null, [Validators.required]),
      txtPostalCode: new FormControl('', [Validators.pattern(/^[A-Za-z0-9 -]{3,10}$/)]),
      drpTimezone: new FormControl('', [Validators.required]),
      drpDateFormat: new FormControl(''),
      drpCurrency: new FormControl(''),
      drpWeekStart: new FormControl(''),
      drpFiscalStart: new FormControl(''),
      drpVisibility: new FormControl(''),
      drpTaskIdStyle: new FormControl(''),
      WorkingDays: new FormControl<string[]>([]),
      txtWorkStart: new FormControl('', [Validators.required]),
      txtWorkEnd: new FormControl('', [Validators.required]),
      PrimaryColor: new FormControl('#0043E0'),
    });
    // User edits a field -> its server message is stale. (addControl re-validates with emitEvent: false,
    // so opening a collapsed section does not fire this.)
    for (const [name, control] of Object.entries(this.orgForm.controls)) {
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (name in this.serverErrors) delete this.serverErrors[name];
      });
    }
  }

  ngOnInit() {
    this.loadCountries();
    this.load();
  }

  ngOnDestroy() {
    this.logoSub?.unsubscribe();
    this.setLogo(null);
  }

  load() {
    this.loadSub?.unsubscribe();
    this.loaderService.showLoader();
    this.loadSub = this.settingsService.getOrganization().pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: o => this.applyOrg(o),
      error: (err: HttpErrorResponse) => this.handleLoadError(err)
    });
  }

  // Raw value: disabled controls (read-only mode) must still drive the previews.
  get v() { return this.orgForm.getRawValue(); }

  // Message to show under a control: server message first (shown even when untouched),
  // else the client one after touched.
  fieldError(name: string): string | null {
    const server = this.serverErrors[name];
    if (server) return server;
    const c = this.orgForm.controls[name];
    if (!c || !c.touched || !c.invalid) return null;
    return FIELD_MESSAGES[name] ?? null;
  }

  get hoursInvalid(): boolean {
    return !!this.v.txtWorkStart && !!this.v.txtWorkEnd && this.v.txtWorkEnd <= this.v.txtWorkStart;
  }

  get workingHours(): string {
    if (!this.v.txtWorkStart || !this.v.txtWorkEnd || this.hoursInvalid) return '—';
    const [h1, m1] = String(this.v.txtWorkStart).split(':').map(Number);
    const [h2, m2] = String(this.v.txtWorkEnd).split(':').map(Number);
    return this.ui.formatMinutes((h2 * 60 + m2) - (h1 * 60 + m1));
  }

  get taskIdExample(): string {
    return this.taskIdStyles.find(s => s.Value === this.v.drpTaskIdStyle)?.Example || '';
  }

  get datePreview(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0'), MM = String(d.getMonth() + 1).padStart(2, '0'), yyyy = String(d.getFullYear());
    const MMM = d.toLocaleString('en-GB', { month: 'short' });
    switch (this.v.drpDateFormat) {
      case 'dd/MM/yyyy': return `${dd}/${MM}/${yyyy}`;
      case 'MM/dd/yyyy': return `${MM}/${dd}/${yyyy}`;
      case 'yyyy-MM-dd': return `${yyyy}-${MM}-${dd}`;
      default: return `${dd} ${MMM} ${yyyy}`;
    }
  }

  toggleDay(day: string) {
    if (!this.canEdit) return;
    const days: string[] = this.v.WorkingDays || [];
    const next = days.includes(day) ? days.filter(d => d !== day) : this.ui.weekDays.filter(d => d === day || days.includes(d));
    this.orgForm.patchValue({ WorkingDays: next });
    this.orgForm.markAsDirty();
  }

  setColor(c: string) {
    if (!this.canEdit || !/^#[0-9a-f]{6}$/i.test(c)) return;
    // Native picker returns lower-case; API stores upper-case and the swatches are upper-case.
    const next = c.toUpperCase();
    if (next === String(this.v.PrimaryColor ?? '').toUpperCase()) return;
    this.orgForm.patchValue({ PrimaryColor: next });
    this.orgForm.markAsDirty();
  }

  // Logo is saved immediately (own endpoint) — it is not part of Save / Discard and never dirties the form.
  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file || !this.canEdit || this.logoBusy) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.logoError = 'Please choose a PNG, JPG or WEBP image.';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.logoError = LOGO_TOO_LARGE;
      return;
    }
    this.logoError = '';
    this.logoBusy = true;
    this.loaderService.showLoader();
    this.settingsService.uploadOrganizationLogo(file).pipe(
      // Normally ended in next/error (before any load()); this only covers teardown on destroy.
      finalize(() => { if (this.logoBusy) this.endLogoBusy(); }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.endLogoBusy();
        if (!res?.Success) {
          this.showLogoFailure(res?.Message || GENERIC_ERROR);
          return;
        }
        // Server stored these exact bytes — show them without a round trip.
        this.logoSub?.unsubscribe();
        this.hasLogo = res.HasLogo;
        this.logoStamp = res.LogoUpdatedAt;
        this.setLogo(file);
        this.rememberLogoState(res);
        this.notificationsService.showNotification('success', res.Message);
      },
      error: (err: HttpErrorResponse) => {
        this.endLogoBusy();
        this.handleLogoError(err);
      }
    });
  }

  removeLogo() {
    if (!this.canEdit || this.logoBusy) return;
    this.logoError = '';
    this.logoBusy = true;
    this.loaderService.showLoader();
    this.settingsService.deleteOrganizationLogo().pipe(
      finalize(() => { if (this.logoBusy) this.endLogoBusy(); }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.endLogoBusy();
        if (!res?.Success) {
          this.showLogoFailure(res?.Message || GENERIC_ERROR);
          return;
        }
        this.logoSub?.unsubscribe();
        this.hasLogo = false;
        this.logoStamp = null;
        this.setLogo(null);
        this.rememberLogoState(res);
        this.notificationsService.showNotification('success', res.Message);
      },
      error: (err: HttpErrorResponse) => {
        this.endLogoBusy();
        this.handleLogoError(err);
      }
    });
  }

  onSave() {
    if (!this.canEdit || this.saving) return;
    if (this.orgForm.invalid || this.hoursInvalid || !(this.v.WorkingDays || []).length) {
      this.orgForm.markAllAsTouched();
      this.expandSectionsWithErrors();
      this.notificationsService.showNotification('error', 'Please fix the highlighted fields');
      return;
    }
    const v = this.v;
    const request: UpdateOrgRequest = {
      Name: String(v.txtName ?? '').trim(), Website: v.txtWebsite, Industry: v.drpIndustry, Size: v.drpSize,
      AddressLine: v.txtAddress, City: v.txtCity, State: v.txtState, CountryID: v.drpCountry, PostalCode: v.txtPostalCode,
      Timezone: v.drpTimezone, DateFormat: v.drpDateFormat, Currency: v.drpCurrency, WeekStart: v.drpWeekStart,
      FiscalYearStart: v.drpFiscalStart, DefaultVisibility: v.drpVisibility, TaskIdStyle: v.drpTaskIdStyle,
      WorkingDays: v.WorkingDays, WorkStart: v.txtWorkStart, WorkEnd: v.txtWorkEnd, PrimaryColor: v.PrimaryColor,
      Version: this.version
    };
    this.saving = true;
    this.orgForm.disable({ emitEvent: false }); // no edits while the request is in flight
    this.loaderService.showLoader();
    this.settingsService.saveOrganization(request).pipe(
      // Normally ended in next/error (before any load()); this only covers teardown on destroy.
      finalize(() => { if (this.saving) this.endSaving(); }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.endSaving();
        if (res?.Success && res.Organization) {
          this.notificationsService.showNotification('success', res.Message);
          // Show what was saved (the API normalises e.g. Website).
          this.applyOrg(res.Organization);
        } else {
          this.notificationsService.showNotification('error', res?.Message || GENERIC_ERROR);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.endSaving();
        this.handleSaveError(err);
      }
    });
  }

  onDiscard() {
    this.notificationsService.showConfirm('Discard all unsaved changes?').then(ok => {
      if (!ok) return;
      if (this.lastOrg) this.applyOrg(this.lastOrg);
      else this.load();
    });
  }

  // Hide the loader and re-enable the form (per CanEdit). Called before any follow-up load()
  // so its showLoader() is not cancelled by this request's hide (the loader is a single boolean).
  private endSaving() {
    this.saving = false;
    this.loaderService.hideLoader();
    if (this.canEdit) this.orgForm.enable({ emitEvent: false });
  }

  private endLogoBusy() {
    this.logoBusy = false;
    this.loaderService.hideLoader();
  }

  // Keep Discard (which re-applies lastOrg) from bringing back an old logo state.
  private rememberLogoState(res: OrgLogoSaveResponse) {
    if (this.lastOrg) this.lastOrg = { ...this.lastOrg, HasLogo: res.HasLogo, LogoUpdatedAt: res.LogoUpdatedAt };
  }

  private loadCountries() {
    this.drpcommonService.getcountryList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => this.countries = data ?? [],
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) { this.endSession(); return; }
        this.notificationsService.showNotification('error', 'Could not load the country list. Please try again.');
      }
    });
  }

  private applyOrg(o: OrgSettings) {
    this.orgForm.reset({
      txtName: o.Name, txtWebsite: o.Website ?? '', drpIndustry: o.Industry ?? '', drpSize: o.Size ?? '',
      txtAddress: o.AddressLine ?? '', txtCity: o.City ?? '', txtState: o.State ?? '', drpCountry: o.CountryID,
      txtPostalCode: o.PostalCode ?? '', drpTimezone: o.Timezone, drpDateFormat: o.DateFormat, drpCurrency: o.Currency,
      drpWeekStart: o.WeekStart, drpFiscalStart: o.FiscalYearStart, drpVisibility: o.DefaultVisibility,
      drpTaskIdStyle: o.TaskIdStyle, WorkingDays: o.WorkingDays ?? [], txtWorkStart: o.WorkStart, txtWorkEnd: o.WorkEnd,
      PrimaryColor: o.PrimaryColor
    });
    this.lastOrg = o;
    this.serverErrors = {};
    this.version = o.Version;
    this.canEdit = !!o.CanEdit;
    if (this.canEdit) this.orgForm.enable({ emitEvent: false });
    else this.orgForm.disable({ emitEvent: false });
    this.syncLogo(!!o.HasLogo, o.LogoUpdatedAt ?? null);
    this.logoError = '';
    this.loadError = '';
    this.loaded = true;
  }

  // Fetch the logo blob only when it changed (LogoUpdatedAt) or is not loaded yet.
  private syncLogo(hasLogo: boolean, stamp: string | null) {
    this.hasLogo = hasLogo;
    if (!hasLogo) {
      this.logoSub?.unsubscribe();
      this.logoStamp = null;
      this.setLogo(null);
      return;
    }
    if (this.logoUrl && stamp === this.logoStamp) return;
    this.logoSub?.unsubscribe();
    this.logoStamp = stamp;
    this.logoSub = this.settingsService.getOrganizationLogo().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => this.setLogo(blob),
      error: (err: HttpErrorResponse) => {
        this.logoStamp = null; // retry on the next load; the initials tile shows meanwhile
        if (err.status === 401) this.endSession();
      }
    });
  }

  private setLogo(blob: Blob | null) {
    if (this.logoUrl) URL.revokeObjectURL(this.logoUrl);
    this.logoUrl = blob ? URL.createObjectURL(blob) : null;
  }

  private handleLoadError(err: HttpErrorResponse) {
    if (err.status === 401) {
      this.endSession();
      return;
    }
    const message = err.status === 404
      ? 'Organization settings are not set up yet. Please contact your administrator.'
      : 'Could not load organization settings. Please try again.';
    this.notificationsService.showNotification('error', message);
    if (!this.loaded) this.loadError = message;
  }

  private handleSaveError(err: HttpErrorResponse) {
    if (err.status === 401) {
      this.endSession();
      return;
    }
    if (err.status === 403) {
      // Admin rights gone: reload -> GET returns CanEdit=false -> read-only page.
      this.notificationsService.showNotification('error', ADMIN_ONLY);
      this.load();
      return;
    }
    const body = this.saveBody(err);
    if (err.status === 400) {
      if (body) {
        this.notificationsService.showNotification('error', body.Message || 'Please fix the highlighted fields');
        this.applyServerErrors(body.Errors ?? null);
        // Bad / missing Version: the page is stale — fetch a fresh Version.
        if (body.Errors?.['Version']?.length) this.load();
      } else {
        // ASP.NET ProblemDetails (model binding) — no Success field
        this.notificationsService.showNotification('error', 'Please check the form and try again.');
      }
      return;
    }
    if (err.status === 409) {
      this.notificationsService.showNotification('error', body?.Message || CONFLICT);
      // The 409 body carries the current values (and Version) — no extra GET needed.
      if (body?.Organization) this.applyOrg(body.Organization);
      else this.load();
      return;
    }
    this.notificationsService.showNotification('error', body?.Message || GENERIC_ERROR);
  }

  // Only trust the body when it is our OrgSaveResponse shape (a routing 404 / ProblemDetails is not).
  private saveBody(err: HttpErrorResponse): OrgSaveResponse | null {
    const body = err.error as Partial<OrgSaveResponse> | null;
    return body && typeof body === 'object' && body.Success === false ? body as OrgSaveResponse : null;
  }

  private applyServerErrors(errors: Record<string, string[]> | null) {
    if (!errors) return;
    const next: Record<string, string> = {};
    const unmapped: string[] = [];
    for (const [field, msgs] of Object.entries(errors)) {
      if (!msgs?.length) continue;
      const name = SERVER_FIELD_MAP[field];
      if (!name || !this.orgForm.controls[name]) {
        unmapped.push(msgs[0]); // e.g. Version: "Reload the page and try again"
        continue;
      }
      next[name] = msgs[0];
    }
    this.serverErrors = next;
    this.expandSectionsWithErrors();
    if (unmapped.length) this.notificationsService.showNotification('error', unmapped.join(' '));
  }

  private expandSectionsWithErrors() {
    const hasError = (names: string[]) => names.some(n => !!this.serverErrors[n] || this.orgForm.controls[n]?.invalid);
    if (hasError(PROFILE_MORE)) this.showMoreProfile = true;
    if (hasError(REGIONAL_MORE)) this.showMoreRegional = true;
    if (hasError(ADVANCED)) this.showAdvanced = true;
  }

  private handleLogoError(err: HttpErrorResponse) {
    if (err.status === 401) {
      this.endSession();
      return;
    }
    if (err.status === 403) {
      this.showLogoFailure(ADMIN_ONLY);
      this.load(); // GET returns CanEdit=false -> read-only page
      return;
    }
    const body = err.error as Partial<OrgLogoSaveResponse> | null;
    const apiMessage = body && typeof body === 'object' && body.Success === false ? body.Message : undefined;
    if (err.status === 413) {
      this.showLogoFailure(apiMessage || LOGO_TOO_LARGE);
      return;
    }
    this.showLogoFailure(apiMessage || 'Could not update the logo. Please try again.');
  }

  private showLogoFailure(message: string) {
    this.logoError = message;
    this.notificationsService.showNotification('error', message);
  }

  // 401: end the session and go to /login (dashboard after sign-in). AuthInterceptor normally does this
  // already and navigates first — then don't navigate a second time (same as ChangepasswordComponent).
  private endSession() {
    this.photoService.clear();
    this.authService.logout();
    const current = this.router.url.split('?')[0];
    if (this.router.currentNavigation() || current.startsWith('/login')) return;
    this.router.navigate(['/login']);
  }
}
