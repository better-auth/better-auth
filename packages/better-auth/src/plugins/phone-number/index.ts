import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "../../db/schema.js";
import { PACKAGE_VERSION } from "../../version.js";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes.js";
import type { RequiredPhoneNumberOptions } from "./routes.js";
import {
	requestPasswordResetPhoneNumber,
	resetPasswordPhoneNumber,
	sendPhoneNumberOTP,
	signInPhoneNumber,
	verifyPhoneNumber,
} from "./routes.js";
import { schema } from "./schema.js";
import type { PhoneNumberOptions, UserWithPhoneNumber } from "./types.js";

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
							update: {
								async before(data) {
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
