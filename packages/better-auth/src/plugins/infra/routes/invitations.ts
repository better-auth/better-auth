import { createFetch } from "@better-fetch/fetch";
import { APIError } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import z from "zod";
import { DASH_API_URL } from "../constants";
import type { DashOptionsInternal } from "../types";

interface ProjectInvitation {
	id: string;
	email: string;
	name: string | null;
	status: string;
	redirectUrl: string | null;
	expiresAt: string | null;
	organizationId: string;
	token: string;
	authMode: "auth" | "direct";
}

/**
 * Accept invitation endpoint
 * This is called when a user clicks the invitation link.
 * It creates the user in the auth database and sets up a session.
 */
export const acceptInvitation = (options: DashOptionsInternal) => {
	const $api = createFetch({
		baseURL: options.apiUrl || DASH_API_URL,
		headers: {
			"x-api-key": options.apiKey,
		},
	});

	return createAuthEndpoint(
		"/dash/accept-invitation",
		{
			method: "GET",
			query: z.object({
				token: z.string(),
			}),
		},
		async (ctx) => {
			const { token } = ctx.query;

			// Fetch invitation details from platform API
			const { data: invitation, error } = await $api<ProjectInvitation>(
				"/api/internal/invitations/verify",
				{
					method: "POST",
					body: { token },
				},
			);

			if (error || !invitation) {
				// Redirect to error page or return error
				throw new APIError("BAD_REQUEST", {
					message: "Invalid or expired invitation.",
				});
			}

			if (invitation.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					message: `This invitation has already been ${invitation.status}.`,
				});
			}

			// Check if invitation has expired
			if (invitation.expiresAt) {
				const expiresAt = new Date(invitation.expiresAt);
				if (expiresAt < new Date()) {
					// Mark as expired on platform
					await $api("/api/internal/invitations/mark-expired", {
						method: "POST",
						body: { token },
					});
					throw new APIError("BAD_REQUEST", {
						message: "This invitation has expired.",
					});
				}
			}

			// Check if user already exists
			const existingUser = await ctx.context.internalAdapter
				.findUserByEmail(invitation.email)
				.then((user) => user?.user);

			if (existingUser) {
				// User already exists - just mark invitation as accepted and redirect
				await $api("/api/internal/invitations/mark-accepted", {
					method: "POST",
					body: { token, userId: existingUser.id },
				});

				// Create session for existing user
				const session = await ctx.context.internalAdapter.createSession(
					existingUser.id,
				);

				// Set session cookie
				await setSessionCookie(ctx, { session, user: existingUser });

				// Redirect to the specified URL or default
				const redirectUrl =
					invitation.redirectUrl || ctx.context.options.baseURL || "/";
				return ctx.redirect(redirectUrl);
			}

			// Handle based on auth mode
			if (invitation.authMode === "auth") {
				// Redirect to platform's invitation acceptance page
				// User will set password or use social provider there
				const platformUrl = options.apiUrl || DASH_API_URL;
				const acceptPageUrl = new URL("/invite/accept", platformUrl);
				acceptPageUrl.searchParams.set("token", token);
				// Pass the callback URL so platform knows where to redirect after auth
				const callbackUrl = `${ctx.context.options.baseURL}${ctx.context.options.basePath || "/api/auth"}/dash/complete-invitation`;
				acceptPageUrl.searchParams.set("callback", callbackUrl);
				return ctx.redirect(acceptPageUrl.toString());
			}

			// Direct mode: Create new user immediately
			const user = await ctx.context.internalAdapter.createUser({
				email: invitation.email,
				name: invitation.name || invitation.email.split("@")[0] || "",
				emailVerified: true, // Invited users have verified email
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			// Mark invitation as accepted on platform
			await $api("/api/internal/invitations/mark-accepted", {
				method: "POST",
				body: { token, userId: user.id },
			});

			// Create session for the new user
			const session = await ctx.context.internalAdapter.createSession(user.id);

			// Set session cookie
			await setSessionCookie(ctx, { session, user });

			// Redirect to the specified URL or default
			const redirectUrl =
				invitation.redirectUrl || ctx.context.options.baseURL || "/";
			return ctx.redirect(redirectUrl);
		},
	);
};

