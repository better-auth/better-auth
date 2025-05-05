import type { AuthContext } from "../init";
import { BASE_ERROR_CODES } from "../error/codes";

type PasswordValidationResult = {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export const validatePasswordComplexity = (
  password: string,
  ctx: AuthContext
): PasswordValidationResult => {
  const config = ctx.password.config;
  const minLength = config.minPasswordLength;
  const maxLength = config.maxPasswordLength;

  // Check min length
  if (password.length < minLength) {
    return {
      isValid: false,
      errorCode: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
      errorMessage: `Password must be at least ${minLength} characters long`,
    };
  }

  // Check max length
  if (password.length > maxLength) {
    return {
      isValid: false,
      errorCode: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
      errorMessage: `Password must be at most ${maxLength} characters long`,
    };
  }

  // Check uppercase requirement
  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    return {
      isValid: false,
      errorCode: BASE_ERROR_CODES.PASSWORD_REQUIRES_UPPERCASE,
      errorMessage: "Password must contain at least one uppercase letter",
    };
  }

  // Check lowercase requirement
  if (config.requireLowercase && !/[a-z]/.test(password)) {
    return {
      isValid: false,
      errorCode: BASE_ERROR_CODES.PASSWORD_REQUIRES_LOWERCASE,
      errorMessage: "Password must contain at least one lowercase letter",
    };
  }

  // Check special character requirement
  const specialChars = config.specialCharacters || "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const specialCharRegex = new RegExp(`[${specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`);
  
  if (config.requireSpecialChar && !specialCharRegex.test(password)) {
    return {
      isValid: false,
      errorCode: BASE_ERROR_CODES.PASSWORD_REQUIRES_SPECIAL_CHAR,
      errorMessage: `Password must contain at least one special character (${specialChars})`,
    };
  }

  // Check number requirement
  if (config.requireNumber && !/[0-9]/.test(password)) {
    return {
      isValid: false,
      errorCode: BASE_ERROR_CODES.PASSWORD_REQUIRES_NUMBER,
      errorMessage: "Password must contain at least one number",
    };
  }

  return { isValid: true };
};
