import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { BUILTIN_AMR_METHOD } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import * as z from "zod";
import { sensitiveSessionMiddleware } from "../../api";
import {
	constantTimeEqual,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import { generateRandomString } from "../../crypto/random";
import { mergeSchema } from "../../db/schema";
import type { User } from "../../types";
import { shouldRequirePassword, validatePassword } from "../../utils/password";
import { PACKAGE_VERSION } from "../../version";
import { checkTwoFactor, getPendingTwoFactorAttemptId } from "./check";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import {
	createTotpMethod,
	deleteAllMethodsForUser,
	deleteMethod,
	ensureOtpMethod,
	ensureRecoveryMethod,
	findUserTwoFactorMethod,
	getTotpMaterial,
	isInteractiveMethodKind,
	isVerifiedMethod,
	listChallengeMethodDescriptors,
	listTwoFactorMethods,
	markMethodVerified,
	toMethodDescriptor,
	touchMethodUsage,
} from "./methods";
import {
	consumeRecoveryCode,
	generateRecoveryCodes,
	replaceRecoveryCodes,
} from "./recovery-codes";
import { resolveTwoFactorVerification } from "./resolve-two-factor-verification";
import { schema } from "./schema";
import {
	listTrustedDevices,
	revokeAllTrustedDevices,
	revokeTrustedDevice,
} from "./trust-device";
import type {
	OTPOptions,
	RecoveryCodeOptions,
	TwoFactorMethod,
	TwoFactorOptions,
} from "./types";
import { defaultKeyHasher } from "./utils";

export * from "./error-code";
export type {
	FinalizeTwoFactorVerificationResolver,
	SessionTwoFactorVerificationResolver,
	TwoFactorVerificationResolver,
	TwoFactorVerifyResponse,
} from "./resolve-two-factor-verification";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"two-factor": {
			creator: typeof twoFactor;
		};
	}
}

function getOTPSettings(options?: OTPOptions | undefined) {
	return {
		storeOTP: "plain" as const,
		digits: 6,
		...options,
		period: (options?.period || 3) * 60 * 1000,
	};
}

function buildOtpVerificationIdentifier(key: string, methodId: string): string {
	return `2fa-code-${key}:${methodId}`;
}

async function storeOTPCode(
	ctx: GenericEndpointContext,
	otp: string,
	options: ReturnType<typeof getOTPSettings>,
) {
	if (options.storeOTP === "hashed") {
		return defaultKeyHasher(otp);
	}
	if (typeof options.storeOTP === "object" && "hash" in options.storeOTP) {
		return options.storeOTP.hash(otp);
	}
	if (typeof options.storeOTP === "object" && "encrypt" in options.storeOTP) {
		return options.storeOTP.encrypt(otp);
	}
	if (options.storeOTP === "encrypted") {
		return symmetricEncrypt({
			key: ctx.context.secretConfig,
			data: otp,
		});
	}
	return otp;
}

async function decodeOTPForComparison(
	ctx: GenericEndpointContext,
	storedCode: string,
	userInput: string,
	options: ReturnType<typeof getOTPSettings>,
): Promise<[string, string]> {
	if (options.storeOTP === "hashed") {
		return [storedCode, await defaultKeyHasher(userInput)];
	}
	if (options.storeOTP === "encrypted") {
		const decrypted = await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: storedCode,
		});
		return [decrypted, userInput];
	}
	if (typeof options.storeOTP === "object" && "encrypt" in options.storeOTP) {
		return [await options.storeOTP.decrypt(storedCode), userInput];
	}
	if (typeof options.storeOTP === "object" && "hash" in options.storeOTP) {
		return [storedCode, await options.storeOTP.hash(userInput)];
	}
	return [storedCode, userInput];
}

