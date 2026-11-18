import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/Auth/auth.service';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { ResetPasswordRequest } from '../Interface/auth';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ResetPasswordComponent implements OnInit {
  resetForm: FormGroup;
  submitted = false;
  showNewPassword = false;
  showConfirmPassword = false;

  hasUppercase = false;
  hasLowercase = false;
  hasNumber = false;
  hasSpecialChar = false;
  hasMinLength = false;
  passwordStrengthPercent = 0;
  passwordStrengthClass = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService
  ) {
    this.resetForm = this.fb.group(
      {
        email: new FormControl('', [Validators.required, Validators.email]),
        token: new FormControl('', [Validators.required]),
        newPassword: new FormControl('', [
          Validators.required,
          Validators.pattern(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
          ),
        ]),
        confirmPassword: new FormControl('', [Validators.required]),
      },
      { validators: this.passwordMatchValidator }
    );
  }

  ngOnInit(): void {
    // URL se email aur token auto-fill karo (reset link se aaye hain to)
    this.route.queryParams.subscribe((params) => {
      if (params['email']) this.resetForm.patchValue({ email: params['email'] });
      if (params['token']) this.resetForm.patchValue({ token: params['token'] });
    });
  }

  passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const newPwd = control.get('newPassword')?.value;
    const confirmPwd = control.get('confirmPassword')?.value;
    return newPwd === confirmPwd ? null : { passwordMismatch: true };
  };

  onPasswordInput(): void {
    const password = this.resetForm.get('newPassword')?.value || '';
    this.hasUppercase = /[A-Z]/.test(password);
    this.hasLowercase = /[a-z]/.test(password);
    this.hasNumber = /[0-9]/.test(password);
    this.hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    this.hasMinLength = password.length >= 8;

    let score = [this.hasUppercase, this.hasLowercase, this.hasNumber, this.hasSpecialChar, this.hasMinLength]
      .filter(Boolean).length;

    this.passwordStrengthPercent = (score / 5) * 100;
    this.passwordStrengthClass = score <= 2 ? 'bg-danger' : score <= 4 ? 'bg-warning' : 'bg-success';
  }

  toggleNewPassword(): void { this.showNewPassword = !this.showNewPassword; }
  toggleConfirmPassword(): void { this.showConfirmPassword = !this.showConfirmPassword; }

  onResetPassword(): void {
    this.submitted = true;
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const formValue = this.resetForm.value;
    const request: ResetPasswordRequest = {
      Email: formValue.email,
      Token: formValue.token,
      NewPassword: formValue.newPassword,
      ConfirmPassword: formValue.confirmPassword,
    };

    this.loaderService.showLoader();
    this.authService.resetPassword(request).subscribe({
      next: (response) => {
        this.loaderService.hideLoader();
        if (response.Success) {
          this.notificationsService.showNotification('success', response.Message);
          this.resetForm.reset();
          this.submitted = false;
          this.router.navigate(['/login']);
        } else {
          this.notificationsService.showNotification('error', response.Message);
        }
      },
      error: () => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
      },
    });
  }
}
