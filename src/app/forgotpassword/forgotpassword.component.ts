import { Component, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { AuthService } from '../services/Auth/auth.service';
import { ForgotPasswordRequest } from '../Interface/auth';

@Component({
  selector: 'app-forgotpassword',
  templateUrl: './forgotpassword.component.html',
  styleUrl: './forgotpassword.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ForgotpasswordComponent implements OnInit {
  // Keep ViewChild refs so HTML still compiles (modals won't open but no errors)
  @ViewChild('closebutton') closebutton!: ElementRef;
  @ViewChild('txtOtpInput') TXTOTPInput!: ElementRef;

  forgotForm: FormGroup;
  submitted = false;
  isReenterPasswordVisible = false;

  // Keep these to prevent template errors
  otpTimer = 0;
  otpExpired = false;
  MobileEmailOTPID = '';
  isMobileVerified = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router
  ) {
    this.forgotForm = this.fb.group({
      txtMobileEmail: new FormControl('', [Validators.required, Validators.email]),
      txtOtpType: new FormControl('Email'),
      enteredEmailOTP: new FormControl(''),
      txtPassword: new FormControl(''),
      RenterPassword: new FormControl(''),
    });
  }

  ngOnInit(): void {}

  // ─── Step 1: Submit email → call forgot-password API ──────────────────────
  openOTPModal(): void {
    this.submitted = true;
    const emailControl = this.forgotForm.get('txtMobileEmail');
    if (!emailControl || emailControl.invalid) {
      emailControl?.markAsTouched();
      return;
    }

    const request: ForgotPasswordRequest = {
      Email: emailControl.value,
    };

    this.loaderService.showLoader();
    this.authService.forgotPassword(request).subscribe({
      next: (response) => {
        this.loaderService.hideLoader();
        if (response.Success) {
          // Token ab API response me nahi aata — user email se token paste karega
          this.notificationsService.showNotification('success', response.Message);
          // Show reset password fields
          this.isReenterPasswordVisible = true;
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

  // ─── Step 2: Reset password with token ────────────────────────────────────
  changePassword(): void {
    const email = this.forgotForm.value.txtMobileEmail;
    const token = this.forgotForm.value.enteredEmailOTP;
    const newPassword = this.forgotForm.value.txtPassword;
    const confirmPassword = this.forgotForm.value.RenterPassword;

    if (!newPassword || !confirmPassword) {
      this.notificationsService.showNotification('error', 'Please enter and confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.notificationsService.showNotification('error', 'Passwords do not match.');
      return;
    }

    this.loaderService.showLoader();
    this.authService
      .resetPassword({ Email: email, Token: token, NewPassword: newPassword, ConfirmPassword: confirmPassword })
      .subscribe({
        next: (response) => {
          this.loaderService.hideLoader();
          if (response.Success) {
            this.notificationsService.showNotification('success', 'Password reset successfully!');
            this.forgotForm.reset();
            this.submitted = false;
            this.isReenterPasswordVisible = false;
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

  // ─── Stubs (HTML template ke liye) ─────────────────────────────────────────
  getFormattedTime(): string { return ''; }
  VerifyEmailMobOTP(): void {}
  resendMobileOTP(): void {}
  onKeyupVerifyOTP(): void {}
  onKeyPress(event: KeyboardEvent): void {}
}
