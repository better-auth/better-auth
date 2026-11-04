import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { sensitiveSessionMiddleware, sessionMiddleware } from "../../api";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import { shouldRequirePassword, validatePassword } from "../../utils/password";
import { PACKAGE_VERSION } from "../../version";
import { PIN_ERROR_CODES } from "./error-codes";
import { schema } from "./schema";
import type { PinOptions, PinTable } from "./types";

export { PIN_ERROR_CODES } from "./error-codes";
export type { PinOptions, PinTable } from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		pin: {
			creator: typeof pin;
		};
	}
}

const PIN_TABLE = "pin";

type ResolvedPinOptions = {
	minLength: number;
	maxLength: number;
	stepUpTTL: number;
	maxAttempts: number;
	lockoutDuration: number;
	requirePassword: boolean;
	allowPasswordless: boolean;
	pinValidator?: ((pin: string) => boolean | Promise<boolean>) | undefined;
};

async function validatePinFormat(pin: string, opts: ResolvedPinOptions) {
	if (pin.length < opts.minLength) {
		throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PIN_TOO_SHORT);
	}
	if (pin.length > opts.maxLength) {
		throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PIN_TOO_LONG);
	}
	if (opts.pinValidator) {
		if (!(await opts.pinValidator(pin))) {
			throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.INVALID_PIN_FORMAT);
		}
		return;
	}
	if (!/^\d+$/.test(pin)) {
		throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.INVALID_PIN_FORMAT);
	}
}

async function findPin(ctx: GenericEndpointContext, userId: string) {
	return ctx.context.adapter.findOne<PinTable>({
		model: PIN_TABLE,
		where: [{ field: "userId", value: userId }],
	});
}

function assertPinNotLocked(pin: PinTable) {
	if (pin.lockedUntil && new Date(pin.lockedUntil).getTime() > Date.now()) {
		throw APIError.from("TOO_MANY_REQUESTS", PIN_ERROR_CODES.PIN_LOCKED);
	}
}

async function recordPinFailure(
	ctx: GenericEndpointContext,
	pin: PinTable,
	opts: ResolvedPinOptions,
) {
	const updated = await ctx.context.adapter.incrementOne<PinTable>({
		model: PIN_TABLE,
		where: [{ field: "id", value: pin.id }],
		increment: { failedAttempts: 1 },
	});
	if ((updated?.failedAttempts ?? 0) >= opts.maxAttempts) {
		await ctx.context.adapter.update({
			model: PIN_TABLE,
			where: [{ field: "id", value: pin.id }],
			update: {
				lockedUntil: new Date(Date.now() + opts.lockoutDuration * 1000),
			},
		});
	}
}

async function resetPinFailures(ctx: GenericEndpointContext, pin: PinTable) {
	await ctx.context.adapter.update({
		model: PIN_TABLE,
		where: [{ field: "id", value: pin.id }],
		update: { failedAttempts: 0, lockedUntil: null },
	});
}

async function assertPasswordIfRequired(
	ctx: GenericEndpointContext,
	userId: string,
	password: string | undefined,
	opts: ResolvedPinOptions,
) {
	if (!opts.requirePassword) {
		return;
	}
	const required = await shouldRequirePassword(
		ctx,
		userId,
		opts.allowPasswordless,
	);
	if (!required) {
		return;
	}
	if (!password) {
		throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PASSWORD_REQUIRED);
	}
	const valid = await validatePassword(ctx, { password, userId });
	if (!valid) {
		throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.INVALID_PASSWORD);
	}
}

async function setStepUp(
	ctx: GenericEndpointContext,
	stepUpExpiresAt: Date | null,
) {
	const session = ctx.context.session;
	if (!session?.session) {
		throw APIError.from("UNAUTHORIZED", {
			message: "Unauthorized",
			code: "UNAUTHORIZED",
		});
	}
	const updatedSession = await ctx.context.internalAdapter.updateSession(
		session.session.token,
		{
			stepUpExpiresAt,
			updatedAt: new Date(),
		},
	);
	const newSession = updatedSession ?? {
		...session.session,
		stepUpExpiresAt,
		updatedAt: new Date(),
	};
	await setSessionCookie(ctx, {
		session: newSession,
		user: session.user,
	});
	return newSession;
}

const setPinBodySchema = z.object({
	pin: z.string().meta({
		description: "The PIN to set",
	}),
	password: z
		.string()
		.meta({
			description: "The account password, required to confirm the change",
		})
		.optional(),
});

const changePinBodySchema = z.object({
	currentPin: z.string().meta({
		description: "The current PIN",
	}),
	newPin: z.string().meta({
		description: "The new PIN",
	}),
});

const verifyPinBodySchema = z.object({
	pin: z.string().meta({
		description: "The PIN to verify",
	}),
});

const disablePinBodySchema = z.object({
	password: z
		.string()
		.meta({
			description: "The account password, required to confirm the change",
		})
		.optional(),
});

