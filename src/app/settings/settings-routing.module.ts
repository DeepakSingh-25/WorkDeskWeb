import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SettingsLayoutComponent } from './settings-layout/settings-layout.component';
import { SettingsOrganizationComponent } from './settings-organization/settings-organization.component';
import { SettingsUsersComponent } from './settings-users/settings-users.component';
import { SettingsRolesComponent } from './settings-roles/settings-roles.component';
import { SettingsNotificationsComponent } from './settings-notifications/settings-notifications.component';
import { SettingsBillingComponent } from './settings-billing/settings-billing.component';
import { moduleGuard } from '../guards/module.guard';

const routes: Routes = [
  {
    path: '',
    component: SettingsLayoutComponent,
    children: [
      { path: '', redirectTo: 'organization', pathMatch: 'full' },
      { path: 'organization', component: SettingsOrganizationComponent },
      { path: 'users', component: SettingsUsersComponent },
      { path: 'roles', component: SettingsRolesComponent },
      { path: 'notifications', component: SettingsNotificationsComponent },
      // Billing is always on (never plan-gated); the guard only checks the role's Billing.View.
      { path: 'billing', component: SettingsBillingComponent, canActivate: [moduleGuard('Billing')] },
      { path: '**', redirectTo: 'organization' },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingsRoutingModule { }
