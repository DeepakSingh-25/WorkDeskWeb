import { Component, ChangeDetectionStrategy, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, finalize, forkJoin } from 'rxjs';
import { NotificationsService } from '../services/notifications.service';
import { DrpcommonService } from '../services/DrpCommon/drpcommon.service';
import { UserProfileService } from '../services/User-Profile/user-profile.service';
import { LoaderService } from '../services/Loader/loader.service';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoError, ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { ProfileResponse, ProfileSaveResponse, UpdateProfileRequest } from '../Interface/user-profile';
import { CityItem, CountryItem, StateItem } from '../Interface/drpcommon';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const PHOTO_TOO_LARGE = 'Image must be 2 MB or smaller.';
const ACCOUNT_NOT_FOUND = 'Your account could not be found. Please sign in again.';

// API field -> form control (for server-side 400 Errors)
const SERVER_FIELD_MAP: Record<string, string> = {
  FullName: 'txtFullName',
  PhoneNumber: 'txtPhone',
  CompanyName: 'txtCompanyName',
  AddressLine: 'txtAddress',
  CountryID: 'drpCountry',
  StateID: 'drpState',
  CityID: 'drpCity',
  PinCode: 'txtPinCode',
};

// Required, and not whitespace-only.
export function trimmedRequired(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return value == null || String(value).trim() === '' ? { required: true } : null;
}

// Min length measured on the trimmed value (empty is left to the required validator).
export function trimmedMinLength(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value == null ? '' : String(control.value).trim();
    return value.length > 0 && value.length < min
      ? { minlength: { requiredLength: min, actualLength: value.length } }
      : null;
  };
}

@Component({
  selector: 'app-user-profile',
  standalone: false,
  templateUrl: './user-profile.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './user-profile.component.css'
})
export class UserProfileComponent implements OnInit {

  userProfileForm: FormGroup;
  submitted = false;
  loading = false;
  saving = false;
  photoBusy = false;

  countryData: CountryItem[] = [];
  stateData: StateItem[] = [];
  cityData: CityItem[] = [];

  photo: string | null = null;

  private stateSub?: Subscription;
  private citySub?: Subscription;
  // Ids the current stateData / cityData were requested for (avoids re-fetching after save).
  private loadedCountryId: number | null = null;
  private loadedStateId: number | null = null;

