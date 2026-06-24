export const TWO_FACTOR_COOKIE_NAME = "two_factor";
export const TRUST_DEVICE_COOKIE_NAME = "trust_device";
export const TRUST_DEVICE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * Wrong guesses allowed per sign-in 2FA challenge before it locks out.
 * `verify-otp` reads its own `OTPOptions.allowedAttempts`; `verify-totp` and
 * `verify-backup-code` share this constant so a single challenge cannot absorb
 * unlimited guesses.
 *
 * TODO(totp-attempt-cap): the per-sign-in-attempt budget in the two-factor
 * rewrite (RFC 0012 / PR #9278) replaces this per-challenge counter with a
 * configurable `maxVerificationAttempts` on the `signInAttempt` table that
 * covers all factors uniformly. Drop this constant when that lands on this line.
 */
export const DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS = 5;
