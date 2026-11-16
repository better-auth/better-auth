/**
 * Verification key for database-backed OAuth and SAML relay state.
 */
export const getAuthStateVerificationIdentifier = (state: string) =>
	`auth-state:${state}`;
