import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { parseUserOutput } from "../../db/schema";
import { revokeUnprovenAccountAccess } from "../../db/revoke-unproven-account-access";
import type { User } from "../../types";
import { getDate } from "../../utils/date";
import { originCheck } from "../middlewares";

const defaultEnrollTokenExpiresIn = 60 * 60 * 24 * 7; // 7 days

/**
 * Generates an enroll token, stores it, and sends the configured
 * enrollment email. Shared by the public `/enroll` endpoint and by any
 * plugin (admin, organization) that provisions a passwordless user and
 * wants the same verify-then-set-password completion flow, instead of
 * building its own token/email plumbing.
 *
 * Unlike the public endpoint, this throws when enrollment isn't
 * configured rather than failing quietly: a plugin only calls this when
 * it has already decided enrollment should apply, so a misconfiguration
 * here is a developer error worth surfacing loudly.
 */
export async function createEnrollmentToken(
	ctx: GenericEndpointContext,
	opts: {
		user: User;
		/**
		 * Present when enrollment was initiated on the user's behalf by
		 * another party (e.g. an organization invitation), so the email can
		 * be worded as an invite instead of a plain sign-up confirmation.
		 */
		invitation?: {
			organizationName: string;
			inviterEmail: string;
		};
	},
): Promise<{ token: string; expiresAt: Date }> {
	const enrollment = ctx.context.options.user?.enrollment;
	if (!enrollment?.enabled || !enrollment.sendEnrollmentVerification) {
		throw APIError.from("BAD_REQUEST", {
			message:
				"user.enrollment must be configured with sendEnrollmentVerification to send an enrollment email",
			code: "ENROLLMENT_NOT_CONFIGURED",
		});
	}
	const token = generateRandomString(32, "0-9", "a-z");
	const expiresAt = getDate(
		enrollment.enrollTokenExpiresIn || defaultEnrollTokenExpiresIn,
		"sec",
	);
	await ctx.context.internalAdapter.createVerificationValue({
		value: JSON.stringify({ email: opts.user.email }),
		identifier: `enroll:${token}`,
		expiresAt,
	});
	const url = `${ctx.context.baseURL}/enroll/callback?token=${token}`;
	await ctx.context.runInBackgroundOrAwait(
		enrollment.sendEnrollmentVerification(
			{
				user: opts.user,
				url,
				token,
				invitation: opts.invitation,
			},
			ctx.request,
		),
	);
	return { token, expiresAt };
}

const enrollEmailBodySchema = z.object({
	email: z.email(),
	name: z.string().optional(),
	callbackURL: z.string().optional(),
});