async function requirePasswordIfNeeded(
	ctx: GenericEndpointContext,
	userId: string,
	password?: string,
): Promise<void> {
	const passwordRequired = await shouldRequirePassword(ctx, userId);
	if (!passwordRequired) {
		return;
	}
	if (!password) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	}
	const validPassword = await validatePassword(ctx, { password, userId });
	if (!validPassword) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	}
}

async function issueRecoveryCodesIfMissing(
	ctx: GenericEndpointContext,
	userId: string,
	options?: RecoveryCodeOptions | undefined,
) {
	const { method, created } = await ensureRecoveryMethod(ctx, userId);
	if (!created) {
		return {
			method,
			recoveryCodes: null as string[] | null,
		};
	}
	const recoveryCodes = generateRecoveryCodes(options);
	await replaceRecoveryCodes(ctx, method.id, recoveryCodes);
	return {
		method,
		recoveryCodes,
	};
}

async function sendOTPCode(
	ctx: GenericEndpointContext,
	data: {
		key: string;
		user: User;
		method: TwoFactorMethod;
		options: ReturnType<typeof getOTPSettings>;
	},
) {
	if (!data.options.sendOTP) {
		throw APIError.from(
			"BAD_REQUEST",
			TWO_FACTOR_ERROR_CODES.CODE_DELIVERY_NOT_SUPPORTED,
		);
	}

	const code = generateRandomString(data.options.digits, "0-9");
	const storedCode = await storeOTPCode(ctx, code, data.options);
	const identifier = buildOtpVerificationIdentifier(data.key, data.method.id);
	await ctx.context.internalAdapter
		.deleteVerificationByIdentifier(identifier)
		.catch(() => {});
	await ctx.context.internalAdapter.createVerificationValue({
		value: `${storedCode}:0`,
		identifier,
		expiresAt: new Date(Date.now() + data.options.period),
	});
	await data.options.sendOTP(
		{
			user: data.user,
			otp: code,
		},
		ctx,
	);
}

