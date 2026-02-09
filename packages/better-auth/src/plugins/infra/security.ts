/**
 * Security Client
 *
 * Thin client that forwards security checks to the Infra API
 */

import { createFetch } from "@better-fetch/fetch";
import { logger } from "better-auth";
import { DASH_API_URL } from "./constants";
import { createEmailSender } from "./email";
import type { Identification, IPLocation } from "./identification";

// Simple hash function for password fingerprinting (not for storage)
// Used to detect credential stuffing without sending raw passwords
async function hashForFingerprint(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha1Hash(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-1", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();
}

// ============================================================================
// Types
// ============================================================================

export type SecurityAction = "log" | "block" | "challenge";

export interface ThresholdConfig {
	challenge?: number;
	block?: number;
}

export interface SecurityOptions {
	unknownDeviceNotification?: boolean;
	credentialStuffing?: {
		enabled: boolean;
		thresholds?: ThresholdConfig;
		windowSeconds?: number;
		cooldownSeconds?: number;
	};
	impossibleTravel?: {
		enabled: boolean;
		maxSpeedKmh?: number;
		action?: SecurityAction;
	};
	geoBlocking?: {
		allowList?: string[];
		denyList?: string[];
		action?: "block" | "challenge";
	};
	botBlocking?: boolean | { action: SecurityAction };
	suspiciousIpBlocking?: boolean | { action: SecurityAction };
	velocity?: {
		enabled: boolean;
		thresholds?: ThresholdConfig;
		maxSignupsPerVisitor?: number;
		maxPasswordResetsPerIp?: number;
		maxSignInsPerIp?: number;
		windowSeconds?: number;
		action?: SecurityAction;
	};
	freeTrialAbuse?: {
		enabled: boolean;
		thresholds?: ThresholdConfig;
		maxAccountsPerVisitor?: number;
		action?: SecurityAction;
	};
	compromisedPassword?: {
		enabled: boolean;
		action?: SecurityAction;
		minBreachCount?: number;
	};
	emailValidation?: {
		enabled?: boolean;
		strictness?: "low" | "medium" | "high";
		action?: SecurityAction;
	};
	staleUsers?: {
		enabled: boolean;
		staleDays?: number;
		action?: SecurityAction;
		notifyUser?: boolean;
		notifyAdmin?: boolean;
		adminEmail?: string;
	};
	challengeDifficulty?: number;
}

export interface SecurityVerdict {
	action: "allow" | "challenge" | "block";
	challenge?: string;
	reason?: string;
	details?: Record<string, unknown>;
}

export interface SecurityCheckRequest {
	visitorId: string | null;
	requestId: string | null;
	ip: string | null;
	path: string;
	identifier?: string;
	powSolution?: string;
}

export interface CredentialStuffingResult {
	blocked: boolean;
	challenged?: boolean;
	challenge?: string;
	reason?: string;
	details?: Record<string, unknown>;
}

export interface ImpossibleTravelResult {
	isImpossible: boolean;
	action?: "allow" | "challenge" | "block";
	challenged?: boolean;
	challenge?: string;
	distance?: number;
	timeElapsedHours?: number;
	speedRequired?: number;
	from?: { city: string | null; country: string | null } | null;
	to?: { city: string | null; country: string | null } | null;
}

export interface CompromisedPasswordResult {
	compromised: boolean;
	breachCount?: number;
	action?: SecurityAction;
}

export interface StaleUserResult {
	isStale: boolean;
	daysSinceLastActive?: number;
	staleDays?: number;
	lastActiveAt?: string | null;
	action?: SecurityAction;
	notifyUser?: boolean;
	notifyAdmin?: boolean;
}

export interface SecurityEvent {
	type: SecurityEventType;
	timestamp: number;
	userId: string | null;
	visitorId: string | null;
	ip: string | null;
	country: string | null;
	details: Record<string, unknown>;
	action: "logged" | "blocked" | "challenged";
}

export type SecurityEventType =
	| "unknown_device"
	| "credential_stuffing"
	| "impossible_travel"
	| "geo_blocked"
	| "bot_blocked"
	| "suspicious_ip_detected"
	| "velocity_exceeded"
	| "free_trial_abuse"
	| "compromised_password"
	| "stale_account_reactivation";

// ============================================================================
// Security Client
// ============================================================================

export function createSecurityClient(
	apiUrl: string,
	apiKey: string,
	options: SecurityOptions,
	onSecurityEvent?: (event: SecurityEvent) => void,
) {
	const resolvedApiUrl = apiUrl || DASH_API_URL;
	const $api = createFetch({
		baseURL: resolvedApiUrl,
		headers: {
			"x-api-key": apiKey,
		},
	});

	// Create email sender for security notifications
	const emailSender = createEmailSender({
		apiUrl: resolvedApiUrl,
		apiKey,
	});

	function logEvent(event: Omit<SecurityEvent, "timestamp">) {
		const fullEvent: SecurityEvent = {
			...event,
			timestamp: Date.now(),
		};

		if (onSecurityEvent) {
			onSecurityEvent(fullEvent);
		}
	}

	return {
		// ========================================================================
		// Main Security Check
		// ========================================================================

		async checkSecurity(
			request: SecurityCheckRequest,
		): Promise<SecurityVerdict> {
			try {
				const { data } = await $api<SecurityVerdict>("/security/check", {
					method: "POST",
					body: {
						...request,
						config: options,
					},
				});

				if (data && data.action !== "allow") {
					logEvent({
						type: this.mapReasonToEventType(data.reason),
						userId: null,
						visitorId: request.visitorId,
						ip: request.ip,
						country: null,
						details: data.details || { reason: data.reason },
						action: data.action === "block" ? "blocked" : "challenged",
					});
				}

				return data || { action: "allow" };
			} catch (error) {
				logger.error("[Dash] Security check failed:", error);
				return { action: "allow" };
			}
		},

		mapReasonToEventType(reason?: string): SecurityEventType {
			switch (reason) {
				case "geo_blocked":
					return "geo_blocked";
				case "bot_detected":
					return "bot_blocked";
				case "suspicious_ip_detected":
					return "suspicious_ip_detected";
				case "rate_limited":
					return "velocity_exceeded";
				case "credential_stuffing_cooldown":
					return "credential_stuffing";
				default:
					return "credential_stuffing";
			}
		},

		// ========================================================================
		// Track Failed Login (Credential Stuffing)
		// ========================================================================

		async trackFailedAttempt(
			identifier: string,
			visitorId: string,
			password: string,
			ip: string | null,
		): Promise<CredentialStuffingResult> {
			try {
				// Hash password before sending to API for privacy
				// This allows detecting "same password across accounts" patterns
				// without exposing the actual password
				const passwordHash = await hashForFingerprint(password);

				const { data } = await $api<CredentialStuffingResult>(
					"/security/track-failed-login",
					{
						method: "POST",
						body: {
							identifier,
							visitorId,
							passwordHash,
							ip,
							config: options,
						},
					},
				);

				if (data?.blocked || data?.challenged) {
					logEvent({
						type: "credential_stuffing",
						userId: null,
						visitorId,
						ip,
						country: null,
						details: data.details || { reason: data.reason },
						action: data.blocked ? "blocked" : "challenged",
					});
				}

				return data || { blocked: false };
			} catch (error) {
				logger.error("[Dash] Track failed attempt error:", error);
				return { blocked: false };
			}
		},

		// ========================================================================
		// Clear Failed Attempts (on successful login)
		// ========================================================================

		async clearFailedAttempts(identifier: string): Promise<void> {
			try {
				await $api("/security/clear-failed-attempts", {
					method: "POST",
					body: { identifier },
				});
			} catch (error) {
				logger.error("[Dash] Clear failed attempts error:", error);
			}
		},

		// ========================================================================
		// Check if Blocked
		// ========================================================================

		async isBlocked(visitorId: string): Promise<boolean> {
			try {
				const { data } = await $api<{ blocked: boolean }>(
					`/security/is-blocked?visitorId=${encodeURIComponent(visitorId)}`,
					{ method: "GET" },
				);
				return data?.blocked ?? false;
			} catch {
				return false;
			}
		},

		// ========================================================================
		// PoW Challenge
		// ========================================================================

		async verifyPoWSolution(
			visitorId: string,
			solution: string,
		): Promise<{ valid: boolean; reason?: string }> {
			try {
				const { data } = await $api<{ valid: boolean; reason?: string }>(
					"/security/pow/verify",
					{
						method: "POST",
						body: { visitorId, solution },
					},
				);
				return data || { valid: false, reason: "unknown" };
			} catch {
				return { valid: false, reason: "error" };
			}
		},

		async generateChallenge(visitorId: string): Promise<string> {
			try {
				const { data } = await $api<{ challenge: string }>(
					"/security/pow/generate",
					{
						method: "POST",
						body: { visitorId, difficulty: options.challengeDifficulty },
					},
				);
				return data?.challenge || "";
			} catch {
				return "";
			}
		},

		// ========================================================================
		// Impossible Travel
		// ========================================================================

		async checkImpossibleTravel(
			userId: string,
			currentLocation: IPLocation | null,
			visitorId: string,
		): Promise<ImpossibleTravelResult | null> {
			if (!options.impossibleTravel?.enabled || !currentLocation) {
				return null;
			}

			try {
				const { data } = await $api<ImpossibleTravelResult>(
					"/security/impossible-travel",
					{
						method: "POST",
						body: {
							userId,
							visitorId,
							location: currentLocation,
							config: options,
						},
					},
				);

				if (data?.isImpossible) {
					const actionTaken =
						data.action === "block"
							? "blocked"
							: data.action === "challenge"
								? "challenged"
								: "logged";

					logEvent({
						type: "impossible_travel",
						userId,
						visitorId: visitorId || null,
						ip: null,
						country: currentLocation.country?.code || null,
						details: {
							from: data.from,
							to: data.to,
							distance: data.distance,
							speedRequired: data.speedRequired,
							action: data.action,
						},
						action: actionTaken,
					});
				}

				return data || null;
			} catch {
				return null;
			}
		},

		/**
		 * Store user's last known location for impossible travel detection
		 */
		async storeLastLocation(
			userId: string,
			location: IPLocation | null,
		): Promise<void> {
			if (!location) return;

			try {
				await $api("/security/store-last-login", {
					method: "POST",
					body: { userId, location },
				});
			} catch (error) {
				logger.error("[Dash] Store last location error:", error);
			}
		},

		// ========================================================================
		// Free Trial Abuse
		// ========================================================================

		/**
		 * Check if a visitor has exceeded the free trial signup limit.
		 */
		async checkFreeTrialAbuse(
			visitorId: string,
		): Promise<{
			isAbuse: boolean;
			accountCount: number;
			maxAccounts: number;
			action: SecurityAction;
		}> {
			if (!options.freeTrialAbuse?.enabled) {
				return {
					isAbuse: false,
					accountCount: 0,
					maxAccounts: 0,
					action: "log",
				};
			}

			try {
				const { data } = await $api<{
					isAbuse: boolean;
					accountCount: number;
					maxAccounts: number;
					action: SecurityAction;
				}>("/security/free-trial-abuse/check", {
					method: "POST",
					body: { visitorId, config: options },
				});

				if (data?.isAbuse) {
					logEvent({
						type: "free_trial_abuse",
						userId: null,
						visitorId,
						ip: null,
						country: null,
						details: {
							accountCount: data.accountCount,
							maxAccounts: data.maxAccounts,
						},
						action: data.action === "block" ? "blocked" : "logged",
					});
				}

				return (
					data || {
						isAbuse: false,
						accountCount: 0,
						maxAccounts: 0,
						action: "log",
					}
				);
			} catch {
				return {
					isAbuse: false,
					accountCount: 0,
					maxAccounts: 0,
					action: "log",
				};
			}
		},

		/**
		 * Track a new signup for free trial abuse detection.
		 * Stores the userId for auditing purposes.
		 */
		async trackFreeTrialSignup(
			visitorId: string,
			userId: string,
		): Promise<void> {
			if (!options.freeTrialAbuse?.enabled) {
				return;
			}

			try {
				await $api("/security/free-trial-abuse/track", {
					method: "POST",
					body: { visitorId, userId },
				});
			} catch (error) {
				logger.error("[Dash] Track free trial signup error:", error);
			}
		},

		async checkCompromisedPassword(
			password: string,
		): Promise<CompromisedPasswordResult> {
			try {
				const hash = await sha1Hash(password);
				const prefix = hash.substring(0, 5);
				const suffix = hash.substring(5);

				const { data } = await $api<{
					enabled: boolean;
					action?: SecurityAction;
					minBreachCount?: number;
					suffixes: Record<string, number>;
				}>("/security/breached-passwords", {
					method: "POST",
					body: { passwordPrefix: prefix, config: options },
				});

				if (!data?.enabled) {
					return { compromised: false };
				}

				const suffixes = data.suffixes || {};
				const breachCount = suffixes[suffix] || 0;
				const minBreachCount = data.minBreachCount ?? 1;
				const action = data.action || "block";
				const compromised = breachCount >= minBreachCount;

				if (compromised) {
					logEvent({
						type: "compromised_password",
						userId: null,
						visitorId: null,
						ip: null,
						country: null,
						details: {
							breachCount,
						},
						action:
							action === "block"
								? "blocked"
								: action === "challenge"
									? "challenged"
									: "logged",
					});
				}

				return {
					compromised,
					breachCount: breachCount > 0 ? breachCount : undefined,
					action: compromised ? action : undefined,
				};
			} catch (error) {
				logger.error("[Dash] Compromised password check error:", error);
				return { compromised: false };
			}
		},

		/**
		 * Check if a user account is stale (inactive for a configured period)
		 * This helps detect potential account takeover when dormant accounts become active
		 */
		async checkStaleUser(
			userId: string,
			lastActiveAt: Date | string | null,
		): Promise<StaleUserResult> {
			if (!options.staleUsers?.enabled) {
				return { isStale: false };
			}

			try {
				const { data } = await $api<StaleUserResult>("/security/stale-user", {
					method: "POST",
					body: {
						userId,
						lastActiveAt:
							lastActiveAt instanceof Date
								? lastActiveAt.toISOString()
								: lastActiveAt,
						config: options,
					},
				});

				if (data?.isStale) {
					logEvent({
						type: "stale_account_reactivation",
						userId,
						visitorId: null,
						ip: null,
						country: null,
						details: {
							daysSinceLastActive: data.daysSinceLastActive,
							staleDays: data.staleDays,
							lastActiveAt: data.lastActiveAt,
							notifyUser: data.notifyUser,
							notifyAdmin: data.notifyAdmin,
						},
						action:
							data.action === "block"
								? "blocked"
								: data.action === "challenge"
									? "challenged"
									: "logged",
					});
				}

				return data || { isStale: false };
			} catch (error) {
				logger.error("[Dash] Stale user check error:", error);
				return { isStale: false };
			}
		},

		/**
		 * Send stale account reactivation notification to the user
		 */
		async notifyStaleAccountUser(
			userEmail: string,
			userName: string | null,
			daysSinceLastActive: number,
			identification: Identification | null,
			appName?: string,
		): Promise<void> {
			const loginTime =
				new Date().toLocaleString("en-US", {
					dateStyle: "long",
					timeStyle: "short",
					timeZone: "UTC",
				}) + " UTC";

			const location = identification?.location;
			const loginLocation =
				location?.city && location?.country?.name
					? `${location.city}, ${location.country.code}`
					: location?.country?.name || "Unknown";

			const browser = identification?.browser;
			const loginDevice =
				browser?.name && browser?.os
					? `${browser.name} on ${browser.os}`
					: "Unknown device";

			const result = await emailSender.send({
				template: "stale-account-user",
				to: userEmail,
				variables: {
					userEmail,
					userName: userName || "User",
					appName: appName || "Your App",
					daysSinceLastActive: String(daysSinceLastActive),
					loginTime,
					loginLocation,
					loginDevice,
					loginIp: identification?.ip || "Unknown",
				},
			});

			if (result.success) {
				logger.info(
					`[Dash] Stale account notification sent to user: ${userEmail}`,
				);
			} else {
				logger.error(
					`[Dash] Failed to send stale account user notification: ${result.error}`,
				);
			}
		},

		/**
		 * Send stale account reactivation notification to the admin
		 */
		async notifyStaleAccountAdmin(
			adminEmail: string,
			userId: string,
			userEmail: string,
			userName: string | null,
			daysSinceLastActive: number,
			identification: Identification | null,
			appName?: string,
		): Promise<void> {
			const loginTime =
				new Date().toLocaleString("en-US", {
					dateStyle: "long",
					timeStyle: "short",
					timeZone: "UTC",
				}) + " UTC";

			const location = identification?.location;
			const loginLocation =
				location?.city && location?.country?.name
					? `${location.city}, ${location.country.code}`
					: location?.country?.name || "Unknown";

			const browser = identification?.browser;
			const loginDevice =
				browser?.name && browser?.os
					? `${browser.name} on ${browser.os}`
					: "Unknown device";

			const result = await emailSender.send({
				template: "stale-account-admin",
				to: adminEmail,
				variables: {
					userEmail,
					userName: userName || "User",
					userId,
					appName: appName || "Your App",
					daysSinceLastActive: String(daysSinceLastActive),
					loginTime,
					loginLocation,
					loginDevice,
					loginIp: identification?.ip || "Unknown",
					adminEmail,
				},
			});

			if (result.success) {
				logger.info(
					`[Dash] Stale account admin notification sent to: ${adminEmail}`,
				);
			} else {
				logger.error(
					`[Dash] Failed to send stale account admin notification: ${result.error}`,
				);
			}
		},

		// ========================================================================
		// Unknown Device Detection (local - uses KV directly for simplicity)
		// ========================================================================

		async checkUnknownDevice(
			_userId: string,
			_visitorId: string,
		): Promise<boolean> {
			// This is kept local for now as it requires direct user session context
			// The actual check happens via the main checkSecurity call
			return false;
		},

		async notifyUnknownDevice(
			userId: string,
			email: string,
			identification: Identification | null,
		): Promise<void> {
			logEvent({
				type: "unknown_device",
				userId,
				visitorId: identification?.visitorId || null,
				ip: identification?.ip || null,
				country: identification?.location?.country?.code || null,
				details: {
					email,
					device: identification?.browser.device,
					os: identification?.browser.os,
					browser: identification?.browser.name,
					city: identification?.location?.city,
					country: identification?.location?.country?.name,
				},
				action: "logged",
			});
		},
	};
}

export type SecurityClient = ReturnType<typeof createSecurityClient>;
