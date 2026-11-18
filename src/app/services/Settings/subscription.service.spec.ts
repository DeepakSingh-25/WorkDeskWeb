import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { SubscriptionService } from './subscription.service';
import { LicenseActionResponse, PlanCatalogItem, SubscriptionInfo } from '../../Interface/access';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let httpMock: HttpTestingController;
  const base = `${environment.baseUrl}Subscription`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SubscriptionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getSubscription → GET Subscription (S2)', () => {
    let info: SubscriptionInfo | undefined;
    service.getSubscription().subscribe(r => info = r);
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush({ State: 'Active', PlanCode: 'Enterprise' });
    expect(info?.PlanCode).toBe('Enterprise');
  });

  it('getPlanCatalog → GET Subscription/plans (S4)', () => {
    let plans: PlanCatalogItem[] = [];
    service.getPlanCatalog().subscribe(r => plans = r);
    httpMock.expectOne(`${base}/plans`).flush([{ Code: 'Basic', Name: 'Basic', Description: '', Modules: ['Projects'], DefaultSeats: 10 }]);
    expect(plans.map(p => p.Code)).toEqual(['Basic']);
  });

  it('uploadLicense → POST Subscription/license with the §6.3 body', () => {
    let res: LicenseActionResponse | undefined;
    service.uploadLicense('{"Format":"workdesk-license/1"}', true).subscribe(r => res = r);
    const req = httpMock.expectOne(`${base}/license`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ LicenseText: '{"Format":"workdesk-license/1"}', ConfirmDowngrade: true });
    req.flush({ Success: true, Message: 'License installed.', Errors: null, Code: null, Impacts: null });
    expect(res?.Success).toBeTrue();
  });

  it('409 CONFIRM_DOWNGRADE and 400 validation bodies come back as values', () => {
    const conflict: LicenseActionResponse = {
      Success: false, Message: 'Review and confirm.', Errors: null, Code: 'CONFIRM_DOWNGRADE',
      Impacts: { PlanFrom: 'Pro', PlanTo: 'Basic', ModulesRemoved: ['Agile'], SeatsFrom: 50, SeatsTo: 10, SeatsUsed: 12 }
    };
    let res: LicenseActionResponse | undefined;
    service.uploadLicense('x').subscribe(r => res = r);
    httpMock.expectOne(`${base}/license`).flush(conflict, { status: 409, statusText: 'Conflict' });
    expect(res?.Code).toBe('CONFIRM_DOWNGRADE');
    expect(res?.Impacts?.ModulesRemoved).toEqual(['Agile']);

    service.uploadLicense('x').subscribe(r => res = r);
    httpMock.expectOne(`${base}/license`).flush(
      { Success: false, Message: 'Please fix the highlighted fields.', Errors: { LicenseText: ['Bad signature'] }, Code: 'LICENSE_INVALID', Impacts: null },
      { status: 400, statusText: 'Bad Request' });
    expect(res?.Errors?.['LicenseText']).toEqual(['Bad signature']);
  });

  it('403 stays an error', () => {
    let status = 0;
    service.uploadLicense('x').subscribe({ error: e => status = e.status });
    httpMock.expectOne(`${base}/license`).flush({ Success: false, Message: 'No', Code: 'NO_PERMISSION' }, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
  });
});
