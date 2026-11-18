import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { SettingsRoutingModule } from './settings-routing.module';
import { SettingsLayoutComponent } from './settings-layout/settings-layout.component';
import { SettingsNavComponent } from './settings-nav/settings-nav.component';
import { SettingsOrganizationComponent } from './settings-organization/settings-organization.component';
import { SettingsUsersComponent } from './settings-users/settings-users.component';
import { SettingsRolesComponent } from './settings-roles/settings-roles.component';
import { SettingsNotificationsComponent } from './settings-notifications/settings-notifications.component';
import { SettingsBillingComponent } from './settings-billing/settings-billing.component';

@NgModule({
  declarations: [
    SettingsLayoutComponent,
    SettingsNavComponent,
    SettingsOrganizationComponent,
    SettingsUsersComponent,
    SettingsRolesComponent,
    SettingsNotificationsComponent,
    SettingsBillingComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    FontAwesomeModule,
    SettingsRoutingModule
  ]
})
export class SettingsModule { }
