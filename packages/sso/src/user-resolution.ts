import { getCurrentDBAdapterAsyncLocalStorage } from "@better-auth/core/context";
import type {
	DBAdapter,
	DBTransactionAdapter,
	GenericEndpointContext,
} from "better-auth";
import { APIError } from "better-auth/api";
import type { handleOAuthUserInfo } from "better-auth/oauth2";
import type {
	SSOOptions,
	SSOUserResolution,
	SSOUserResolutionInput,
} from "./types";

const SSO_AUTHENTICATION_FAILURE = Symbol("SSO_AUTHENTICATION_FAILURE");

type SSOAuthenticationResult = Awaited<ReturnType<typeof handleOAuthUserInfo>>;
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
	if (value.action === "continue") return true;
	if (value.action === "link") {
		return (
			isNonEmptyString(value.userId) &&
			(value.profile === "preserve" || value.profile === "update")
		);
	}
	return (
		value.action === "reject" &&
		isNonEmptyString(value.code) &&
		(value.message === undefined || typeof value.message === "string")
	);
}

type ResolutionLogger = Pick<
	GenericEndpointContext["context"]["logger"],
	"error"
>;

function logFailure(
	logger: ResolutionLogger,
	message: string,
	error?: unknown,
): void {
	try {
		logger.error(message, ...(error === undefined ? [] : [error]));
	} catch {
		// A custom logger must not change the stable authentication failure.
	}
}

function resolutionFailure(): APIError {
	return new APIError("INTERNAL_SERVER_ERROR", {
		code: "SSO_USER_RESOLUTION_FAILED",
		message: "Unable to resolve the SSO user",
	});
}

export async function resolveSSOUser(
	resolveUser: NonNullable<SSOOptions["resolveUser"]>,
	input: SSOUserResolutionInput,
	database: DBTransactionAdapter,
	logger: ResolutionLogger,
): Promise<SSOUserResolution> {
	let resolution: unknown;
	try {
		resolution = await resolveUser(input, { database });
	} catch (error) {
		logFailure(logger, "SSO user resolution failed", error);
		throw resolutionFailure();
	}
	if (!isSSOUserResolution(resolution)) {
		logFailure(logger, "SSO user resolver returned an invalid decision");
		throw resolutionFailure();
	}
	return resolution;
}

export function assertSSOUserResolutionNativeTransactionSupport(
	adapter: Pick<DBAdapter, "options">,
): void {
	if (typeof adapter.options?.adapterConfig.transaction === "function") return;
	throw new APIError("NOT_IMPLEMENTED", {
		code: "SSO_USER_RESOLUTION_REQUIRES_NATIVE_TRANSACTIONS",
		message:
			"SSO user resolution requires a database adapter with native transaction support",
	});
}

export async function assertSSOUserResolutionAsyncContextSupport(
	getStorage: typeof getCurrentDBAdapterAsyncLocalStorage = getCurrentDBAdapterAsyncLocalStorage,
): Promise<void> {
	try {
		await getStorage();
	} catch {
		throw new APIError("NOT_IMPLEMENTED", {
			code: "SSO_USER_RESOLUTION_REQUIRES_ASYNC_CONTEXT",
			message:
				"SSO user resolution requires database transaction async context support",
		});
	}
}

export function assertSSOUserResolutionSessionStorage(
	options: GenericEndpointContext["context"]["options"],
): void {
	if (
		!options.secondaryStorage ||
		(options.session?.storeSessionInDatabase === true &&
			options.session.preserveSessionInDatabase !== true)
	) {
		return;
	}
	throw new APIError("NOT_IMPLEMENTED", {
		code: "SSO_USER_RESOLUTION_REQUIRES_DATABASE_SESSIONS",
		message:
			"SSO user resolution requires database-backed sessions with database fallback",
	});
}

export function requireSuccessfulSSOAuthentication(
	result: SSOAuthenticationResult,
): SSOAuthenticationResult {
	if (!result.error) return result;
	throw Object.assign(new Error("SSO authentication failed"), {
		[SSO_AUTHENTICATION_FAILURE]: true as const,
		result,
	}) satisfies SSOAuthenticationFailure;
}

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
