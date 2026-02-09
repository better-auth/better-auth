import { createAuthMiddleware } from "@better-auth/core/api";
import { createFetch } from "@better-fetch/fetch";
import type { User } from "better-auth";
import { logger } from "better-auth";
import { APIError } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth/types";
import { DASH_API_URL, DASH_KV_URL } from "../constants";
import type { SecurityAction } from "../security";
import { allEmail, allEmailSignIn } from "./matchers";

// ============================================================================
// Email Normalization
// ============================================================================

/**
 * Gmail-like providers that ignore dots in the local part
 */
const GMAIL_LIKE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Providers known to support plus addressing
 */
const PLUS_ADDRESSING_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"outlook.com",
	"hotmail.com",
	"live.com",
	"yahoo.com",
	"icloud.com",
	"me.com",
	"mac.com",
	"protonmail.com",
	"proton.me",
	"fastmail.com",
	"zoho.com",
]);

/**
 * Normalize an email address for comparison/deduplication
 * - Lowercase the entire email
 * - Remove dots from Gmail-like providers (they ignore dots)
 * - Remove plus addressing (user+tag@domain → user@domain)
 * - Normalize googlemail.com to gmail.com
 */
function normalizeEmail(email: string): string {
	if (!email || typeof email !== "string") {
		return email;
	}

	const trimmed = email.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf("@");

	if (atIndex === -1) {
		return trimmed;
	}

	let localPart = trimmed.slice(0, atIndex);
	let domain = trimmed.slice(atIndex + 1);

	// Normalize googlemail.com to gmail.com
	if (domain === "googlemail.com") {
		domain = "gmail.com";
	}

	// Remove plus addressing for supported providers
	if (PLUS_ADDRESSING_DOMAINS.has(domain)) {
		const plusIndex = localPart.indexOf("+");
		if (plusIndex !== -1) {
			localPart = localPart.slice(0, plusIndex);
		}
	}

	// Remove dots for Gmail-like providers
	if (GMAIL_LIKE_DOMAINS.has(domain)) {
		localPart = localPart.replace(/\./g, "");
	}

	return `${localPart}@${domain}`;
}

// ============================================================================
// Types
// ============================================================================

interface Context {
	body?: Record<string, unknown>;
	query?: Record<string, unknown>;
}

interface EmailValidityPolicy {
	id: string;
	enabled: boolean;
	action: "allow" | "block";
	strictness: "low" | "medium" | "high";
}

interface EmailValidationResult {
	valid: boolean;
	disposable?: boolean;
	reason?: string;
	confidence?: "high" | "medium" | "low";
	details?: {
		tier?: 1 | 2 | 3;
		mxServers?: string[];
		domainScore?: number;
		flags?: string[];
	};
}

export interface DisposableEmailEvent {
	email: string;
	reason: string;
	confidence?: string;
	ip?: string;
	path?: string;
	action?: "allow" | "block";
}

interface EmailValidationOptions {
	/** Use API-backed validation (requires apiKey) */
	useApi?: boolean;
	/** API key for remote validation */
	apiKey?: string;
	/** API URL for remote validation */
	apiUrl?: string;
	/** KV URL for email validation */
	kvUrl?: string;
	/** Default configuration for email validation */
	defaultConfig?: EmailValidatorConfig;
	/** Callback when disposable email is detected (for security event logging) */
	onDisposableEmail?: (data: DisposableEmailEvent) => void;
}

// ============================================================================
// Email Validation Client
// ============================================================================

export interface EmailValidatorConfig {
	enabled?: boolean;
	strictness?: "low" | "medium" | "high";
	action?: SecurityAction;
}

