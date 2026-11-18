import { Component, ChangeDetectionStrategy, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBell, faBuilding, faFileSignature, faUserShield, faUsers
} from '@fortawesome/free-solid-svg-icons';
import { EntitlementService } from '../../services/Access/entitlement.service';

interface NavItem { Label: string; Link: string; Icon: IconDefinition; }
interface NavGroup { Title: string; Items: NavItem[]; }

const WORKSPACE_GROUP: NavGroup = { Title: 'Workspace', Items: [
  { Label: 'Organization', Link: '/settings/organization', Icon: faBuilding },
  { Label: 'Notifications', Link: '/settings/notifications', Icon: faBell },
] };

const PEOPLE_GROUP: NavGroup = { Title: 'People & Access', Items: [
  { Label: 'Users', Link: '/settings/users', Icon: faUsers },
  { Label: 'Roles & Permissions', Link: '/settings/roles', Icon: faUserShield },
] };

/**
 * Show Users / Roles? Managing users and roles is the role-matrix cell `Settings.Manage` (the API policies
 * ManageUsers / ManageRoles check the same cell). Unknown access (not loaded / A1 failed) → show; the pages
 * and API still answer 403.
 */
export function canManagePeople(entitlement: EntitlementService): boolean {
  return !entitlement.current() || entitlement.can('Settings', 'Manage');
}

const BILLING_GROUP: NavGroup = { Title: 'Billing', Items: [
  { Label: 'Plan & License', Link: '/settings/billing', Icon: faFileSignature },
] };

/** Left vertical settings menu (horizontal scroll strip on small screens). */
@Component({
    selector: 'app-settings-nav',
    templateUrl: './settings-nav.component.html',
    styleUrl: './settings-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsNavComponent implements OnInit {
  groups: NavGroup[] = [WORKSPACE_GROUP, PEOPLE_GROUP];

  constructor(private entitlement: EntitlementService, private destroyRef: DestroyRef) {}

  ngOnInit() {
    // UX only — the route guard and API decide. "Plan & License" only for people who may view Billing;
    // Users / Roles only for people with Settings.Manage.
    this.entitlement.access$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const groups = [WORKSPACE_GROUP];
      if (canManagePeople(this.entitlement)) groups.push(PEOPLE_GROUP);
      if (this.entitlement.can('Billing')) groups.push(BILLING_GROUP);
      this.groups = groups;
    });
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
