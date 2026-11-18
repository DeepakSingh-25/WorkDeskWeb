export interface Forgotpassword {
    MobileNoOrEmail: string,
    OtpType: string,
    Password: string,
    OtpID: string,
    TypeID: string,
    OtpValue: string,
}

export interface sendMobileEmailOTP {
    MobileOrEmailID: string,
    OtpType: string,
    TypeID: string 
}

export interface verifyMobileOTP {
    EmailOrMobileOTPID: string,
    EmailOrMobileNo: string, 
    EmailOrMobileOTPValue: string, 
    TypeID: string, 
    OtpType: string, 
}