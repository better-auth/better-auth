import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "../../db/schema";
import { PACKAGE_VERSION } from "../../version";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes";
import type { RequiredPhoneNumberOptions } from "./routes";
import {
	consumePhoneNumberOTP,
	requestPasswordResetPhoneNumber,
	resetPasswordPhoneNumber,
	sendPhoneNumberOTP,
	signInPhoneNumber,
	verifyPhoneNumber,
} from "./routes";
import { schema } from "./schema";
import type { PhoneNumberOptions, UserWithPhoneNumber } from "./types";

export type { PhoneNumberOptions, UserWithPhoneNumber };

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"phone-number": {
			creator: typeof phoneNumber;
		};
	}
}

export const phoneNumber = (options?: PhoneNumberOptions | undefined) => {
	const opts = {
		expiresIn: options?.expiresIn || 300,
		otpLength: options?.otpLength || 6,
		...options,
		phoneNumber: "phoneNumber",
		phoneNumberVerified: "phoneNumberVerified",
		code: "code",
		createdAt: "createdAt",
	};

	return {
		id: "phone-number",
		version: PACKAGE_VERSION,
		init() {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								// An unproven number is still unique, so storing one could squat
								// someone else's number. Only this plugin's verified path sets it.
								async before(data, ctx) {
									// An empty string is no number, so it is dropped like one.
									if (
										data[opts.phoneNumber] == null ||
										data[opts.phoneNumberVerified] === true
									) {
										return;
									}
									if (ctx?.body?.[opts.phoneNumber]) {
										throw APIError.from(
											"BAD_REQUEST",
											PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_CANNOT_BE_SET,
										);
									}
									return {
										data: {
											...data,
											[opts.phoneNumber]: null,
											[opts.phoneNumberVerified]: false,
										},
									};
								},
							},
							update: {
								async before(data, ctx) {
									// Atomically reset verified flag when the number is cleared
									if (
										opts.phoneNumber in data &&
										data[opts.phoneNumber] === null
									) {
										return {
											data: {
												...data,
												[opts.phoneNumberVerified]: false,
											},
										};
									}
									// Requests only set a number through this plugin's verified path
									// or an admin update, so a profile sync on account linking cannot
									// claim one. Dropping it keeps an existing verified number intact.
									if (
										!ctx ||
										data[opts.phoneNumber] == null ||
										data[opts.phoneNumberVerified] === true ||
										ctx.path === "/admin/update-user"
									) {
										return;
									}
									return {
										data: {
											...data,
											[opts.phoneNumber]: undefined,
										},
									};
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			before: [
				{
					matcher: (ctx) =>
						// Block phone number changes except disassociation (when phoneNumber is null)
						ctx.path === "/update-user" &&
						"phoneNumber" in ctx.body &&
						ctx.body.phoneNumber !== null,
					handler: createAuthMiddleware(async (_ctx) => {
						throw APIError.from(
							"BAD_REQUEST",
							PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_CANNOT_BE_UPDATED,
						);
					}),
				},
			],
		},
		endpoints: {
			signInPhoneNumber: signInPhoneNumber(opts as RequiredPhoneNumberOptions),
			sendPhoneNumberOTP: sendPhoneNumberOTP(
				opts as RequiredPhoneNumberOptions,
			),
			consumePhoneNumberOTP: consumePhoneNumberOTP(
				opts as RequiredPhoneNumberOptions,
			),
			verifyPhoneNumber: verifyPhoneNumber(opts as RequiredPhoneNumberOptions),
			requestPasswordResetPhoneNumber: requestPasswordResetPhoneNumber(
				opts as RequiredPhoneNumberOptions,
			),
			resetPasswordPhoneNumber: resetPasswordPhoneNumber(
				opts as RequiredPhoneNumberOptions,
			),
		},
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/phone-number");
				},
				window: 60,
				max: 10,
			},
		],
		options,
		$ERROR_CODES: PHONE_NUMBER_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
