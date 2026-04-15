export const TWO_FACTOR_COOKIE_NAME = "two_factor";
export const TRUST_DEVICE_COOKIE_NAME = "trust_device";
export const TRUST_DEVICE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * Endpoints that mint a session as an authenticated transition rather
 * than a sign-in. The 2FA hook skips these because the operator driving
 * the transition cannot produce the target's second factor.
 */
export const SESSION_TRANSITION_PATH_PREFIXES: readonly string[] = [
	"/admin/impersonate-user",
	"/admin/stop-impersonating",
	"/multi-session/",
];
