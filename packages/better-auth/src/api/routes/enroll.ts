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
		/**
		 * Whether `/enroll/callback` must end up with a non-empty name for
		 * this user before it completes.
		 *
		 * @default true
		 */
		requireName?: boolean;
		/**
		 * The app's own page that collects the password and calls
		 * `/enroll/callback` -- `/enroll/callback` itself is POST-only and
		 * takes a password, so it can never be the target of a clicked
		 * link. Resolved against `baseURL`'s origin the same way magic
		 * link resolves its own callback URLs. Falls back to a
		 * `/enroll/callback?token=...` placeholder when omitted; that
		 * placeholder is not a usable link on its own and is meant to be
		 * replaced by the app's own URL built from `token`.
		 */
		callbackURL?: string;
		/**
		 * Called after the enroll token is persisted but before the
		 * enrollment email is sent, so a caller that needs its own record
		 * keyed by this token (e.g. the organization plugin's invitation
		 * linkage) can create it before the token is reachable by anyone
		 * who receives the email.
		 */
		onTokenCreated?: (token: string, expiresAt: Date) => Promise<void>;
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
		value: JSON.stringify({
			email: opts.user.email,
			requireName: opts.requireName,
		}),
		identifier: `enroll:${token}`,
		expiresAt,
	});
	if (opts.onTokenCreated) {
		await opts.onTokenCreated(token, expiresAt);
	}
	// `URL` + `searchParams.set`, not string concatenation: callbackURL may
	// already carry its own query string (e.g. "/finish?ref=email"), and
	// naively appending "?token=..." would produce a second "?" instead
	// of "&".
	//
	// The default (no callbackURL) and the caller-supplied case resolve
	// differently on purpose: with no callbackURL, the link must point at
	// this same API's own /enroll/callback route, so it has to keep
	// baseURL's path (e.g. "/api/auth") -- resolving "/enroll/callback"
	// as an absolute path against the full baseURL would instead replace
	// that path outright, same as magic-link's own verify URL falls back
	// to when it builds its default. A caller-supplied callbackURL, by
	// contrast, is a path on the *app*, unrelated to the API's own path
	// prefix, so it only needs baseURL's origin.
	const realBaseURL = new URL(ctx.context.baseURL);
	// A configured baseURL with an explicit path (unlike the bare-origin
	// case, which framework code always normalizes) is used verbatim,
	// trailing slash included -- see withPath() in utils/url.ts, which
	// only trims it away when appending its own default "/api/auth".
	// Stripped here too, or a trailing slash produces a doubled "//"
	// before "/enroll/callback".
	const basePath =
		realBaseURL.pathname === "/"
			? ""
			: realBaseURL.pathname.replace(/\/+$/, "");
	const enrollmentUrl = opts.callbackURL
		? new URL(opts.callbackURL, realBaseURL.origin)
		: new URL(`${basePath}/enroll/callback`, realBaseURL.origin);
	enrollmentUrl.searchParams.set("token", token);
	await ctx.context.runInBackgroundOrAwait(
		enrollment.sendEnrollmentVerification(
			{
				user: opts.user,
				url: enrollmentUrl.toString(),
				token,
				invitation: opts.invitation,
			},
			ctx.request,
		),
	);
	return { token, expiresAt };
}

const enrollBodySchema = z.object({
	email: z.email(),
	name: z.string().optional(),
	callbackURL: z.string().optional(),
});

export const enroll = createAuthEndpoint(
	"/enroll",
	{
		method: "POST",
		body: enrollBodySchema,
		use: [originCheck((ctx) => ctx.body.callbackURL)],
		metadata: {
			openapi: {
				operationId: "enroll",
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

		// `name` is intentionally only applied when creating a brand-new
		// row, never to an existing one being reclaimed: /enroll has no
		// proof of ownership at all (it's the anti-enumeration-gated
		// initiation step, callable by anyone for any email), so applying
		// caller-supplied data to someone else's pending row here -- before
		// they've so much as received the email, let alone proven they
		// control it -- would let an unauthenticated caller rename an
		// unrelated pending user. The real owner can still set their name
		// once they actually prove ownership, at /enroll/callback.
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

		await createEnrollmentToken(ctx, { user, callbackURL: ctx.body.callbackURL });
		return ctx.json({ status: true });
	},
);

const enrollCallbackBodySchema = z.object({
	token: z.string(),
	password: z.string().nonempty(),
	name: z.string().optional(),
});

export const enrollCallback = createAuthEndpoint(
	"/enroll/callback",
	{
		method: "POST",
		body: enrollCallbackBodySchema,
		metadata: {
			openapi: {
				operationId: "enrollCallback",
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

		// Peeked, not consumed, until every precondition below passes.
		// Consuming first and then failing on a later check (a missing
		// name, a stale token) would burn the single-use token and, once
		// revokeUnprovenAccountAccess below has already run, strip the
		// row's prior credential with no way back: a fresh /enroll call
		// for an already-verified email issues no new token at all.
		const identifier = `enroll:${ctx.body.token}`;
		const pending =
			await ctx.context.internalAdapter.findVerificationValue(identifier);
		if (!pending || pending.expiresAt < new Date()) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const { email, requireName } = JSON.parse(pending.value) as {
			email: string;
			requireName?: boolean;
		};
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

		// A name given at /enroll already satisfies this -- it's only
		// checked once, against whichever name the user would end up
		// with, so a name provided at either step is accepted and neither
		// step demands it twice.
		if (requireName !== false && !(ctx.body.name || existing.user.name)) {
			throw APIError.from("BAD_REQUEST", {
				message: "A name is required to complete enrollment",
				code: "NAME_REQUIRED",
			});
		}

		// Hashed only now -- after every cheap, non-destructive check
		// above already passed, so a flood of requests carrying garbage
		// or expired tokens can't force the server to spend CPU on the
		// deliberately expensive password KDF -- but still before the
		// token is consumed or any prior access is stripped, the same way
		// signUpEmail hashes before creating the user: a plugin that
		// wraps password hashing to reject it (e.g. a breach check) must
		// fail here, not after, with no way back.
		const hash = await ctx.context.password.hash(password);

		// Only now, with every precondition satisfied, actually consume
		// the token: the first caller to reach this point wins, every
		// concurrent racer gets null.
		const verification =
			await ctx.context.internalAdapter.consumeVerificationValue(identifier);
		if (!verification) {
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
