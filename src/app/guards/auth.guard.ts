import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/Auth/auth.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';

// Protected routes ke liye. Login nahi hai (ya token expire ho gaya) to /login par bhejta hai;
// login ke baad user hamesha dashboard par jaata hai.
// canActivate + canActivateChild dono mein lagta hai, taaki module ke andar har navigation check ho.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) return true;

  // Expired token ka bacha hua data (naam, photo) header mein na dikhe
  if (authService.getToken()) {
    inject(ProfilePhotoService).clear();
    authService.logout();
  }
  return router.createUrlTree(['/login']);
};