export function createEmailValidator(
	options: {
		apiKey?: string;
		apiUrl?: string;
		kvUrl?: string;
		defaultConfig?: EmailValidatorConfig;
	} = {},
) {
	const {
		apiKey = "",
		apiUrl = DASH_API_URL,
		kvUrl = DASH_KV_URL,
		defaultConfig = {},
	} = options;

	const $api = createFetch({
		baseURL: apiUrl,
		headers: {
			"x-api-key": apiKey,
		},
	});

	const $kv = createFetch({
		baseURL: kvUrl,
		headers: {
			"x-api-key": apiKey,
		},
	});

	/**
	 * Fetch and resolve email validity policy from API with caching
	 * Sends client config to API which merges with user's dashboard settings
	 */
	async function fetchPolicy(): Promise<EmailValidityPolicy | null> {
		try {
			const { data } = await $api<{ policy: EmailValidityPolicy }>(
				"/security/resolve-policy",
				{
					method: "POST",
					body: {
						policyId: "email_validity",
						config: {
							emailValidation: {
								enabled: defaultConfig.enabled,
								strictness: defaultConfig.strictness,
								action: defaultConfig.action,
							},
						},
					},
				},
			);

			if (data?.policy) {
				return data.policy as EmailValidityPolicy;
			}
		} catch (error) {
			logger.warn(
				"[Dash] Failed to fetch email policy, using defaults:",
				error,
			);
		}
		return null;
	}

	return {
		/**
		 * Validate an email address
		 * Returns validation result - caller should use getPolicy() to determine action
		 */
		async validate(
			email: string,
			checkMx: boolean = true,
		): Promise<EmailValidationResult & { policy: EmailValidityPolicy | null }> {
			const policy = await fetchPolicy();

			if (!policy?.enabled) {
				return {
					valid: true,
					disposable: false,
					confidence: "high",
					policy,
				};
			}

			try {
				const { data } = await $kv<EmailValidationResult>("/email/validate", {
					method: "POST",
					body: {
						email,
						checkMx,
						strictness: policy.strictness,
					},
				});

				return {
					...(data || { valid: false, reason: "invalid_format" }),
					policy,
				};
			} catch (error) {
				// On error, fall back to allowing the email
				// (better to let invalid emails through than block valid ones)
				logger.warn(
					"[Dash] Email validation API error, falling back to allow:",
					error,
				);
				return {
					valid: true,
					policy,
				};
			}
		},
	};
}

// ============================================================================
// Standalone Validation Functions (for backwards compatibility)
// ============================================================================

let defaultValidator: ReturnType<typeof createEmailValidator> | null = null;

function getDefaultValidator(): ReturnType<typeof createEmailValidator> {
	if (!defaultValidator) {
		// Standalone usage - validation will be done without API key
		// The API allows public access but API key provides better rate limits
		defaultValidator = createEmailValidator({ apiKey: "" });
	}
	return defaultValidator;
}

/**
 * Validate email format, check against disposable providers, and detect fake emails.
 * Uses the multi-tier validation pipeline:
 * - Tier 1: Bloom filter blocklist lookup (instant)
 * - Tier 2: MX record analysis (catches infrastructure-level disposables)
 * - Tier 3: Domain heuristics (catches new/unknown disposables)
 */
export const validateEmail = async (email: string): Promise<boolean> => {
	const result = await getDefaultValidator().validate(email, true);
	return result.valid;
};

/**
 * Validate email with MX record check (same as validateEmail)
 * @deprecated Use validateEmail instead, MX check is now always enabled
 */
export const validateEmailWithMx = async (email: string): Promise<boolean> => {
	const result = await getDefaultValidator().validate(email, true);
	return result.valid;
};

/**
 * Get detailed validation result for an email
 */
export const validateEmailDetailed = async (
	email: string,
): Promise<EmailValidationResult> => {
	return getDefaultValidator().validate(email, true);
};

// ============================================================================
// Local Fallback Validation (for when API is unavailable)
// ============================================================================

/**
 * Basic local email format validation (fallback)
 */
function isValidEmailFormatLocal(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) return false;
	if (email.length > 254) return false;
	const [localPart, domain] = email.split("@");
	if (!localPart || !domain) return false;
	if (localPart.length > 64) return false;
	if (domain.length > 253) return false;
	return true;
}

// ============================================================================
// Shared Hook Components
// ============================================================================

type GetEmail = (ctx: Context) => {
	email: unknown;
	container: "body" | "query";
};

const getEmail: GetEmail = (ctx) => ({
	email: ctx.body?.email ?? ctx.query?.email,
	container: ctx.body ? "body" : "query",
});

/**
 * Create email normalization hook (shared between all configurations)
 */
function createEmailNormalizationHook() {
	return {
		matcher: allEmailSignIn,
		handler: createAuthMiddleware(async (ctx) => {
			const { email, container } = getEmail(ctx);

			if (typeof email !== "string") return;

			const normalizedEmail = normalizeEmail(email);

			if (normalizedEmail !== email) {
				const user = await ctx.context.adapter.findOne<User>({
					model: "user",
					where: [
						{
							field: "normalizedEmail",
							value: normalizedEmail,
						},
					],
				});

				if (!user) return;

				return container === "query"
					? {
							context: {
								...ctx,
								query: {
									...ctx.query,
									email: user.email,
									normalizedEmail,
								},
							},
						}
					: {
							context: {
								...ctx,
								body: {
									...(ctx.body as Context["body"]),
									email: user.email,
									normalizedEmail,
								},
							},
						};
			}
		}),
	};
}

