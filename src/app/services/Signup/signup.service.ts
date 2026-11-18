import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { sendEmailOTP, SignupmobileOtp, verifyEmailOTP, VerifyGSTNumber, verifyMobileOTP } from '../../Interface/signup';

@Injectable({
  providedIn: 'root'
})
export class SignupService {
 private baseUrl = environment.baseUrl;

  constructor(private http: HttpClient) { }

  sendMobileOTP(formData:SignupmobileOtp): Observable<any> {
    const apiUrl = `${this.baseUrl}DistributorSignUp/DistributorSignUpSendMobileOTP`;
    return this.http.post(apiUrl, formData); 
  }

  verifyMobileOTP( formData:verifyMobileOTP ): Observable<any> {
    const apiUrl = `${this.baseUrl}DistributorSignUp/DistributorSignUpOTPVerify`; // Endpoint for OTP verification
    return this.http.post(apiUrl, formData);
  }

  sendEmailOTP(formData:sendEmailOTP): Observable<any> {
    const apiUrl = `${this.baseUrl}DistributorSignUp/DistributorSignUpSendEmailOTP`;
    return this.http.post(apiUrl, formData); 
  }

  verifyEmailOTP( formData:verifyEmailOTP ): Observable<any> {
    const apiUrl = `${this.baseUrl}DistributorSignUp/DistributorSignUpEmailOTPVerify`; // Endpoint for OTP verification
    return this.http.post(apiUrl, formData);
  }

  signUp(signUpFormData: any): Observable<any> {
    const apiUrl = (`${this.baseUrl}DistributorSignUp/DistributorSignUp`);
     return this.http.post(apiUrl,signUpFormData);
  }
  
   drpPartnersList(): Observable<any> {
    const apiUrl = (`${this.baseUrl}DrpCommonApi/DrpApprovedPartnerList`);
     return this.http.get(apiUrl);
  }

  getGSTVerify(gstNumber: string): Observable<VerifyGSTNumber> {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    const apiUrl = `${this.baseUrl}DistributorSignUp/GSTVerifiedData?GSTNO=${gstNumber}`;
    return this.http.get<VerifyGSTNumber>(apiUrl, { headers });
  }
  
    
}
