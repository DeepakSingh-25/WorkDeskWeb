import { Component, ChangeDetectionStrategy, ElementRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { NotificationsService } from '../services/notifications.service';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { ChangePasswordRequest, ChangePasswordResponse } from '../Interface/auth';

// Same rule as API AuthValidation.PasswordPattern.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const MAX_PASSWORD_LENGTH = 128;

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const ACCOUNT_NOT_FOUND = 'Your account was not found or is deactivated.';

type PasswordField = 'txtCurrentPassword' | 'txtNewPassword' | 'txtConfirmPassword';

// Form order — used to focus the first invalid field after a 400.
const FIELDS: { control: PasswordField; id: string }[] = [
  { control: 'txtCurrentPassword', id: 'currentPassword' },
  { control: 'txtNewPassword', id: 'newPassword' },
  { control: 'txtConfirmPassword', id: 'confirmPassword' },
];

// API field -> form control (for server-side 400 Errors)
const SERVER_FIELD_MAP: Record<string, PasswordField> = {
  CurrentPassword: 'txtCurrentPassword',
  NewPassword: 'txtNewPassword',
  ConfirmPassword: 'txtConfirmPassword',
};

// Group-level errors only — never setErrors on the children (that would wipe their own errors).
export const changePasswordGroupValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const current = group.get('txtCurrentPassword')?.value ?? '';
  const newPassword = group.get('txtNewPassword')?.value ?? '';
  const confirm = group.get('txtConfirmPassword')?.value ?? '';
  const errors: ValidationErrors = {};
  if (confirm && newPassword !== confirm) errors['passwordMismatch'] = true;
  if (current && newPassword && current === newPassword) errors['sameAsCurrent'] = true;
  return Object.keys(errors).length ? errors : null;
};