/**
 * Create email validation hook with configurable validation strategy
 */
function createEmailValidationHook(
	validator?: ReturnType<typeof createEmailValidator>,
	onDisposableEmail?: EmailValidationOptions["onDisposableEmail"],
) {
	return {
		matcher: allEmail,
		handler: createAuthMiddleware(async (ctx) => {
			const email =
				ctx.path === "/change-email"
					? (ctx.body as Context["body"])?.newEmail
					: getEmail(ctx).email;

			if (typeof email !== "string") return;

			// Quick local format check first (always performed)
			if (!isValidEmailFormatLocal(email)) {
				throw new APIError("BAD_REQUEST", { message: "Invalid email" });
			}

			// Full validation via API if validator is provided
			if (validator) {
				const result = await validator.validate(email);
				const policy = result.policy;

				if (!policy?.enabled) {
					return;
				}

				const action = policy.action;

				if (!result.valid) {
					// Track invalid email attempts as security events
					const shouldTrack =
						result.disposable ||
						result.reason === "no_mx_records" ||
						result.reason === "blocklist";

					if (shouldTrack && onDisposableEmail) {
						const ip =
							ctx.request?.headers?.get("x-forwarded-for")?.split(",")[0] ||
							ctx.request?.headers?.get("cf-connecting-ip") ||
							undefined;

						onDisposableEmail({
							email,
							reason: result.reason || "disposable",
							confidence: result.confidence,
							ip,
							path: ctx.path,
							action,
						});
					}

					if (action === "allow") {
						// Log only - event is already tracked above, allow request to proceed
						return;
					}

					const message =
						result.reason === "no_mx_records"
							? "This email domain cannot receive emails"
							: result.disposable || result.reason === "blocklist"
								? "Disposable email addresses are not allowed"
								: result.reason === "fake_domain" ||
										result.reason === "fake_pattern"
									? "This email address appears to be invalid"
									: "Invalid email";

					throw new APIError("BAD_REQUEST", { message });
				}
			}
		}),
	};
}

// ============================================================================
// Email Hooks Factory
// ============================================================================

/**
 * Create email validation hooks with optional API-backed validation
 *
 * @param options - Configuration options
 * @param options.enabled - Enable email validation (default: true)
 * @param options.useApi - Use API-backed validation (requires apiKey)
 * @param options.apiKey - API key for remote validation
 * @param options.apiUrl - API URL for policy fetching (defaults to DASH_API_URL)
 * @param options.kvUrl - KV URL for email validation (defaults to DASH_KV_URL)
 * @param options.strictness - Default strictness level: 'low', 'medium' (default), or 'high'
 * @param options.action - Default action when invalid: 'allow', 'block' (default), or 'challenge'
 *
 * @example
 * // Local validation only
 * createEmailHooks()
 *
 * @example
 * // API-backed validation
 * createEmailHooks({ useApi: true, apiKey: "your-api-key" })
 *
 * @example
 * // API-backed validation with high strictness default
 * createEmailHooks({ useApi: true, apiKey: "your-api-key", strictness: "high" })
 */
export function createEmailHooks(options: EmailValidationOptions = {}) {
	const {
		useApi = false,
		apiKey = "",
		apiUrl = DASH_API_URL,
		kvUrl = DASH_KV_URL,
		defaultConfig,
		onDisposableEmail,
	} = options;

	const emailConfig: EmailValidatorConfig = {
		enabled: true,
		strictness: "medium",
		action: "block",
		...defaultConfig,
	};

	// When validation is disabled, return empty hooks (no validation performed)
	if (!emailConfig.enabled) {
		return {
			before: [],
		} satisfies BetterAuthPlugin["hooks"];
	}

	// Create validator that fetches policy from API and validates via KV
	const validator = useApi
		? createEmailValidator({
				apiUrl,
				kvUrl,
				apiKey,
				defaultConfig: emailConfig,
			})
		: undefined;

	return {
		before: [
			createEmailValidationHook(validator, onDisposableEmail),
			createEmailNormalizationHook(),
		],
	} satisfies BetterAuthPlugin["hooks"];
}

// ============================================================================
// Default Email Hooks (backwards compatibility)
// ============================================================================

/**
 * Default email hooks using local validation only
 * For API-backed validation, use createEmailHooks({ useApi: true, apiKey: "..." })
 */
export const emailHooks = createEmailHooks();
