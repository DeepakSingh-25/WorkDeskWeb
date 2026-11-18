import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from '../login/login.component';
import { ForgotpasswordComponent } from '../forgotpassword/forgotpassword.component';
import { LoaderComponent } from '../loader/loader.component';
import { AccessdeniedComponent } from '../accessdenied/accessdenied.component';
import { ChangepasswordComponent } from '../changepassword/changepassword.component';
import { SignupComponent } from '../signup/signup.component';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { ResetPasswordComponent } from '../reset-password/reset-password.component';
import { authGuard } from '../guards/auth.guard';

const routes: Routes = [
  { path: 'changepassword', component: ChangepasswordComponent, canActivate: [authGuard] },
  { path: 'accessdenied', component: AccessdeniedComponent },
  { path: 'loader', component: LoaderComponent },
  { path: 'forgot', component: ForgotpasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'login', component: LoginComponent },
  { path: 'user-profile', component: UserProfileComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '/login', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