@Component({
  selector: 'app-changepassword',
  templateUrl: './changepassword.component.html',
  styleUrl: './changepassword.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ChangepasswordComponent {
  readonly faEye = faEye;
  readonly faEyeSlash = faEyeSlash;
  readonly maxLength = MAX_PASSWORD_LENGTH;

  changepasswordForm: FormGroup;
  submitted = false;
  saving = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private photoService: ProfilePhotoService,
    private notificationsService: NotificationsService,
    private router: Router,
    private host: ElementRef<HTMLElement>
  ) {
    this.changepasswordForm = this.fb.group({
      txtCurrentPassword: new FormControl('', [Validators.required, Validators.maxLength(MAX_PASSWORD_LENGTH)]),
      txtNewPassword: new FormControl('', [
        Validators.required,
        Validators.maxLength(MAX_PASSWORD_LENGTH),
        Validators.pattern(PASSWORD_PATTERN),
      ]),
      txtConfirmPassword: new FormControl('', [Validators.required, Validators.maxLength(MAX_PASSWORD_LENGTH)]),
    }, { validators: changePasswordGroupValidator });

    // Server errors are stale as soon as the user edits any field.
    this.changepasswordForm.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.clearServerErrors());
  }

  // Message to show under a field, or null. Server message wins over client messages.
  errorFor(name: PasswordField): string | null {
    const control = this.changepasswordForm.controls[name];
    if (!control || !(control.touched || this.submitted)) return null;
    const errors = control.errors;
    if (typeof errors?.['server'] === 'string') return errors['server'];

    switch (name) {
      case 'txtCurrentPassword':
        if (errors?.['required']) return 'Current password is required.';
        if (errors?.['maxlength']) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
        return null;
      case 'txtNewPassword':
        if (errors?.['required']) return 'New password is required.';
        if (errors?.['maxlength']) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
        if (errors?.['pattern']) {
          return 'Password must be at least 8 characters and contain an uppercase letter, a lowercase letter, a number and a special character (@$!%*?&).';
        }
        if (this.changepasswordForm.hasError('sameAsCurrent')) return 'New password must be different from the current password.';
        return null;
      case 'txtConfirmPassword':
        if (errors?.['required']) return 'Please confirm your new password.';
        if (errors?.['maxlength']) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
        if (this.changepasswordForm.hasError('passwordMismatch')) return 'Passwords do not match.';
        return null;
    }
  }

  toggleCurrentPassword(): void { this.showCurrentPassword = !this.showCurrentPassword; }
  toggleNewPassword(): void { this.showNewPassword = !this.showNewPassword; }
  toggleConfirmPassword(): void { this.showConfirmPassword = !this.showConfirmPassword; }

  onSave(): void {
    if (this.saving) return;
    this.submitted = true;
    if (this.changepasswordForm.invalid) {
      this.changepasswordForm.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    const value = this.changepasswordForm.getRawValue();
    const request: ChangePasswordRequest = {
      CurrentPassword: value.txtCurrentPassword,
      NewPassword: value.txtNewPassword,
      ConfirmPassword: value.txtConfirmPassword,
    };

    this.saving = true;
    // Not tied to the component lifetime on purpose: a single HTTP call that completes, and if the
    // user navigates away mid-save the password may still change — the session must then be ended.
    this.authService.changePassword(request)
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: (response) => {
          if (response.Success) {
            this.notificationsService.showNotification('success', response.Message);
            this.photoService.clear();
            this.authService.logout();
            this.router.navigateByUrl('/login');
          } else {
            this.notificationsService.showNotification('error', response.Message || GENERIC_ERROR);
          }
        },
        error: (err: HttpErrorResponse) => this.handleError(err),
      });
  }

  resetForm(): void {
    this.changepasswordForm.reset({
      txtCurrentPassword: '',
      txtNewPassword: '',
      txtConfirmPassword: '',
    });
    this.submitted = false;
    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
  }

  private handleError(err: HttpErrorResponse): void {
    // Only trust 400 / 404 when the body is our ChangePasswordResponse shape. A routing 404 with an
    // empty body (endpoint not deployed, wrong base URL) is a generic failure, not a missing account.
    const body = err.error as Partial<ChangePasswordResponse> | null;
    const isApiFailure = !!body && typeof body === 'object' && body.Success === false;

    if (err.status === 401) {
      this.endSession();
      return;
    }
    if (err.status === 404 && isApiFailure) {
      this.notificationsService.showNotification('error', ACCOUNT_NOT_FOUND);
      this.endSession();
      return;
    }
    if (err.status === 400 && isApiFailure) {
      this.notificationsService.showNotification('error', body.Message || GENERIC_ERROR);
      this.applyServerErrors(body.Errors ?? null);
      return;
    }
    this.notificationsService.showNotification('error', GENERIC_ERROR);
  }

  private applyServerErrors(errors: Record<string, string[]> | null): void {
    if (!errors) return;
    // Wrong current password: clear only that field (no valueChanges, so the message stays).
    if (errors['CurrentPassword']?.length) {
      this.changepasswordForm.controls['txtCurrentPassword'].setValue('', { emitEvent: false });
    }
    for (const [field, messages] of Object.entries(errors)) {
      const control = this.changepasswordForm.get(SERVER_FIELD_MAP[field] ?? '');
      if (!control || !messages?.length) continue;
      control.setErrors({ ...control.errors, server: messages[0] });
      control.markAsTouched();
    }
    this.focusFirstInvalid();
  }

  private clearServerErrors(): void {
    for (const { control: name } of FIELDS) {
      const control = this.changepasswordForm.controls[name];
      if (!control.errors || !('server' in control.errors)) continue;
      const rest: ValidationErrors = { ...control.errors };
      delete rest['server'];
      control.setErrors(Object.keys(rest).length ? rest : null, { emitEvent: false });
    }
  }

  // Inputs sit in a fieldset disabled while saving — focus after change detection re-enables them.
  private focusFirstInvalid(): void {
    const first = FIELDS.find(f => this.errorFor(f.control) !== null);
    if (!first) return;
    setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>(`#${first.id}`)?.focus());
  }

  // 401 / 404: end the session and send the user to /login (dashboard after sign-in).
  // AuthInterceptor normally does this on 401 already (and navigates first); it skips requests sent
  // without a token, so this branch stays — but don't navigate a second time.
  private endSession(): void {
    this.photoService.clear();
    this.authService.logout();
    const current = this.router.url.split('?')[0];
    if (this.router.currentNavigation() || current.startsWith('/login')) return;
    this.router.navigate(['/login']);
  }
}
