// GET api/Profile
export interface ProfileResponse {
  Id: string;
  FullName: string;
  Email: string;
  PhoneNumber: string | null;
  CompanyName: string | null;
  AddressLine: string | null;
  CountryID: number | null;
  StateID: number | null;
  CityID: number | null;
  PinCode: string | null;
  HasPhoto: boolean;
  UpdatedAt: string | null;
}

// PUT api/Profile body (Email / Id are not accepted)
export interface UpdateProfileRequest {
  FullName: string;
  PhoneNumber: string | null;
  CompanyName: string;
  AddressLine: string;
  CountryID: number;
  StateID: number;
  CityID: number;
  PinCode: string;
}

export interface ProfileSaveResponse {
  Success: boolean;
  Message: string;
  Profile: ProfileResponse | null;
  Errors: Record<string, string[]> | null;
}

// POST / DELETE api/Profile/photo
export interface PhotoSaveResponse {
  Success: boolean;
  Message: string;
  HasPhoto: boolean;
}
