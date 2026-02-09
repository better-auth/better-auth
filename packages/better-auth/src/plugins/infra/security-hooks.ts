/**
 * Security Hooks
 *
 * Consolidated security check logic for the dash plugin.
 * This module extracts the repetitive security check patterns into reusable functions.
 */

import { APIError } from "better-auth";
import type { Identification } from "./identification";
import type { SecurityClient, SecurityVerdict } from "./security";

// ============================================================================
// Types
// ============================================================================

export interface SecurityCheckContext {
	path: string;
	identifier?: string;
	visitorId: string | null;
	identification: Identification | null;
	userAgent: string;
}

export interface TrackEventParams {
	eventKey: string;
	eventType: string;
	eventDisplayName: string;
	eventData: Record<string, unknown>;
	ipAddress?: string;
	city?: string;
	country?: string;
	countryCode?: string;
}

export type TrackEventFn = (params: TrackEventParams) => void;

export interface SecurityCheckResult {
	blocked: boolean;
	challenged: boolean;
	challenge?: string;
}

// Error messages for each security check type
const ERROR_MESSAGES: Record<string, string> = {
	geo_blocked: "Access from your location is not allowed.",
	bot_detected: "Automated access is not allowed.",
	suspicious_ip_detected:
		"Anonymous connections (VPN, proxy, Tor) are not allowed.",
	rate_limited: "Too many attempts. Please try again later.",
	compromised_password:
		"This password has been found in data breaches. Please choose a different password.",
	impossible_travel: "Login blocked due to suspicious location change.",
};

// Display names for security events
const DISPLAY_NAMES: Record<string, { challenge: string; block: string }> = {
	geo_blocked: {
		challenge: "Security: geo challenge",
		block: "Security: geo blocked",
	},
	bot_detected: {
		challenge: "Security: bot challenge",
		block: "Security: bot blocked",
	},
	suspicious_ip_detected: {
		challenge: "Security: anonymous IP challenge",
		block: "Security: anonymous IP blocked",
	},
	rate_limited: {
		challenge: "Security: velocity challenge",
		block: "Security: velocity exceeded",
	},
	compromised_password: {
		challenge: "Security: breached password warning",
		block: "Security: breached password blocked",
	},
	impossible_travel: {
		challenge: "Security: impossible travel challenge",
		block: "Security: impossible travel blocked",
	},
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Throw a challenge error with appropriate headers
 */
export function throwChallengeError(
	challenge: string,
	reason: string,
	message: string = "Please complete a security check to continue.",
): never {
	const error = new APIError("LOCKED", {
		message,
		code: "POW_CHALLENGE_REQUIRED",
	});
	// Add challenge header to the error response
	(error as APIError & { headers?: Record<string, string> }).headers = {
		"X-PoW-Challenge": challenge,
		"X-PoW-Reason": reason,
	};
	throw error;
}

/**
 * Build common event data for security tracking
 */
function buildEventData(
	ctx: SecurityCheckContext,
	action: "challenged" | "blocked",
	reason: string,
	confidence: number = 1.0,
	extraData?: Record<string, unknown>,
): TrackEventParams {
	const { visitorId, identification, path, identifier, userAgent } = ctx;
	const countryCode = identification?.location?.country?.code || undefined;

	return {
		eventKey: visitorId || identification?.ip || "unknown",
		eventType:
			action === "challenged" ? "security_challenged" : "security_blocked",
		eventDisplayName:
			DISPLAY_NAMES[reason]?.[
				action === "challenged" ? "challenge" : "block"
			] || `Security: ${reason}`,
		eventData: {
			action,
			reason,
			visitorId: visitorId || "",
			path,
			userAgent,
			identifier,
			confidence,
			...extraData,
		},
		ipAddress: identification?.ip || undefined,
		city: identification?.location?.city || undefined,
		country: identification?.location?.country?.name || undefined,
		countryCode,
	};
}

// ============================================================================
// Main Security Check Handler
// ============================================================================

/**
 * Handle a security check result by tracking events and throwing appropriate errors
 *
 * @param verdict - The security verdict from the security service
 * @param ctx - Security check context with request information
 * @param trackEvent - Function to track security events
 * @param securityService - Security service for generating challenges
 * @returns True if the request should be blocked
 */
export async function handleSecurityVerdict(
	verdict: SecurityVerdict,
	ctx: SecurityCheckContext,
	trackEvent: TrackEventFn,
	securityService: SecurityClient,
): Promise<void> {
	if (verdict.action === "allow") {
		return;
	}

	const reason = verdict.reason || "unknown";
	const confidence = 1.0;

	if (verdict.action === "challenge" && ctx.visitorId) {
		// Track the challenge event
		trackEvent(
			buildEventData(ctx, "challenged", reason, confidence, verdict.details),
		);

		// Generate and throw challenge
		const challenge =
			verdict.challenge ||
			(await securityService.generateChallenge(ctx.visitorId));
		throwChallengeError(
			challenge,
			reason,
			"Please complete a security check to continue.",
		);
	} else if (verdict.action === "block") {
		// Track the block event
		trackEvent(
			buildEventData(ctx, "blocked", reason, confidence, verdict.details),
		);

		// Throw appropriate error
		const errorMessage = ERROR_MESSAGES[reason] || "Access denied.";
		throw new APIError("FORBIDDEN", { message: errorMessage });
	}
}

/**
 * Run all security checks using the consolidated checkSecurity API
 *
 * This replaces the multiple individual check calls with a single API call
 * that handles all security checks server-side.
 */
export async function runSecurityChecks(
	ctx: SecurityCheckContext,
	securityService: SecurityClient,
	trackEvent: TrackEventFn,
	powVerified: boolean,
): Promise<void> {
	// If PoW was verified, skip all checks
	if (powVerified) {
		return;
	}

	// Perform consolidated security check
	const verdict = await securityService.checkSecurity({
		visitorId: ctx.visitorId,
		requestId: ctx.identification?.requestId || null,
		ip: ctx.identification?.ip || null,
		path: ctx.path,
		identifier: ctx.identifier,
	});

	// Handle the verdict (will throw if blocked/challenged)
	await handleSecurityVerdict(verdict, ctx, trackEvent, securityService);
}
