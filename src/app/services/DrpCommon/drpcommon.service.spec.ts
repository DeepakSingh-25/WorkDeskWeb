import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { DrpcommonService } from './drpcommon.service';
import { environment } from '../../../environments/environment';
import { CityItem, CountryItem, StateItem } from '../../Interface/drpcommon';

describe('DrpcommonService', () => {
  let service: DrpcommonService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(DrpcommonService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should GET the country list and pass ID-shaped items through', () => {
    const countries: CountryItem[] = [{ ID: 1, CountryName: 'India' }];
    let result: CountryItem[] | undefined;

    service.getcountryList().subscribe(r => result = r);

    const req = httpMock.expectOne(`${environment.baseUrl}DrpCommonApi/DrpCountryList`);
    expect(req.request.method).toBe('GET');
    req.flush(countries);

    expect(result).toEqual(countries);
    expect(result![0].ID).toBe(1);
  });

  it('should GET the state list with the CountryID query param', () => {
    const states: StateItem[] = [{ ID: 12, StateName: 'Karnataka' }];
    let result: StateItem[] | undefined;

    service.getstateList(1).subscribe(r => result = r);

    const req = httpMock.expectOne(`${environment.baseUrl}DrpCommonApi/DrpStateList?CountryID=1`);
    expect(req.request.method).toBe('GET');
    req.flush(states);

    expect(result).toEqual(states);
  });

  it('should GET the city list with the StateID query param', () => {
    const cities: CityItem[] = [{ ID: 345, CityName: 'Bengaluru' }];
    let result: CityItem[] | undefined;

    service.getcityList(12).subscribe(r => result = r);

    const req = httpMock.expectOne(`${environment.baseUrl}DrpCommonApi/DrpCityList?StateID=12`);
    expect(req.request.method).toBe('GET');
    req.flush(cities);

    expect(result).toEqual(cities);
  });
});