  constructor(
    private notificationsService: NotificationsService,
    private fb: FormBuilder,
    private drpcommonservice: DrpcommonService,
    private userProfileService: UserProfileService,
    private loaderService: LoaderService,
    private authService: AuthService,
    private router: Router,
    public photoService: ProfilePhotoService,
    private destroyRef: DestroyRef
  ) {
    this.photoService.photo$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => this.photo = p);
    this.userProfileForm = this.fb.group({
      txtFullName: new FormControl('', [trimmedRequired, trimmedMinLength(2), Validators.maxLength(100)]),
      txtEmail: new FormControl({ value: '', disabled: true }),
      txtPhone: new FormControl('', [Validators.pattern(/^[6-9]\d{9}$/)]),
      txtCompanyName: new FormControl('', [trimmedRequired, Validators.maxLength(50)]),
      txtAddress: new FormControl('', [trimmedRequired, Validators.maxLength(100)]),
      drpCountry: new FormControl<number | null>(null, [Validators.required]),
      drpState: new FormControl<number | null>(null, [Validators.required]),
      drpCity: new FormControl<number | null>(null, [Validators.required]),
      txtPinCode: new FormControl('', [Validators.required, Validators.pattern(/^\d{6}$/)]),
    });
  }

  ngOnInit(): void {
    this.photoService.refresh();
    this.loadProfile();
  }

  // Profile + country list together, so the loader stays up until both arrive.
  loadProfile(): void {
    this.loading = true;
    this.loaderService.showLoader();
    this.userProfileForm.disable({ emitEvent: false });
    forkJoin({
      profile: this.userProfileService.getProfile(),
      countries: this.drpcommonservice.getcountryList(),
    }).pipe(
      finalize(() => {
        this.loading = false;
        this.loaderService.hideLoader();
        this.userProfileForm.enable({ emitEvent: false });
        this.userProfileForm.controls['txtEmail'].disable({ emitEvent: false });
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: ({ profile, countries }) => {
        this.countryData = countries ?? [];
        this.patchProfile(profile);
        // First visit with a single country: preselect it.
        if (!profile.CountryID && this.countryData.length === 1) {
          const onlyId = this.countryData[0].ID;
          this.userProfileForm.controls['drpCountry'].setValue(onlyId, { emitEvent: false });
          this.loadStates(onlyId);
        }
      },
      error: (err: HttpErrorResponse) => {
        if (!this.handleAuthError(err)) {
          this.notificationsService.showNotification('error', GENERIC_ERROR);
        }
      }
    });
  }

  onCountryChange(id: number | null | undefined): void {
    this.stateSub?.unsubscribe();
    this.citySub?.unsubscribe();
    this.userProfileForm.patchValue({ drpState: null, drpCity: null });
    this.stateData = [];
    this.cityData = [];
    this.loadedCountryId = null;
    this.loadedStateId = null;
    if (id) this.loadStates(id);
  }

  onStateChange(id: number | null | undefined): void {
    this.citySub?.unsubscribe();
    this.userProfileForm.patchValue({ drpCity: null });
    this.cityData = [];
    this.loadedStateId = null;
    if (id) this.loadCities(id);
  }

  onSave(): void {
    this.submitted = true;
    if (this.userProfileForm.invalid || this.saving || this.loading) {
      this.userProfileForm.markAllAsTouched();
      return;
    }
    const v = this.userProfileForm.getRawValue();
    const phone = String(v.txtPhone ?? '').trim();
    const request: UpdateProfileRequest = {
      FullName: String(v.txtFullName ?? '').trim(),
      PhoneNumber: phone === '' ? null : phone,
      CompanyName: String(v.txtCompanyName ?? '').trim(),
      AddressLine: String(v.txtAddress ?? '').trim(),
      CountryID: v.drpCountry,
      StateID: v.drpState,
      CityID: v.drpCity,
      PinCode: String(v.txtPinCode ?? '').trim(),
    };

    this.saving = true;
    this.userProfileService.updateProfile(request).pipe(
      finalize(() => this.saving = false),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => {
        if (res?.Success && res.Profile) {
          this.notificationsService.showNotification('success', res.Message);
          this.patchProfile(res.Profile);
          this.userProfileForm.markAsPristine();
          this.submitted = false;
          this.authService.setFullName(res.Profile.FullName);
        } else {
          this.notificationsService.showNotification('error', res?.Message || GENERIC_ERROR);
        }
      },
      error: (err: HttpErrorResponse) => this.handleSaveError(err)
    });
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file || this.photoBusy) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      this.notificationsService.showNotification('error', 'Please choose a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.notificationsService.showNotification('error', PHOTO_TOO_LARGE);
      return;
    }
    this.photoBusy = true;
    try {
      const message = await this.photoService.save(file);
      this.notificationsService.showNotification('success', message);
    } catch (e) {
      this.handlePhotoError(e);
    } finally {
      this.photoBusy = false;
    }
  }

  async removePhoto(): Promise<void> {
    if (this.photoBusy) return;
    this.photoBusy = true;
    try {
      const message = await this.photoService.remove();
      this.notificationsService.showNotification('success', message);
    } catch (e) {
      this.handlePhotoError(e);
    } finally {
      this.photoBusy = false;
    }
  }

  // Server message for a control, shown only when there is no client-side error.
  serverError(name: string): string | null {
    const errors = this.userProfileForm.controls[name]?.errors;
    if (!errors || typeof errors['server'] !== 'string') return null;
    return Object.keys(errors).length === 1 ? errors['server'] : null;
  }

  showError(name: string): boolean {
    const c = this.userProfileForm.controls[name];
    return !!c && c.invalid && (c.touched || this.submitted);
  }

  private patchProfile(p: ProfileResponse): void {
    this.userProfileForm.patchValue({
      txtFullName: p.FullName ?? '',
      txtEmail: p.Email ?? '',
      txtPhone: p.PhoneNumber ?? '',
      txtCompanyName: p.CompanyName ?? '',
      txtAddress: p.AddressLine ?? '',
      drpCountry: p.CountryID,
      drpState: p.StateID,
      drpCity: p.CityID,
      txtPinCode: p.PinCode ?? '',
    }, { emitEvent: false });
    // Only (re)load lookups whose parent id changed; the initial load always loads them.
    if (p.CountryID && p.CountryID !== this.loadedCountryId) this.loadStates(p.CountryID);
    if (p.StateID && p.StateID !== this.loadedStateId) this.loadCities(p.StateID);
  }

  private loadStates(countryId: number): void {
    this.stateSub?.unsubscribe();
    this.loadedCountryId = countryId;
    this.stateSub = this.drpcommonservice.getstateList(countryId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => this.stateData = data ?? [],
        error: (err: HttpErrorResponse) => {
          this.loadedCountryId = null;
          this.handleLookupError(err);
        }
      });
  }

  private loadCities(stateId: number): void {
    this.citySub?.unsubscribe();
    this.loadedStateId = stateId;
    this.citySub = this.drpcommonservice.getcityList(stateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => this.cityData = data ?? [],
        error: (err: HttpErrorResponse) => {
          this.loadedStateId = null;
          this.handleLookupError(err);
        }
      });
  }

  private handleSaveError(err: HttpErrorResponse): void {
    if (this.handleAuthError(err)) return;
    if (err.status === 400) {
      const body = err.error as Partial<ProfileSaveResponse> | null;
      if (body && body.Success === false) {
        this.notificationsService.showNotification('error', body.Message || 'Please check the form and try again.');
        this.applyServerErrors(body.Errors ?? null);
      } else {
        // ASP.NET ProblemDetails (model binding) — no Success field
        this.notificationsService.showNotification('error', 'Please check the form and try again.');
      }
      return;
    }
    this.notificationsService.showNotification('error', GENERIC_ERROR);
  }

  private applyServerErrors(errors: Record<string, string[]> | null): void {
    if (!errors) return;
    for (const [field, msgs] of Object.entries(errors)) {
      const control = this.userProfileForm.get(SERVER_FIELD_MAP[field] ?? '');
      if (!control || !msgs?.length) continue;
      control.setErrors({ ...control.errors, server: msgs[0] });
      control.markAsTouched();
    }
  }

  private handleLookupError(err: HttpErrorResponse): void {
    if (err.status === 401) {
      this.signOut();
      return;
    }
    this.notificationsService.showNotification('error', GENERIC_ERROR);
  }

  private handlePhotoError(e: unknown): void {
    if (e instanceof ProfilePhotoError && e.status === 401) {
      this.signOut();
      return;
    }
    if (e instanceof ProfilePhotoError && e.status === 404) {
      this.notificationsService.showNotification('error', ACCOUNT_NOT_FOUND);
      this.signOut();
      return;
    }
    const message = e instanceof Error && e.message ? e.message : 'Could not update the photo. Please try again.';
    this.notificationsService.showNotification('error', message);
  }

  // 401 -> sign out; 404 (account missing / inactive) -> explain, then sign out.
  private handleAuthError(err: HttpErrorResponse): boolean {
    if (err.status === 401) {
      this.signOut();
      return true;
    }
    if (err.status === 404) {
      this.notificationsService.showNotification('error', ACCOUNT_NOT_FOUND);
      this.signOut();
      return true;
    }
    return false;
  }

  private signOut(): void {
    this.photoService.clear();
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
