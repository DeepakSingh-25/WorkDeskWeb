import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { AuthService } from '../services/Auth/auth.service';
import { RegisterRequest } from '../Interface/auth';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SignupComponent {
  signupForm: FormGroup;
  submitted = false;

  // Password strength
  hasUppercase = false;
  hasLowercase = false;
  hasNumber = false;
  hasSpecialChar = false;
  hasMinLength = false;
  passwordStrengthPercent = 0;
  passwordStrengthClass = '';

  // Keep these so HTML template still works (OTP modals hidden se avoid karna)
  isMobileVerified = false;
  isEmailVerified = false;
  isGSTVerified = false;
  otpTimer = 0;
  otpExpired = false;
  countryData: any[] = [];
  stateData: any[] = [];
  cityData: any[] = [];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router
  ) {
    this.signupForm = this.fb.group(
      {
        txtContactPerson: new FormControl('', [Validators.required]),
        txtEmail: new FormControl('', [Validators.required, Validators.email]),
        txtPassword: new FormControl('', [
          Validators.required,
          Validators.pattern(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
          ),
        ]),
        RenterPassword: new FormControl('', [Validators.required]),
        txtMobileNo: new FormControl('', [
          Validators.required,
          Validators.minLength(10),
          Validators.maxLength(10),
        ]),
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const pwd = control.get('txtPassword')?.value;
    const confirmPwd = control.get('RenterPassword')?.value;
    return pwd === confirmPwd ? null : { passwordMismatch: true };
  };

  onPasswordInput(): void {
    const password = this.signupForm.get('txtPassword')?.value || '';
    this.hasUppercase = /[A-Z]/.test(password);
    this.hasLowercase = /[a-z]/.test(password);
    this.hasNumber = /[0-9]/.test(password);
    this.hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    this.hasMinLength = password.length >= 8;
    const score = [this.hasUppercase, this.hasLowercase, this.hasNumber, this.hasSpecialChar, this.hasMinLength]
      .filter(Boolean).length;
    this.passwordStrengthPercent = (score / 5) * 100;
    this.passwordStrengthClass = score <= 2 ? 'bg-danger' : score <= 4 ? 'bg-warning' : 'bg-success';
  }

  onSignUp(): void {
    this.submitted = true;
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    const request: RegisterRequest = {
      FullName: this.signupForm.value.txtContactPerson,
      Email: this.signupForm.value.txtEmail,
      Password: this.signupForm.value.txtPassword,
      PhoneNumber: this.signupForm.value.txtMobileNo,
    };

    this.loaderService.showLoader();
    this.authService.register(request).subscribe({
      next: (response) => {
        this.loaderService.hideLoader();
        if (response.Success) {
          this.notificationsService.showNotification('success', 'Account created successfully! Please login.');
          this.signupForm.reset();
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

  onKeyPress(event: KeyboardEvent): boolean {
    const isDigit = event.which >= 48 && event.which <= 57;
    const isBackspace = event.which === 8;
    if (!isDigit && !isBackspace) return false;
    return true;
  }

  getFormattedTime(): string { return ''; }
}
