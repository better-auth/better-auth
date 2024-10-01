import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { Account, User } from "../../db/schema";
import { signUpEmail } from "../../api/routes/sign-up";
import { logger } from "../../utils";
import { nanoid } from "nanoid";

interface OTP {
	code: string;
	phoneNumber: string;
	createdAt: Date;
}

export const phoneNumber = (options?: {
	schema?: {
		/**
		 * Phone number field on your db
		 *
		 * @default "phoneNumber"
		 */
		phoneNumber: string;
	};
	/**
	 * Length of the OTP code
	 * @default 6
	 */
	otpLength?: number;
	sendOTP?: (phoneNumber: string, code: string) => Promise<string>;
	verifyOTP?: (phoneNumber: string, code: string) => Promise<boolean>;
}) => {
	const opts = {
		phoneNumber: options?.schema?.phoneNumber || "phoneNumber",
	};
	return {
		id: "phone-number",
		endpoints: {
			signInPhoneNumber: createAuthEndpoint(
				"/sign-in/phone-number",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string(),
						password: z.string(),
						dontRememberMe: z.boolean().optional(),
						callbackURL: z.string().optional(),
					}),
				},
				async (ctx) => {
					const user = await ctx.context.adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: opts.phoneNumber,
								value: ctx.body.phoneNumber,
							},
						],
					});
					if (!user) {
						await ctx.context.password.hash(ctx.body.password);
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid email or password",
						});
					}
					const account = await ctx.context.adapter.findOne<Account>({
						model: ctx.context.tables.account.tableName,
						where: [
							{
								field: "userId",
								value: user.id,
							},
							{
								field: "providerId",
								value: "credential",
							},
						],
					});
					if (!account) {
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid email or password",
						});
					}
					const currentPassword = account?.password;
					if (!currentPassword) {
						ctx.context.logger.warn(
							"Unexpectedly password is missing for the user",
							user,
						);
						throw new APIError("UNAUTHORIZED", {
							message: "Unexpected error",
						});
					}
					const validPassword = await ctx.context.password.verify(
						currentPassword,
						ctx.body.password,
					);
					if (!validPassword) {
						ctx.context.logger.error("Invalid password");
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid email or password",
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx.request,
					);
					if (!session) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: "Failed to create session",
								status: 500,
							},
						});
					}
					await ctx.setSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						session.id,
						ctx.context.secret,
						ctx.body.dontRememberMe
							? {
									...ctx.context.authCookies.sessionToken.options,
									maxAge: undefined,
								}
							: ctx.context.authCookies.sessionToken.options,
					);
					return ctx.json({
						user: user,
						session,
						redirect: !!ctx.body.callbackURL,
						url: ctx.body.callbackURL,
					});
				},
			),
			signUpPhoneNumber: createAuthEndpoint(
				"/sign-up/phone-number",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string().min(3).max(20),
						name: z.string(),
						email: z.string().email(),
						password: z.string(),
						image: z.string().optional(),
						callbackURL: z.string().optional(),
					}),
				},
				async (ctx) => {
					const res = await signUpEmail({
						...ctx,
						//@ts-expect-error
						_flag: undefined,
					});
					if (!res) {
						return ctx.json(null, {
							status: 400,
							body: {
								message: "Sign up failed",
								status: 400,
							},
						});
					}
					const updated = await ctx.context.internalAdapter.updateUserByEmail(
						res.user.email,
						{
							[opts.phoneNumber]: ctx.body.phoneNumber,
						},
					);
					if (ctx.body.callbackURL) {
						return ctx.json(
							{
								user: updated,
								session: res.session,
							},
							{
								body: {
									url: ctx.body.callbackURL,
									redirect: true,
									...res,
								},
							},
						);
					}
					return ctx.json({
						user: updated,
						session: res.session,
					});
				},
			),
			sendVerificationCode: createAuthEndpoint(
				"/phone-number/send-verification",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string(),
					}),
				},
				async (ctx) => {
					if (!options?.sendOTP) {
						logger.warn("sendOTP not implemented");
						throw new APIError("NOT_IMPLEMENTED", {
							message: "sendOTP not implemented",
						});
					}
					const code = nanoid(options?.otpLength || 6);
					await ctx.context.adapter.create({
						model: "otp",
						data: {
							code,
							phoneNumber: ctx.body.phoneNumber,
							createdAt: new Date(),
						},
					});
					await options.sendOTP(ctx.body.phoneNumber, code);
					return ctx.json(
						{ code },
						{
							body: {
								message: "Code sent",
							},
						},
					);
				},
			),
			verifyPhoneNumber: createAuthEndpoint(
				"/phone-number/verify",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string(),
						code: z.string(),
					}),
				},
				async (ctx) => {
					const otp = await ctx.context.adapter.findOne<OTP>({
						model: "otp",
						where: [
							{
								value: ctx.body.phoneNumber,
								field: "phoneNumber",
							},
						],
					});
					if (!otp) {
						return ctx.json(
							{
								status: false,
							},
							{
								body: {
									message: "Invalid code",
								},
								status: 400,
							},
						);
					}
					if (otp.code !== ctx.body.code) {
						return ctx.json(
							{
								status: false,
							},
							{
								body: {
									message: "Invalid code",
								},
								status: 400,
							},
						);
					}
					return ctx.json({
						status: true,
					});
				},
			),
		},
		schema: {
			user: {
				fields: {
					phoneNumber: {
						type: "string",
						required: false,
						unique: true,
						returned: true,
					},
					phoneNumberVerified: {
						type: "boolean",
						required: false,
						returned: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
