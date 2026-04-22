import { APIError } from "better-auth/api";
import * as constants from "../constants.js";

export interface TimestampValidationOptions {
	clockSkew?: number;
	requireTimestamps?: boolean;
	logger?: {
		warn: (message: string, data?: Record<string, unknown>) => void;
	};
}

/** Conditions extracted from SAML assertion */
export interface SAMLConditions {
	notBefore?: string;
	notOnOrAfter?: string;
}

/**
 * Validates SAML assertion timestamp conditions (NotBefore/NotOnOrAfter).
 * Prevents acceptance of expired or future-dated assertions.
 * @throws {APIError} If timestamps are invalid, expired, or not yet valid
 */
export function validateSAMLTimestamp(
	conditions: SAMLConditions | undefined,
	options: TimestampValidationOptions = {},
): void {
	const clockSkew = options.clockSkew ?? constants.DEFAULT_CLOCK_SKEW_MS;
	const hasTimestamps = conditions?.notBefore || conditions?.notOnOrAfter;

	if (!hasTimestamps) {
		if (options.requireTimestamps) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion missing required timestamp conditions",
				details:
					"Assertions must include NotBefore and/or NotOnOrAfter conditions",
			});
		}
		options.logger?.warn(
			"SAML assertion accepted without timestamp conditions",
			{ hasConditions: !!conditions },
		);
		return;
	}

	const now = Date.now();

	if (conditions?.notBefore) {
		const notBeforeTime = new Date(conditions.notBefore).getTime();
		if (Number.isNaN(notBeforeTime)) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion has invalid NotBefore timestamp",
				details: `Unable to parse NotBefore value: ${conditions.notBefore}`,
			});
		}
		if (now < notBeforeTime - clockSkew) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion is not yet valid",
				details: `Current time is before NotBefore (with ${clockSkew}ms clock skew tolerance)`,
			});
		}
	}

	if (conditions?.notOnOrAfter) {
		const notOnOrAfterTime = new Date(conditions.notOnOrAfter).getTime();
		if (Number.isNaN(notOnOrAfterTime)) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion has invalid NotOnOrAfter timestamp",
				details: `Unable to parse NotOnOrAfter value: ${conditions.notOnOrAfter}`,
			});
		}
		if (now > notOnOrAfterTime + clockSkew) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion has expired",
				details: `Current time is after NotOnOrAfter (with ${clockSkew}ms clock skew tolerance)`,
			});
		}
	}
}
