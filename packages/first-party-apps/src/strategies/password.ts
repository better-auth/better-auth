import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, isAPIError } from "better-auth/api";
import type { User } from "better-auth/types";
import type {
	FirstPartyAuthInput,
	FirstPartyAuthResult,
	FirstPartyAuthStrategy,
} from "../types";

const TOTP_CHALLENGE = "totp";
const DEFAULT_MAX_PASSWORD_LENGTH = 128;

interface TwoFactorPlugin {
	options?: {
		twoFactorTable?: string;
		totpOptions?: { disable?: boolean };
	};
	endpoints: {
		verifyTwoFactorCode: (input: {
			context: GenericEndpointContext["context"];
			body: { userId: string; code: string; method: "totp" | "backup_code" };
		}) => Promise<unknown>;
	};
}

function invalidRequest(description: string): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: description,
	});
}

function twoFactorPlugin(ctx: GenericEndpointContext) {
	return ctx.context.options.plugins?.find(
		(candidate) => candidate.id === "two-factor",
	) as TwoFactorPlugin | undefined;
}

/**
 * Whether the user has a TOTP authenticator the app can ask for, as the
 * two-factor plugin decides for its `twoFactorMethods`. Verification itself
 * goes through `verifyTwoFactorCode`.
 */
async function hasTotp(
	ctx: GenericEndpointContext,
	plugin: TwoFactorPlugin,
	userId: string,
): Promise<boolean> {
	if (plugin.options?.totpOptions?.disable) return false;
	const row = await ctx.context.adapter.findOne<{ verified?: boolean | null }>({
		model: plugin.options?.twoFactorTable ?? "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	// An abandoned enrollment is not a second factor.
	return !!row && row.verified !== false;
}

/** Two-factor errors that mean the code was wrong or the account is locked. */
const SECOND_FACTOR_FAILURES = new Set([
	"INVALID_CODE",
	"INVALID_BACKUP_CODE",
	// C1: a lock answers like a wrong code.
	"ACCOUNT_TEMPORARILY_LOCKED",
]);

async function verifyPassword({
	ctx,
	authSession,
	params,
}: FirstPartyAuthInput): Promise<FirstPartyAuthResult> {
	const emailAndPassword = ctx.context.options.emailAndPassword;
	if (!emailAndPassword?.enabled) {
		return { error: "redirect_to_web" };
	}
	const password = params.password;
	if (typeof password !== "string" || !password) {
		invalidRequest("password is required");
	}
	const loginHint = params.login_hint ?? authSession.query.login_hint;
	if (typeof loginHint !== "string" || !loginHint) {
		invalidRequest("login_hint is required");
	}
	const email = loginHint.trim().toLowerCase();
	const maxLength =
		emailAndPassword.maxPasswordLength ?? DEFAULT_MAX_PASSWORD_LENGTH;
	if (password.length > maxLength) {
		return { error: "authentication_failed", identifier: email };
	}
	const record = await ctx.context.internalAdapter.findUserByEmail(email, {
		includeAccounts: true,
	});
	const account = record?.accounts.find(
		(candidate) =>
			candidate.providerId === "credential" &&
			candidate.accountId === record.user.id,
	);
	if (!record || !account?.password) {
		// Hash anyway, so the response time does not reveal unknown accounts.
		await ctx.context.password.hash(password);
		return record
			? { error: "authentication_failed", userId: record.user.id }
			: { error: "authentication_failed", identifier: email };
	}
	const valid = await ctx.context.password.verify({
		hash: account.password,
		password,
	});
	if (!valid) {
		return { error: "authentication_failed", userId: record.user.id };
	}
	const user = record.user as User & Record<string, unknown>;
	// The browser flow sends the verification email.
	if (emailAndPassword.requireEmailVerification && !user.emailVerified) {
		return { error: "redirect_to_web", userId: user.id };
	}
	if (user.twoFactorEnabled === true) {
		const plugin = twoFactorPlugin(ctx);
		// A second factor the app cannot collect, such as an emailed code.
		if (!plugin || !(await hasTotp(ctx, plugin, user.id))) {
			return { error: "redirect_to_web", userId: user.id };
		}
		return {
			error: "insufficient_authorization",
			challengeType: TOTP_CHALLENGE,
			user,
			amr: ["pwd"],
		};
	}
	return { user, amr: ["pwd"] };
}

async function verifySecondFactor({
	ctx,
	authSession,
	params,
}: FirstPartyAuthInput): Promise<FirstPartyAuthResult> {
	const totp = typeof params.totp === "string" ? params.totp : undefined;
	const backupCode =
		typeof params.backup_code === "string" ? params.backup_code : undefined;
	const code = totp || backupCode;
	if (!code || (totp && backupCode)) {
		invalidRequest("Send one of totp or backup_code");
	}
	const userId = authSession.userId!;
	const plugin = twoFactorPlugin(ctx);
	if (!plugin) return { error: "redirect_to_web", userId };
	try {
		await plugin.endpoints.verifyTwoFactorCode({
			context: ctx.context,
			body: { userId, code, method: totp ? "totp" : "backup_code" },
		});
	} catch (error) {
		const reason = isAPIError(error)
			? (error.body as { code?: string } | undefined)?.code
			: undefined;
		if (reason && SECOND_FACTOR_FAILURES.has(reason)) {
			return { error: "authentication_failed", userId };
		}
		if (isAPIError(error)) {
			// The method is not set up, or two-factor was turned off meanwhile.
			return { error: "redirect_to_web", userId };
		}
		throw error;
	}
	const user = await ctx.context.internalAdapter.findUserById(userId);
	if (!user) return { error: "authentication_failed", userId };
	return { user, amr: ["otp"] };
}

/**
 * Signs users in with their email (`login_hint`) and password, as
 * `/sign-in/email` does. A user with two-factor authentication gets
 * `insufficient_authorization` with `challenge_type: "totp"` and finishes
 * with a `totp` code, or a `backup_code`, on the next request. The code is
 * checked with the two-factor plugin's `verifyTwoFactorCode`, so failures
 * count toward its account lockout. A user whose second factor the app
 * cannot collect, or whose email is unverified while verification is
 * required, gets `redirect_to_web`.
 *
 * Requires `emailAndPassword.enabled`.
 */
export function passwordStrategy(): FirstPartyAuthStrategy {
	return {
		id: "password",
		params: ["password", "totp", "backup_code"],
		authenticate: (input) =>
			input.authSession.challenge?.type === TOTP_CHALLENGE
				? verifySecondFactor(input)
				: verifyPassword(input),
	};
}