export const twoFactor = <O extends TwoFactorOptions>(options?: O) => {
	const otpOptions = getOTPSettings(options?.otpOptions);
	const recoveryCodeOptions = options?.recoveryCodeOptions;
	const passwordSchema = z.string().meta({
		description: "User password",
	});
	const methodIdSchema = z.string().meta({
		description: "Two-factor method identifier",
	});

	return {
		id: "two-factor",
		version: PACKAGE_VERSION,
		signInChallenges: ["two-factor"] as const,
		checkSignInChallenge: checkTwoFactor,
		endpoints: {
			enableTwoFactorTotp: createAuthEndpoint(
				"/two-factor/enable-totp",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						password: passwordSchema.optional(),
						label: z.string().optional(),
						issuer: z.string().optional(),
					}),
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					if (options?.totpOptions?.disable) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.CODE_DELIVERY_NOT_SUPPORTED,
						);
					}

					await requirePasswordIfNeeded(ctx, user.id, ctx.body.password);
					const secret = generateRandomString(32);
					const encryptedSecret = await symmetricEncrypt({
						key: ctx.context.secretConfig,
						data: secret,
					});
					const verifiedAt = options?.skipVerificationOnEnable
						? new Date()
						: null;
					const method = await createTotpMethod(ctx, {
						userId: user.id,
						label: ctx.body.label,
						secret: encryptedSecret,
						verifiedAt,
					});
					const recovery = await issueRecoveryCodesIfMissing(
						ctx,
						user.id,
						recoveryCodeOptions,
					);
					const totpURI = createOTP(secret, {
						digits: options?.totpOptions?.digits || 6,
						period: options?.totpOptions?.period,
					}).url(
						ctx.body.issuer || options?.issuer || ctx.context.appName,
						user.email,
					);

					return ctx.json({
						method: toMethodDescriptor(method),
						totpURI,
						recoveryCodes: recovery.recoveryCodes,
					});
				},
			),
			getTwoFactorTotpUri: createAuthEndpoint(
				"/two-factor/get-totp-uri",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						password: passwordSchema.optional(),
						methodId: methodIdSchema,
					}),
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await requirePasswordIfNeeded(ctx, user.id, ctx.body.password);
					const method = await findUserTwoFactorMethod(
						ctx,
						user.id,
						ctx.body.methodId,
					);
					if (!method || method.kind !== "totp") {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_FOUND,
						);
					}
					const material = await getTotpMaterial(ctx, method.id);
					if (!material) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_READY,
						);
					}
					const secret = await symmetricDecrypt({
						key: ctx.context.secretConfig,
						data: material.secret,
					});
					const totpURI = createOTP(secret, {
						digits: options?.totpOptions?.digits || 6,
						period: options?.totpOptions?.period,
					}).url(options?.issuer || ctx.context.appName, user.email);
					return ctx.json({ totpURI });
				},
			),
			enableTwoFactorOtp: createAuthEndpoint(
				"/two-factor/enable-otp",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						password: passwordSchema.optional(),
						label: z.string().optional(),
					}),
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await requirePasswordIfNeeded(ctx, user.id, ctx.body.password);
					const verifiedAt = options?.skipVerificationOnEnable
						? new Date()
						: null;
					const method = await ensureOtpMethod(ctx, {
						userId: user.id,
						label: ctx.body.label,
						verifiedAt,
					});
					const recovery = await issueRecoveryCodesIfMissing(
						ctx,
						user.id,
						recoveryCodeOptions,
					);
					if (!options?.skipVerificationOnEnable) {
						await sendOTPCode(ctx, {
							key: `${user.id}!${ctx.context.session.session.id}`,
							user,
							method,
							options: otpOptions,
						});
					}
					return ctx.json({
						method: toMethodDescriptor(method),
						recoveryCodes: recovery.recoveryCodes,
						codeSent: !options?.skipVerificationOnEnable,
					});
				},
			),
			listTwoFactorMethods: createAuthEndpoint(
				"/two-factor/list-methods",
				{
					method: "GET",
					use: [sensitiveSessionMiddleware],
				},
				async (ctx) => {
					const methods = await listTwoFactorMethods(
						ctx,
						ctx.context.session.user.id,
					);
					const enabled = methods.some(
						(method) =>
							isInteractiveMethodKind(method.kind) && isVerifiedMethod(method),
					);
					return ctx.json({
						enabled,
						methods,
					});
				},
			),
			getPendingTwoFactorChallenge: createAuthEndpoint(
				"/two-factor/pending-challenge",
				{
					method: "GET",
				},
				async (ctx) => {
					const attemptId = await getPendingTwoFactorAttemptId(ctx);
					if (!attemptId) {
						throw APIError.from(
							"UNAUTHORIZED",
							TWO_FACTOR_ERROR_CODES.INVALID_PENDING_CHALLENGE,
						);
					}
					const attempt =
						await ctx.context.internalAdapter.findSignInAttempt(attemptId);
					if (!attempt || attempt.expiresAt <= new Date() || attempt.lockedAt) {
						throw APIError.from(
							"UNAUTHORIZED",
							TWO_FACTOR_ERROR_CODES.INVALID_PENDING_CHALLENGE,
						);
					}
					return ctx.json({
						kind: "two-factor" as const,
						attemptId,
						methods: await listChallengeMethodDescriptors(ctx, attempt.userId),
					});
				},
			),
			sendTwoFactorCode: createAuthEndpoint(
				"/two-factor/send-code",
				{
					method: "POST",
					body: z.object({
						attemptId: z.string().optional(),
						methodId: methodIdSchema,
					}),
				},
				async (ctx) => {
					const resolver = await resolveTwoFactorVerification(ctx);
					const method = await findUserTwoFactorMethod(
						ctx,
						resolver.session.user.id,
						ctx.body.methodId,
					);
					if (!method) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_FOUND,
						);
					}
					if (method.kind !== "otp") {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.CODE_DELIVERY_NOT_SUPPORTED,
						);
					}
					if (resolver.mode === "finalize" && !isVerifiedMethod(method)) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_READY,
						);
					}
					await sendOTPCode(ctx, {
						key: resolver.key,
						user: resolver.session.user,
						method,
						options: otpOptions,
					});
					return ctx.json({ status: true });
				},
			),
			verifyTwoFactor: createAuthEndpoint(
				"/two-factor/verify",
				{
					method: "POST",
					body: z.object({
						attemptId: z.string().optional(),
						methodId: methodIdSchema,
						code: z.string(),
						trustDevice: z.boolean().optional(),
					}),
				},
				async (ctx) => {
					const resolver = await resolveTwoFactorVerification(ctx);
					const method = await findUserTwoFactorMethod(
						ctx,
						resolver.session.user.id,
						ctx.body.methodId,
					);
					if (!method) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_FOUND,
						);
					}

					if (resolver.mode === "finalize" && !isVerifiedMethod(method)) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_READY,
						);
					}

					if (method.kind === "totp") {
						const material = await getTotpMaterial(ctx, method.id);
						if (!material) {
							throw APIError.from(
								"BAD_REQUEST",
								TWO_FACTOR_ERROR_CODES.METHOD_NOT_READY,
							);
						}
						const secret = await symmetricDecrypt({
							key: ctx.context.secretConfig,
							data: material.secret,
						});
						const valid = await createOTP(secret, {
							period: options?.totpOptions?.period || 30,
							digits: options?.totpOptions?.digits || 6,
						}).verify(ctx.body.code);
						if (!valid) {
							return resolver.invalid("INVALID_CODE");
						}
						if (!isVerifiedMethod(method)) {
							await markMethodVerified(ctx, method.id);
						}
						await touchMethodUsage(ctx, method.id);
						if (resolver.mode === "finalize") {
							return resolver.valid(ctx, {
								method: BUILTIN_AMR_METHOD.TOTP,
								factor: "possession",
								completedAt: new Date(),
							});
						}
						return resolver.valid(ctx);
					}

					if (method.kind === "otp") {
						const identifier = buildOtpVerificationIdentifier(
							resolver.key,
							method.id,
						);
						const stored =
							await ctx.context.internalAdapter.findVerificationValue(
								identifier,
							);
						const [storedCode, attempts] = stored?.value?.split(":") ?? [];
						if (!stored || stored.expiresAt < new Date()) {
							if (stored) {
								await ctx.context.internalAdapter.deleteVerificationByIdentifier(
									identifier,
								);
							}
							throw APIError.from(
								"BAD_REQUEST",
								TWO_FACTOR_ERROR_CODES.CODE_HAS_EXPIRED,
							);
						}
						const allowedAttempts = otpOptions.allowedAttempts || 5;
						if ((parseInt(attempts ?? "0", 10) || 0) >= allowedAttempts) {
							await ctx.context.internalAdapter.deleteVerificationByIdentifier(
								identifier,
							);
							throw APIError.from(
								"BAD_REQUEST",
								TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
							);
						}
						const [expectedValue, inputValue] = await decodeOTPForComparison(
							ctx,
							storedCode!,
							ctx.body.code,
							otpOptions,
						);
						const valid = constantTimeEqual(
							new TextEncoder().encode(expectedValue),
							new TextEncoder().encode(inputValue),
						);
						if (!valid) {
							const MAX_CAS_RETRIES = 5;
							let latest = stored;
							for (let i = 0; i < MAX_CAS_RETRIES; i++) {
								const [currentValue, currentAttempts] = latest.value.split(":");
								const nextValue = `${currentValue}:${
									(parseInt(currentAttempts ?? "0", 10) || 0) + 1
								}`;
								const applied =
									await ctx.context.internalAdapter.casUpdateVerificationValue(
										identifier,
										latest.value,
										nextValue,
									);
								if (applied) {
									break;
								}
								const reread =
									await ctx.context.internalAdapter.findVerificationValue(
										identifier,
									);
								if (!reread) {
									break;
								}
								latest = reread;
							}
							return resolver.invalid("INVALID_CODE");
						}
						await ctx.context.internalAdapter.deleteVerificationByIdentifier(
							identifier,
						);
						if (!isVerifiedMethod(method)) {
							await markMethodVerified(ctx, method.id);
						}
						await touchMethodUsage(ctx, method.id);
						if (resolver.mode === "finalize") {
							return resolver.valid(ctx, {
								method: BUILTIN_AMR_METHOD.OTP,
								factor: "possession",
								completedAt: new Date(),
							});
						}
						return resolver.valid(ctx);
					}

					if (resolver.mode !== "finalize") {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_READY,
						);
					}

					const consumed = await consumeRecoveryCode(
						ctx,
						method.id,
						ctx.body.code,
					);
					if (!consumed) {
						return resolver.invalid("INVALID_CODE");
					}
					await touchMethodUsage(ctx, method.id);
					return resolver.valid(ctx, {
						method: BUILTIN_AMR_METHOD.BACKUP_CODE,
						factor: "possession",
						completedAt: new Date(),
					});
				},
			),
			regenerateRecoveryCodes: createAuthEndpoint(
				"/two-factor/regenerate-recovery-codes",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						password: passwordSchema.optional(),
					}),
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await requirePasswordIfNeeded(ctx, user.id, ctx.body.password);
					const { method } = await ensureRecoveryMethod(ctx, user.id);
					const recoveryCodes = generateRecoveryCodes(recoveryCodeOptions);
					await replaceRecoveryCodes(ctx, method.id, recoveryCodes);
					return ctx.json({
						method: toMethodDescriptor(method),
						recoveryCodes,
					});
				},
			),
			removeTwoFactorMethod: createAuthEndpoint(
				"/two-factor/remove-method",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						password: passwordSchema.optional(),
						methodId: methodIdSchema,
					}),
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await requirePasswordIfNeeded(ctx, user.id, ctx.body.password);
					const method = await findUserTwoFactorMethod(
						ctx,
						user.id,
						ctx.body.methodId,
					);
					if (!method) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.METHOD_NOT_FOUND,
						);
					}
					await deleteMethod(ctx, method.id);
					return ctx.json({ status: true });
				},
			),
			listTwoFactorTrustedDevices: createAuthEndpoint(
				"/two-factor/list-trusted-devices",
				{
					method: "GET",
					use: [sensitiveSessionMiddleware],
				},
				async (ctx) => {
					const devices = await listTrustedDevices(
						ctx,
						ctx.context.session.user.id,
					);
					return ctx.json({ devices });
				},
			),
			revokeTwoFactorTrustedDevice: createAuthEndpoint(
				"/two-factor/revoke-trusted-device",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						deviceId: z.string(),
					}),
				},
				async (ctx) => {
					const revoked = await revokeTrustedDevice(
						ctx,
						ctx.context.session.user.id,
						ctx.body.deviceId,
					);
					if (!revoked) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.TRUSTED_DEVICE_NOT_FOUND,
						);
					}
					return ctx.json({ status: true });
				},
			),
			disableTwoFactor: createAuthEndpoint(
				"/two-factor/disable",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
					body: z.object({
						password: passwordSchema.optional(),
					}),
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await requirePasswordIfNeeded(ctx, user.id, ctx.body.password);
					await deleteAllMethodsForUser(ctx, user.id);
					await revokeAllTrustedDevices(ctx, user.id);
					return ctx.json({ status: true });
				},
			),
		},
		options: options as NoInfer<O>,
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/two-factor/");
				},
				window: 10,
				max: 3,
			},
		],
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export * from "./client";
export * from "./types";
