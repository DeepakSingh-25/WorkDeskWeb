import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Login } from '../../Interface/login';

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  autoLogin(): Observable<any> {
    let header = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    return this.http.get(`${this.apiUrl}AutoLogin/AutoLogin`, { headers: header });
  }
  
  LoginData(loginData: Login): Observable<any> {
    const apiUrl = (`${this.apiUrl}DistributorLogin/DistributorLogin`);
    return this.http.post(apiUrl, loginData);
  }
}
