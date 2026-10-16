export const TWO_FACTOR_COOKIE_NAME = "two_factor";
export const TRUST_DEVICE_COOKIE_NAME = "trust_device";
export const TRUST_DEVICE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// TODO(totp-attempt-cap): replace with a configurable budget shared across factors.
export const DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS = 5;

// Account-level lockout: consecutive failed second-factor verifications across
// challenges and factors, capped per account (NIST SP 800-63B §5.2.2).
export const DEFAULT_ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS = 10;
export const DEFAULT_ACCOUNT_LOCKOUT_DURATION_SECONDS = 15 * 60;
