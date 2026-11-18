import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BehaviorSubject, of } from 'rxjs';

import { LicenseBannerComponent } from './license-banner.component';
import { ACCESS_MODULES, EntitlementService } from '../services/Access/entitlement.service';
import { AccessModule, LicenseState, ModuleAccess, MyAccess } from '../Interface/access';

function makeAccess(state: LicenseState, banner: string | null, billingView = true): MyAccess {
  const modules = {} as Record<AccessModule, ModuleAccess>;
  ACCESS_MODULES.forEach(m => modules[m] = {
    InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: []
  });
  modules.Billing = { ...modules.Billing, View: billingView };
  return {
    UserID: 'u1', RoleID: 2, Modules: modules, Version: 'v1',
    License: {
      State: state, PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
      DaysLeft: 9, ReadOnly: state === 'Expired', SeatsExceeded: false, Banner: banner
    }
  };
}

describe('LicenseBannerComponent', () => {
  let fixture: ComponentFixture<LicenseBannerComponent>;
  let access$: BehaviorSubject<MyAccess | null>;
  let entitlement: jasmine.SpyObj<EntitlementService>;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    LicenseBannerComponent.resetDismissed();
    access$ = new BehaviorSubject<MyAccess | null>(null);
    entitlement = jasmine.createSpyObj<EntitlementService>('EntitlementService', ['ensureLoaded', 'refreshIfStale'], { access$: access$.asObservable() });
    entitlement.ensureLoaded.and.returnValue(of(null));

    await TestBed.configureTestingModule({
      declarations: [LicenseBannerComponent],
      imports: [FontAwesomeModule, RouterModule.forRoot([])],
      providers: [{ provide: EntitlementService, useValue: entitlement }]
    }).compileComponents();

    fixture = TestBed.createComponent(LicenseBannerComponent);
    fixture.detectChanges();
  });

  it('shows nothing without access or without a Banner', () => {
    expect(el().querySelector('.license-banner')).toBeNull();
    access$.next(makeAccess('Active', null));
    fixture.detectChanges();
    expect(el().querySelector('.license-banner')).toBeNull();
  });

  it('Grace → amber strip with the API text and a Plan & License link for Billing viewers', () => {
    access$.next(makeAccess('Grace', 'Your license expired on 15 Oct 2026. Upload a renewed license within 9 days.'));
    fixture.detectChanges();
    const strip = el().querySelector('.license-banner');
    expect(strip?.classList).toContain('alert-warning');
    expect(strip?.textContent).toContain('Upload a renewed license within 9 days.');
    expect(strip?.querySelector('a')?.getAttribute('href')).toBe('/settings/billing');
  });

  it('Expired for a non-admin → red strip, neutral text, no link', () => {
    access$.next(makeAccess('Expired', 'Some features are read-only. Contact your administrator.', false));
    fixture.detectChanges();
    const strip = el().querySelector('.license-banner');
    expect(strip?.classList).toContain('alert-danger');
    expect(strip?.querySelector('a')).toBeNull();
  });

  it('dismiss hides the message; a different message shows again', () => {
    access$.next(makeAccess('Grace', 'A'));
    fixture.detectChanges();
    (el().querySelector('.btn-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('.license-banner')).toBeNull();
    access$.next(makeAccess('Expired', 'B'));
    fixture.detectChanges();
    expect(el().querySelector('.license-banner')).toBeTruthy();
  });

  it('window focus asks for a refresh when the answer is ≥ 60 s old', () => {
    window.dispatchEvent(new Event('focus'));
    expect(entitlement.refreshIfStale).toHaveBeenCalledWith(60000);
  });
});
