import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminRoutingModule } from './admin-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LoginComponent } from '../login/login.component';
import { ForgotpasswordComponent } from '../forgotpassword/forgotpassword.component';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgApexchartsModule } from "ng-apexcharts";
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AccessdeniedComponent } from '../accessdenied/accessdenied.component';
import { ChangepasswordComponent } from '../changepassword/changepassword.component';
import { SignupComponent } from '../signup/signup.component';
import { TermConditionComponent } from '../term-condition/term-condition.component';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { ResetPasswordComponent } from '../reset-password/reset-password.component';

@NgModule({
  declarations: [
    LoginComponent,
    SignupComponent,
    ForgotpasswordComponent,
    AccessdeniedComponent,
    ChangepasswordComponent,
    TermConditionComponent,
    UserProfileComponent,
    ResetPasswordComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AdminRoutingModule,
    ReactiveFormsModule,
    NgSelectModule,
    FontAwesomeModule
  ]
})
export class AdminModule { }
