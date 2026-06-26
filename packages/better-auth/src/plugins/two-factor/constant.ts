export const TWO_FACTOR_COOKIE_NAME = "two_factor";
export const TRUST_DEVICE_COOKIE_NAME = "trust_device";
export const TRUST_DEVICE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// TODO(totp-attempt-cap): replace with a configurable budget shared across factors.
export const DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS = 5;
