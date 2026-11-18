import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { SettingsBillingComponent } from './settings-billing.component';
import { SubscriptionService } from '../../services/Settings/subscription.service';
import { EntitlementService } from '../../services/Access/entitlement.service';
import { NotificationsService } from '../../services/notifications.service';
import { LicenseActionResponse, MyAccess, SubscriptionInfo } from '../../Interface/access';

const INFO: SubscriptionInfo = {
  State: 'Active', Problem: null, PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false,
  StartsAt: '2026-10-20T00:00:00Z', ExpiresAt: '2027-10-19T23:59:59Z', GraceDays: 14,
  GraceEndsAt: '2027-11-02T23:59:59Z', DaysLeft: 364, Seats: 50, SeatsUsed: 12,
  Limits: { MaxProjects: null, StorageGB: 100 },
  Modules: [
    { Module: 'Projects', InPlan: true, AvailableIn: ['Basic', 'Pro', 'Enterprise'] },
    { Module: 'Workflows', InPlan: false, AvailableIn: ['Enterprise'] }
  ],
  License: {
    LicenseID: '7b5d1c1e', KeyID: 'wd-2026-01', CustomerName: 'Acme Infra Pvt Ltd',
    IssuedAt: '2026-10-20T10:00:00Z', UploadedAt: '2026-10-20T11:02:13Z', UploadedByName: 'Asha Rao'
  },
  InstallationID: 'f1c2a9d4-0b7e-4f55-8a63-1d2e3f4a5b6c', ClockWarning: false
};

const DOWNGRADE: LicenseActionResponse = {
  Success: false, Message: 'This license removes modules or seats. Review and confirm.', Errors: null, Code: 'CONFIRM_DOWNGRADE',
  Impacts: { PlanFrom: 'Pro', PlanTo: 'Basic', ModulesRemoved: ['Agile', 'Reports', 'Workspace'], SeatsFrom: 50, SeatsTo: 10, SeatsUsed: 12 }
};