/**
 * Complete invitation endpoint
 * Called by the platform after user completes authentication (password/social)
 * This creates the user in the auth database and sets up a session
 */
export const completeInvitation = (options: DashOptionsInternal) => {
	const $api = createFetch({
		baseURL: options.apiUrl || DASH_API_URL,
		headers: {
			"x-api-key": options.apiKey,
		},
	});

	return createAuthEndpoint(
		"/dash/complete-invitation",
		{
			method: "POST",
			body: z.object({
				token: z.string(),
				password: z.string().optional(), // If user set a password
				providerId: z.string().optional(), // If user used social login
				providerAccountId: z.string().optional(),
				accessToken: z.string().optional(),
				refreshToken: z.string().optional(),
			}),
		},
		async (ctx) => {
			const {
				token,
				password,
				providerId,
				providerAccountId,
				accessToken,
				refreshToken,
			} = ctx.body;

			// Fetch invitation details from platform API
			const { data: invitation, error } = await $api<ProjectInvitation>(
				"/api/internal/invitations/verify",
				{
					method: "POST",
					body: { token },
				},
			);

			if (error || !invitation) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid or expired invitation.",
				});
			}

			if (invitation.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					message: `This invitation has already been ${invitation.status}.`,
				});
			}

			if (!ctx.context) {
				throw new APIError("BAD_REQUEST", {
					message: "Context is required",
				});
			}
			// Check if user already exists
			const existingUser = await ctx.context.internalAdapter
				.findUserByEmail(invitation.email)
				.then((user) => user?.user);

			if (existingUser) {
				// User already exists - mark as accepted and create session
				await $api("/api/internal/invitations/mark-accepted", {
					method: "POST",
					body: { token, userId: existingUser.id },
				});

				const session = await ctx.context.internalAdapter.createSession(
					existingUser.id,
				);

				await setSessionCookie(ctx, { session, user: existingUser });

				return {
					success: true,
					redirectUrl:
						invitation.redirectUrl || ctx.context.options.baseURL || "/",
				};
			}

			// Create new user
			const user = await ctx.context.internalAdapter.createUser({
				email: invitation.email,
				name: invitation.name || invitation.email.split("@")[0] || "",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			// Create account based on authentication method
			if (password) {
				// Password-based authentication
				await ctx.context.internalAdapter.createAccount({
					userId: user.id,
					providerId: "credential",
					accountId: user.id,
					password: await ctx.context.password.hash(password),
				});
			} else if (providerId && providerAccountId) {
				// Social provider authentication
				await ctx.context.internalAdapter.createAccount({
					userId: user.id,
					providerId,
					accountId: providerAccountId,
					accessToken,
					refreshToken,
				});
			}

			// Mark invitation as accepted on platform
			await $api("/api/internal/invitations/mark-accepted", {
				method: "POST",
				body: { token, userId: user.id },
			});

			// Create session
			const session = await ctx.context.internalAdapter.createSession(user.id);

			await setSessionCookie(ctx, { session, user });

			return {
				success: true,
				redirectUrl:
					invitation.redirectUrl || ctx.context.options.baseURL || "/",
			};
		},
	);
};

/**
 * Check if a user exists by email
 * Used by the platform to verify before sending invitation
 * This is different from /dash/organization/check-user-by-email which also checks membership
 */
export const checkUserExists = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/check-user-exists",
		{
			method: "POST",
			body: z.object({
				email: z.string().email(),
			}),
		},
		async (ctx) => {
			const { email } = ctx.body;

			// Verify Authorization header (JWT from platform)
			const authHeader = ctx.request?.headers.get("Authorization");

			if (!authHeader) {
				throw new APIError("UNAUTHORIZED", {
					message: "Authorization required",
				});
			}

			const existingUser = await ctx.context.internalAdapter
				.findUserByEmail(email.toLowerCase())
				.then((user) => user?.user);

			return {
				exists: !!existingUser,
				userId: existingUser?.id || null,
			};
		},
	);
};
