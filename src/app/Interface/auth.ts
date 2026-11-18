// ─── Auth API Interfaces ───────────────────────────────────────────────────────

export interface LoginRequest {
  Email: string;
  Password: string;
}

export interface RegisterRequest {
  FullName: string;
  Email: string;
  Password: string;
  PhoneNumber?: string;
}

export interface ForgotPasswordRequest {
  Email: string;
}

export interface ResetPasswordRequest {
  Email: string;
  Token: string;
  NewPassword: string;
  ConfirmPassword: string;
}

// POST Auth/change-password ([Authorize]). 400 body has Errors keyed by request field name;
// 404 body (user missing / inactive) has Errors = null.
export interface ChangePasswordRequest {
  CurrentPassword: string;
  NewPassword: string;
  ConfirmPassword: string;
}

export interface ChangePasswordResponse {
  Success: boolean;
  Message: string;
  Errors: Record<string, string[]> | null;
}

export interface AuthResponse {
  Success: boolean;
  Message: string;
  Token?: string;
  User?: UserInfo;
}

export interface UserInfo {
  Id: string;
  FullName: string;
  Email: string;
  PhoneNumber?: string;
}
