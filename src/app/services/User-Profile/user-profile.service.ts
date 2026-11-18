import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { PhotoSaveResponse, ProfileResponse, ProfileSaveResponse, UpdateProfileRequest } from '../../Interface/user-profile';
import { Observable, map } from 'rxjs';

const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable({
  providedIn: 'root'
})
export class UserProfileService {

  private baseUrl = environment.baseUrl;

  constructor(private http: HttpClient) { }

  getProfile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${this.baseUrl}Profile`, { headers: this.authHeaders() });
  }

  updateProfile(request: UpdateProfileRequest): Observable<ProfileSaveResponse> {
    return this.http.put<ProfileSaveResponse>(`${this.baseUrl}Profile`, request, { headers: this.authHeaders() });
  }

  // 200 -> image blob, 204 (no photo) or a non-image body -> null
  getPhoto(): Observable<Blob | null> {
    return this.http.get(`${this.baseUrl}Profile/photo`, {
      headers: this.authHeaders(),
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(res => {
        const body = res.body;
        if (res.status === 204 || !body || body.size === 0) return null;
        return PHOTO_MIME_TYPES.includes(body.type) ? body : null;
      })
    );
  }

  // Multipart field name must be exactly "File". Content-Type is set by the browser (boundary).
  uploadPhoto(file: Blob, fileName: string): Observable<PhotoSaveResponse> {
    const formData = new FormData();
    formData.append('File', file, fileName);
    return this.http.post<PhotoSaveResponse>(`${this.baseUrl}Profile/photo`, formData, { headers: this.authHeaders() });
  }

  deletePhoto(): Observable<PhotoSaveResponse> {
    return this.http.delete<PhotoSaveResponse>(`${this.baseUrl}Profile/photo`, { headers: this.authHeaders() });
  }

  // No token -> no Authorization header (never send "Bearer null").
  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return token ? new HttpHeaders().set('Authorization', `Bearer ${token}`) : new HttpHeaders();
  }
}
