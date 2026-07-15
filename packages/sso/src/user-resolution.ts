import { hasNativeTransactionSupport } from "@better-auth/core/context";
import type {
	DBAdapter,
	DBTransactionAdapter,
	GenericEndpointContext,
} from "better-auth";
import { APIError } from "better-auth/api";
import type { authenticateProviderUser } from "better-auth/oauth2";
import type {
	SSOOptions,
	SSOUserResolution,
	SSOUserResolutionInput,
} from "./types";

const SSO_USER_RESOLUTION_FAILED = "SSO_USER_RESOLUTION_FAILED" as const;
const SSO_USER_RESOLUTION_REQUIRES_NATIVE_TRANSACTIONS =
	"SSO_USER_RESOLUTION_REQUIRES_NATIVE_TRANSACTIONS" as const;
const SSO_AUTHENTICATION_FAILURE = Symbol("SSO_AUTHENTICATION_FAILURE");

type SSOAuthenticationResult = Awaited<
	ReturnType<typeof authenticateProviderUser>
>;

type SSOAuthenticationFailure = Error & {
	readonly [SSO_AUTHENTICATION_FAILURE]: true;
	readonly result: SSOAuthenticationResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isSSOUserResolution(value: unknown): value is SSOUserResolution {
	if (!isRecord(value)) return false;
	if (value.action === "default") return true;
	if (value.action === "link") {
		return (
			isNonEmptyString(value.userId) &&
			(value.profile === "preserve" || value.profile === "provider")
		);
	}
	return (
		value.action === "reject" &&
		isNonEmptyString(value.code) &&
		(value.message === undefined || typeof value.message === "string")
	);
}

type SSOUserResolutionLogger = Pick<
	GenericEndpointContext["context"]["logger"],
	"error"
>;

function logSSOUserResolutionFailure(
	logger: SSOUserResolutionLogger,
	message: string,
	error?: unknown,
): void {
	try {
		logger.error(message, ...(error === undefined ? [] : [error]));
	} catch {
		// A custom logger must not change the stable authentication failure.
	}
}

function userResolutionFailure(): APIError {
	return new APIError("INTERNAL_SERVER_ERROR", {
		code: SSO_USER_RESOLUTION_FAILED,
		message: "Unable to resolve the SSO user",
	});
}

/**
 * Calls and validates an application SSO resolver without exposing exceptions
 * or malformed JavaScript values to the authentication response.
 */
export async function resolveSSOUser(
	resolveUser: NonNullable<SSOOptions["resolveUser"]>,
	input: SSOUserResolutionInput,
	database: DBTransactionAdapter,
	logger: SSOUserResolutionLogger,
): Promise<SSOUserResolution> {
	let resolution: unknown;
	try {
		resolution = await resolveUser(input, { database });
	} catch (error) {
		logSSOUserResolutionFailure(logger, "SSO user resolution failed", error);
		throw userResolutionFailure();
	}
	if (!isSSOUserResolution(resolution)) {
		logSSOUserResolutionFailure(
			logger,
			"SSO user resolver returned an invalid decision",
		);
		throw userResolutionFailure();
	}
	return resolution;
}

/** Ensures SSO resolution and authentication can share one atomic boundary. */
export function assertSSOUserResolutionNativeTransactionSupport(
	adapter: Pick<DBAdapter, "options">,
): void {
	if (hasNativeTransactionSupport(adapter)) return;
	throw new APIError("NOT_IMPLEMENTED", {
		code: SSO_USER_RESOLUTION_REQUIRES_NATIVE_TRANSACTIONS,
		message:
			"SSO user resolution requires a database adapter with native transaction support",
	});
}

/**
 * Converts a returned authentication failure into an exception so the shared
 * user-resolution transaction cannot commit resolver or authentication writes.
 */
export function requireSuccessfulSSOAuthentication(
	result: SSOAuthenticationResult,
): SSOAuthenticationResult {
	if (!result.error) return result;
	throw Object.assign(new Error("SSO authentication failed"), {
		[SSO_AUTHENTICATION_FAILURE]: true as const,
		result,
	}) satisfies SSOAuthenticationFailure;
}

/** Returns the original result carried by a transaction rollback sentinel. */
export function getFailedSSOAuthenticationResult(
	error: unknown,
): SSOAuthenticationResult | undefined {
	if (
		!(error instanceof Error) ||
		!(SSO_AUTHENTICATION_FAILURE in error) ||
		error[SSO_AUTHENTICATION_FAILURE] !== true ||
		!("result" in error)
	) {
		return undefined;
	}
	return (error as SSOAuthenticationFailure).result;
}