export const enrollEmail = createAuthEndpoint(
	"/enroll",
	{
		method: "POST",
		body: enrollEmailBodySchema,
		use: [originCheck((ctx) => ctx.body.callbackURL)],
		metadata: {
			openapi: {
				operationId: "enrollEmail",
				description:
					"Start passwordless enrollment: prove ownership of an email, then set a password",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: { type: "string" },
									name: { type: "string" },
									callbackURL: { type: "string" },
								},
								required: ["email"],
							},
						},
					},
				},
				responses: {
					"200": {
						description:
							"Always returns success, whether or not the email exists, to prevent account enumeration",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: { status: { type: "boolean" } },
									required: ["status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const enrollment = ctx.context.options.user?.enrollment;
		if (!enrollment?.enabled || !enrollment.sendEnrollmentVerification) {
			// Checked together so a half-configured `user.enrollment` (enabled
			// without sendEnrollmentVerification) 404s uniformly for every
			// caller, the same as fully disabled -- branching only on `enabled`
			// would have let the response differ (200 vs the create-then-throw
			// below) depending on whether the email already has a verified
			// account, breaking the anti-enumeration guarantee below.
			throw APIError.fromStatus("NOT_FOUND");
		}
		const email = ctx.body.email.toLowerCase();
		const existing = await ctx.context.internalAdapter.findUserByEmail(email);

		if (existing?.user.emailVerified) {
			// Anti-enumeration, mirroring requestPasswordReset: a verified
			// account already owns this email, so respond exactly as if a
			// fresh pending user had been created and emailed. A pre-existing
			// but *unverified* row falls through instead, so the legitimate
			// owner of an email pre-squatted by someone else (e.g. a sign-up
			// with no verification configured) can still reclaim it here --
			// the same rescue magic-link/email-otp already provide.
			await ctx.context.internalAdapter.findVerificationValue(
				"dummy-enrollment-token",
			);
			return ctx.json({ status: true });
		}

		const user =
			existing?.user ??
			(await ctx.context.internalAdapter.createUser(
				{
					email,
					name: ctx.body.name || "",
					emailVerified: false,
				},
				{ method: "enroll" },
			));

		await createEnrollmentToken(ctx, { user });
		return ctx.json({ status: true });
	},
);

const enrollEmailCallbackBodySchema = z.object({
	token: z.string(),
	password: z.string().nonempty(),
	name: z.string().optional(),
});

export const enrollEmailCallback = createAuthEndpoint(
	"/enroll/callback",
	{
		method: "POST",
		body: enrollEmailCallbackBodySchema,
		metadata: {
			openapi: {
				operationId: "enrollEmailCallback",
				description:
					"Complete enrollment: consume the token, set a password, and sign in",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: { type: "string" },
									password: { type: "string" },
									name: { type: "string" },
								},
								required: ["token", "password"],
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Enrollment completed, user signed in",
					},
				},
			},
		},
	},
	async (ctx) => {
		const enrollment = ctx.context.options.user?.enrollment;
		if (!enrollment?.enabled || !enrollment.sendEnrollmentVerification) {
			throw APIError.fromStatus("NOT_FOUND");
		}
		const { password } = ctx.body;
		const minLength = ctx.context.password.config.minPasswordLength;
		const maxLength = ctx.context.password.config.maxPasswordLength;
		if (password.length < minLength) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
		}
		if (password.length > maxLength) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
		}

		// Consume the single-use enroll token before any write so two
		// concurrent callbacks with the same token can only complete once:
		// the first caller wins, every racer gets null.
		const verification =
			await ctx.context.internalAdapter.consumeVerificationValue(
				`enroll:${ctx.body.token}`,
			);
		if (!verification) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const { email } = JSON.parse(verification.value) as { email: string };
		const existing = await ctx.context.internalAdapter.findUserByEmail(email);
		if (!existing) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
		}
		if (existing.user.emailVerified) {
			// The row was already verified through some other path (e.g. an
			// OAuth sign-in that landed on the same email) since this token
			// was issued. Treat the token as stale rather than linking a
			// second credential account onto an account someone else already
			// proved ownership of.
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN);
		}

		// Prove-then-promote: strip any account/session this row accrued
		// before the mailbox was proven (e.g. someone else set a password on
		// it via sign-up in the meantime) and flip `emailVerified`, the same
		// guarantee magic-link and email-otp already give their own
		// passwordless sign-ins.
		const user = await revokeUnprovenAccountAccess(ctx, existing.user.id);
		if (!user) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
		}

		if (ctx.body.name && ctx.body.name !== user.name) {
			await ctx.context.internalAdapter.updateUser(user.id, {
				name: ctx.body.name,
			});
			user.name = ctx.body.name;
		}

		const hash = await ctx.context.password.hash(password);
		await ctx.context.internalAdapter.linkAccount({
			userId: user.id,
			providerId: "credential",
			issuer: createLocalAccountIssuer("credential"),
			accountId: user.id,
			password: hash,
		});

		const session = await ctx.context.internalAdapter.createSession(user.id);
		if (!session) {
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
			);
		}
		await setSessionCookie(ctx, { session, user });

		return ctx.json({
			token: session.token,
			user: parseUserOutput(ctx.context.options, user),
		});
	},
);
