import type { GenericEndpointContext } from "@better-auth/core";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { APIError } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import type { User } from "better-auth/types";
import type {
	FirstPartyAuthInput,
	FirstPartyAuthResult,
	FirstPartyAuthStrategy,
} from "../types";

const TOTP_CHALLENGE = "totp";
const DEFAULT_MAX_PASSWORD_LENGTH = 128;

interface TwoFactorRow {
	id: string;
	userId: string;
	secret: string;
	verified?: boolean | null;
	lockedUntil?: Date | null;
}

interface TwoFactorPluginOptions {
	twoFactorTable?: string;
	totpOptions?: { digits?: number; period?: number; disable?: boolean };
}

function invalidRequest(description: string): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: description,
	});
}

function twoFactorOptions(
	ctx: GenericEndpointContext,
): TwoFactorPluginOptions | undefined {
	const plugin = ctx.context.options.plugins?.find(
		(candidate) => candidate.id === "two-factor",
	) as { options?: TwoFactorPluginOptions } | undefined;
	return plugin ? (plugin.options ?? {}) : undefined;
}

async function findTotp(
	ctx: GenericEndpointContext,
	options: TwoFactorPluginOptions,
	userId: string,
): Promise<TwoFactorRow | null> {
	if (options.totpOptions?.disable) return null;
	const row = await ctx.context.adapter.findOne<TwoFactorRow>({
		model: options.twoFactorTable ?? "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	// An abandoned enrollment is not a second factor.
	return row && row.verified !== false ? row : null;
}

/** Secrets imported from other providers are stored as `base32:<secret>`. */
async function decryptSecret(ctx: GenericEndpointContext, data: string) {
	const secret = await symmetricDecrypt({
		key: ctx.context.secretConfig,
		data,
	});
	return secret.startsWith("base32:")
		? base32.decode(secret.slice("base32:".length).toUpperCase())
		: secret;
}

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
		return { error: "redirect_to_web" };
	}
	if (user.twoFactorEnabled === true) {
		const twoFactor = twoFactorOptions(ctx);
		const totp = twoFactor && (await findTotp(ctx, twoFactor, user.id));
		// A second factor the app cannot collect, such as an emailed code.
		if (!totp) return { error: "redirect_to_web" };
		return {
			error: "insufficient_authorization",
			challengeType: TOTP_CHALLENGE,
			user,
			amr: ["pwd"],
		};
	}
	return { user, amr: ["pwd"] };
}

async function verifyTotp({
	ctx,
	authSession,
	params,
}: FirstPartyAuthInput): Promise<FirstPartyAuthResult> {
	const code = params.totp;
	if (typeof code !== "string" || !code) {
		invalidRequest("totp is required");
	}
	const userId = authSession.userId!;
	const options = twoFactorOptions(ctx);
	const row = options && (await findTotp(ctx, options, userId));
	if (!row) return { error: "redirect_to_web" };
	// Respect a lock the two-factor plugin set for this account.
	if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
		return { error: "authentication_failed", userId };
	}
	const valid = await createOTP(await decryptSecret(ctx, row.secret), {
		digits: options.totpOptions?.digits ?? 6,
		period: options.totpOptions?.period ?? 30,
	}).verify(code);
	if (!valid) return { error: "authentication_failed", userId };
	const user = await ctx.context.internalAdapter.findUserById(userId);
	if (!user) return { error: "authentication_failed", userId };
	return { user, amr: ["otp"] };
}

/**
 * Signs users in with their email (`login_hint`) and password, as
 * `/sign-in/email` does. A user with two-factor authentication gets
 * `insufficient_authorization` with `challenge_type: "totp"` and finishes
 * with a `totp` code on the next request. A user whose second factor the app
 * cannot collect, or whose email is unverified while verification is
 * required, gets `redirect_to_web`.
 *
 * Requires `emailAndPassword.enabled`.
 */
export function passwordStrategy(): FirstPartyAuthStrategy {
	return {
		id: "password",
		params: ["password", "totp"],
		authenticate: (input) =>
			input.authSession.challenge?.type === TOTP_CHALLENGE
				? verifyTotp(input)
				: verifyPassword(input),
	};
}
