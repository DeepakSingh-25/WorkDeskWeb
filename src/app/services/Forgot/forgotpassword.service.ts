import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { Forgotpassword, sendMobileEmailOTP, verifyMobileOTP } from '../../Interface/forgotpassword';

@Injectable({
  providedIn: 'root'
})
export class ForgotpasswordService {
  private baseUrl = environment.baseUrl;

  constructor(private http: HttpClient) { }

  sendMasterOTP(formData: sendMobileEmailOTP): Observable<any> {
    const apiUrl = `${this.baseUrl}ForgotPassword/SendMasterOTP`;
    return this.http.post(apiUrl, formData); 
  }

  verifyMasterOTP(formData: verifyMobileOTP): Observable<any> {
    const apiUrl =(`${this.baseUrl}ForgotPassword/MasterOTPVerify`);
    return this.http.post(apiUrl, formData); 
  }

  ChangePassword(formData: Forgotpassword): Observable<any> {
    const apiUrl =(`${this.baseUrl}ForgotPassword/ForgotPassword`);
    return this.http.post(apiUrl, formData); 
  }
  
}
