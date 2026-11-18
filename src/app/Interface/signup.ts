export interface Signup {
    ID: string,
    isGSTRegistered: boolean | null,
    GSTNo: string,
    CompanyName: string,
    Address: string,
    State: string,
    City: string,
    PinCode: string,
    ContactPerson: string,
    MobileNo: string,
    Email: string,
    Password: string,
    PartnerID: string,
    MobileOTPID: string,
    EmailOTPID: string,

}

export interface SignupmobileOtp {
    TypeID: string;
    MobileNo: string
}

export interface sendEmailOTP {
    TypeID: string;
    Email: string
}

export interface verifyMobileOTP {
    MobileOTPID: string,
    MobileNo: string,
    MobileOTPValue: string,
    TypeID: string
}

export interface verifyEmailOTP {
    EmailOTPID: string,
    Email: string,
    EmailOTPValue: string,
    TypeID: string
}

export interface VerifyGSTNumber {
    ContactPerson: string,
    CompanyName: string,
    Pincode: string,
    Address: string
}



