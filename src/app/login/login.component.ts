import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { AuthService } from '../services/Auth/auth.service';
import { LoginRequest } from '../Interface/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  submitted = false;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      txtUserID: new FormControl('', [Validators.required, Validators.email]),
      txtPassword: new FormControl('', [Validators.required]),
    });
  }

  ngOnInit(): void {
    // Agar pehle se login hai to dashboard redirect
    if (this.authService.isLoggedIn()) {
      this.goToDashboard();
    }
  }

  // Logout kahin se bhi hua ho, login ke baad hamesha dashboard hi pehla page hai.
  private goToDashboard(): void {
    this.router.navigateByUrl('/dashboard');
  }

  onLogin(): void {
    this.submitted = true;
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const request: LoginRequest = {
      Email: this.loginForm.value.txtUserID,
      Password: this.loginForm.value.txtPassword,
    };

    this.loaderService.showLoader();
    this.authService.login(request).subscribe({
      next: (response) => {
        this.loaderService.hideLoader();
        if (response.Success) {
          this.notificationsService.showNotification('success', `Welcome, ${response.User?.FullName ?? 'User'}!`);
          this.goToDashboard();
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

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}