describe('SettingsBillingComponent', () => {
  let fixture: ComponentFixture<SettingsBillingComponent>;
  let component: SettingsBillingComponent;
  let subscription: jasmine.SpyObj<SubscriptionService>;
  let entitlement: jasmine.SpyObj<EntitlementService>;
  let notifications: jasmine.SpyObj<NotificationsService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const uploadButton = () => Array.from(el().querySelectorAll('button')).find(b => b.textContent?.includes('Upload license'));
  const send = (text: string, confirm: boolean) => (component as unknown as { send(t: string, c: boolean): void }).send(text, confirm);

  beforeEach(async () => {
    subscription = jasmine.createSpyObj<SubscriptionService>('SubscriptionService', ['getSubscription', 'getPlanCatalog', 'uploadLicense']);
    subscription.getSubscription.and.returnValue(of(INFO));
    entitlement = jasmine.createSpyObj<EntitlementService>('EntitlementService', ['ensureLoaded', 'can', 'current', 'refresh'], {
      access$: new BehaviorSubject<MyAccess | null>(null).asObservable()
    });
    entitlement.ensureLoaded.and.returnValue(of(null));
    entitlement.refresh.and.returnValue(of(null));
    entitlement.current.and.returnValue({} as MyAccess);
    entitlement.can.and.returnValue(true);
    notifications = jasmine.createSpyObj('NotificationsService', ['showNotification']);

    await TestBed.configureTestingModule({
      declarations: [SettingsBillingComponent],
      providers: [
        provideRouter([]),
        { provide: SubscriptionService, useValue: subscription },
        { provide: EntitlementService, useValue: entitlement },
        { provide: NotificationsService, useValue: notifications }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsBillingComponent);
    component = fixture.componentInstance;
  });

  it('should create and show plan, seats, installation ID and the modules table (no sample-data note)', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    const text = el().textContent ?? '';
    expect(text).toContain('Pro');
    expect(text).toContain('12 / 50');
    expect(text).toContain(INFO.InstallationID!);
    expect(text).toContain('Available in Enterprise');
    expect(text).toContain('Unlimited projects');
    expect(text).not.toContain('Sample data');
    expect(el().querySelectorAll('.dashboard-box').length).toBe(4);
  });

  it('upload button is enabled for Billing editors and has a .lic file input', () => {
    fixture.detectChanges();
    expect(entitlement.can).toHaveBeenCalledWith('Billing', 'Edit');
    expect(uploadButton()?.disabled).toBeFalse();
    expect(el().querySelector('input[type=file]')?.getAttribute('accept')).toBe('.lic');
  });

  it('upload button is hidden without Billing.Edit', () => {
    entitlement.can.and.returnValue(false);
    fixture.detectChanges();
    expect(uploadButton()).toBeUndefined();
  });

  it('shows Problem and ClockWarning alerts', () => {
    subscription.getSubscription.and.returnValue(of({ ...INFO, State: 'Invalid', Problem: 'The installed license is not valid.', ClockWarning: true }));
    fixture.detectChanges();
    const text = el().textContent ?? '';
    expect(text).toContain('The installed license is not valid.');
    expect(text).toContain('server clock');
  });

  it('success → toast, reload S2 and refresh entitlements', () => {
    fixture.detectChanges();
    subscription.uploadLicense.and.returnValue(of({ Success: true, Message: 'License installed. Plan: Pro.', Errors: null, Code: null, Impacts: null }));
    send('lic', false);
    expect(subscription.uploadLicense).toHaveBeenCalledWith('lic', false);
    expect(notifications.showNotification).toHaveBeenCalledWith('success', 'License installed. Plan: Pro.');
    expect(subscription.getSubscription).toHaveBeenCalledTimes(2);
    expect(entitlement.refresh).toHaveBeenCalledTimes(1);
  });

  it('409 CONFIRM_DOWNGRADE → confirm modal with impacts → resend with ConfirmDowngrade: true', () => {
    fixture.detectChanges();
    subscription.uploadLicense.and.returnValues(of(DOWNGRADE),
      of({ Success: true, Message: 'License installed.', Errors: null, Code: null, Impacts: null }));
    send('lic', false);
    fixture.detectChanges();

    const modal = el().querySelector('.modal');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Agile, Reports, Workspace will be locked');
    expect(modal?.textContent).toContain('Seats go from 50 to 10, 12 in use');
    expect(entitlement.refresh).not.toHaveBeenCalled();

    const confirm = Array.from(modal!.querySelectorAll('button')).find(b => b.textContent?.includes('Install anyway'))!;
    confirm.click();
    fixture.detectChanges();

    expect(subscription.uploadLicense.calls.mostRecent().args).toEqual(['lic', true]);
    expect(el().querySelector('.modal')).toBeNull();
    expect(entitlement.refresh).toHaveBeenCalledTimes(1);
  });

  it('cancelling the downgrade sends nothing', () => {
    fixture.detectChanges();
    subscription.uploadLicense.and.returnValue(of(DOWNGRADE));
    send('lic', false);
    component.closeDowngrade();
    fixture.detectChanges();
    expect(el().querySelector('.modal')).toBeNull();
    expect(subscription.uploadLicense).toHaveBeenCalledTimes(1);
  });

  it('400 validation shows the LicenseText error; 403 shows a permission message', () => {
    fixture.detectChanges();
    subscription.uploadLicense.and.returnValue(of({
      Success: false, Message: 'Please fix the highlighted fields.', Errors: { LicenseText: ['The license signature is not valid.'] },
      Code: 'LICENSE_INVALID', Impacts: null
    }));
    send('lic', false);
    fixture.detectChanges();
    expect(el().textContent).toContain('The license signature is not valid.');

    subscription.uploadLicense.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    send('lic', false);
    fixture.detectChanges();
    expect(el().textContent).toContain("You don't have permission to upload a license.");
  });

  it('a failed load shows the error with Try again', () => {
    subscription.getSubscription.and.returnValue(throwError(() => new Error('x')));
    fixture.detectChanges();
    expect(component.info).toBeNull();
    expect(el().textContent).toContain('Could not load your plan and license.');
  });

  it('seat percentage is capped and flags over-use', () => {
    component.info = { ...INFO, Seats: 10, SeatsUsed: 12 };
    expect(component.seatPct).toBe(100);
    expect(component.seatsOver).toBeTrue();
  });
});
