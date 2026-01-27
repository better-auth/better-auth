import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { mergeSchema } from "../../db/schema";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes";
import type { RequiredPhoneNumberOptions } from "./routes";
import {
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
	// biome-ignore lint/correctness/noUnusedVariables: AuthOptions and Options need to be same as declared in the module
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
		hooks: {
			before: [
				{
					// Stop any requests attempting to update the user's phone number
					matcher: (ctx) =>
						ctx.path === "/update-user" && "phoneNumber" in ctx.body,
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
				window: 60 * 1000,
				max: 10,
			},
		],
		options,
		$ERROR_CODES: PHONE_NUMBER_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