export const pin = (options?: PinOptions | undefined) => {
	const opts: ResolvedPinOptions = {
		minLength: options?.minLength ?? 4,
		maxLength: options?.maxLength ?? 12,
		stepUpTTL: options?.stepUpTTL ?? 120,
		maxAttempts: options?.maxAttempts ?? 5,
		lockoutDuration: options?.lockoutDuration ?? 300,
		requirePassword: options?.requirePassword ?? true,
		allowPasswordless: options?.allowPasswordless ?? false,
		pinValidator: options?.pinValidator,
	};

	return {
		id: "pin",
		version: PACKAGE_VERSION,
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/pin/set`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.setPin`
			 *
			 * **client:**
			 * `authClient.pin.set`
			 */
			setPin: createAuthEndpoint(
				"/pin/set",
				{
					method: "POST",
					body: setPinBodySchema,
					use: [sensitiveSessionMiddleware],
					metadata: {
						openapi: {
							summary: "Set a PIN",
							description: "Set a PIN for the current user",
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await validatePinFormat(ctx.body.pin, opts);
					await assertPasswordIfRequired(ctx, user.id, ctx.body.password, opts);

					const existingPin = await findPin(ctx, user.id);
					if (existingPin) {
						throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PIN_ALREADY_SET);
					}

					const hash = await ctx.context.password.hash(ctx.body.pin);
					await ctx.context.adapter.create({
						model: PIN_TABLE,
						data: {
							userId: user.id,
							hash,
							failedAttempts: 0,
						},
					});

					return ctx.json({ status: true });
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/pin/change`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.changePin`
			 *
			 * **client:**
			 * `authClient.pin.change`
			 */
			changePin: createAuthEndpoint(
				"/pin/change",
				{
					method: "POST",
					body: changePinBodySchema,
					use: [sensitiveSessionMiddleware],
					metadata: {
						openapi: {
							summary: "Change a PIN",
							description: "Change the PIN for the current user",
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await validatePinFormat(ctx.body.newPin, opts);

					const pin = await findPin(ctx, user.id);
					if (!pin) {
						throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PIN_NOT_SET);
					}
					assertPinNotLocked(pin);

					const valid = await ctx.context.password.verify({
						hash: pin.hash,
						password: ctx.body.currentPin,
					});
					if (!valid) {
						await recordPinFailure(ctx, pin, opts);
						throw APIError.from(
							"BAD_REQUEST",
							PIN_ERROR_CODES.INVALID_CURRENT_PIN,
						);
					}

					await resetPinFailures(ctx, pin);
					const hash = await ctx.context.password.hash(ctx.body.newPin);
					await ctx.context.adapter.update({
						model: PIN_TABLE,
						where: [{ field: "id", value: pin.id }],
						update: { hash },
					});

					return ctx.json({ status: true });
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/pin/verify`
			 *
			 * Verifies the PIN and upgrades the current session for step-up
			 * authentication. No new session is created.
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyPin`
			 *
			 * **client:**
			 * `authClient.pin.verify`
			 */
			verifyPin: createAuthEndpoint(
				"/pin/verify",
				{
					method: "POST",
					body: verifyPinBodySchema,
					use: [sensitiveSessionMiddleware],
					metadata: {
						openapi: {
							summary: "Verify a PIN",
							description:
								"Verify the current user's PIN and upgrade the session for step-up authentication",
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					const pin = await findPin(ctx, user.id);
					if (!pin) {
						throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PIN_NOT_SET);
					}
					assertPinNotLocked(pin);

					const valid = await ctx.context.password.verify({
						hash: pin.hash,
						password: ctx.body.pin,
					});
					if (!valid) {
						await recordPinFailure(ctx, pin, opts);
						throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.INVALID_PIN);
					}

					await resetPinFailures(ctx, pin);
					const expiresAt = new Date(Date.now() + opts.stepUpTTL * 1000);
					await setStepUp(ctx, expiresAt);

					return ctx.json({
						verified: true,
						expiresAt,
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/pin/disable`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.disablePin`
			 *
			 * **client:**
			 * `authClient.pin.disable`
			 */
			disablePin: createAuthEndpoint(
				"/pin/disable",
				{
					method: "POST",
					body: disablePinBodySchema,
					use: [sensitiveSessionMiddleware],
					metadata: {
						openapi: {
							summary: "Disable a PIN",
							description: "Remove the PIN for the current user",
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					await assertPasswordIfRequired(ctx, user.id, ctx.body.password, opts);

					const pin = await findPin(ctx, user.id);
					if (!pin) {
						throw APIError.from("BAD_REQUEST", PIN_ERROR_CODES.PIN_NOT_SET);
					}

					await ctx.context.adapter.delete({
						model: PIN_TABLE,
						where: [{ field: "id", value: pin.id }],
					});
					await setStepUp(ctx, null);

					return ctx.json({ status: true });
				},
			),
			/**
			 * ### Endpoint
			 *
			 * GET `/pin/status`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.getPinStatus`
			 *
			 * **client:**
			 * `authClient.pin.status`
			 */
			getPinStatus: createAuthEndpoint(
				"/pin/status",
				{
					method: "GET",
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Get PIN status",
							description:
								"Check whether the current user has a PIN and whether the session is stepped up",
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					const pin = await findPin(ctx, user.id);
					const stepUpExpiresAt = (
						ctx.context.session
							.session as typeof ctx.context.session.session & {
							stepUpExpiresAt?: Date | string | null;
						}
					).stepUpExpiresAt;
					return ctx.json({
						hasPin: !!pin,
						lockedUntil: pin?.lockedUntil ?? null,
						stepUpExpiresAt: stepUpExpiresAt ?? null,
						stepUpValid: !!stepUpExpiresAt
							? new Date(stepUpExpiresAt).getTime() > Date.now()
							: false,
					});
				},
			),
		},
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/pin");
				},
				window: 60,
				max: 10,
			},
		],
		options,
		$ERROR_CODES: PIN_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type PinPlugin = ReturnType<typeof pin>;
