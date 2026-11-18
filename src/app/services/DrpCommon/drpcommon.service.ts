import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { CityItem, CountryItem, StateItem } from '../../Interface/drpcommon';

@Injectable({
  providedIn: 'root'
})
export class DrpcommonService {
  private baseUrl = environment.baseUrl;

  constructor(private http: HttpClient) { }

  getcountryList(): Observable<CountryItem[]> {
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpCountryList`;
    return this.http.get<CountryItem[]>(apiUrl);
  }

  getstateList(countryID: number): Observable<StateItem[]> {
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpStateList?CountryID=${countryID}`;
    return this.http.get<StateItem[]>(apiUrl);
  }

  getcityList(stateID: number): Observable<CityItem[]> {
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpCityList?StateID=${stateID}`;
    return this.http.get<CityItem[]>(apiUrl);
  }

  stateList(): Observable<any> {
    let header = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpStateByCountry`;
    return this.http.get(apiUrl, { headers: header });
  }

  cityList(): Observable<any> {
    let header = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpCityByState`;
    return this.http.get(apiUrl, { headers: header });
  }

  getProductCategoryList(): Observable<any> {
    let header = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpProductCategoryList`;
    return this.http.get(apiUrl, { headers: header });
  }

  getrelatedserviceList(): Observable<any> {
    let header = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpRelatedServiceList`;
    return this.http.get(apiUrl, { headers: header });
  }

  getdepartmentList(): Observable<any> {
    let header = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    const apiUrl = `${this.baseUrl}DrpCommonApi/DrpDepartmentList`;
    return this.http.get(apiUrl, { headers: header });
  }
}
