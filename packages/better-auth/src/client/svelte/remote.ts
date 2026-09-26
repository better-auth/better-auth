import * as z from "zod";
import { command, form, getRequestEvent, query } from "$app/server";

/**
 * Server auth instance. Remote functions call `auth.api` on the server.
 * Install the `sveltekitCookies` plugin so `Set-Cookie` from these calls
 * is written onto the current SvelteKit request.
 */
export type RemoteAuth = {
	api: {
		signInEmail: (context: {
			body: { email: string; password: string; rememberMe?: boolean };
			headers: Headers;
		}) => Promise<unknown>;
		signUpEmail: (context: {
			body: { name: string; email: string; password: string };
			headers: Headers;
		}) => Promise<unknown>;
		signOut: (context: { headers: Headers }) => Promise<unknown>;
		getSession: (context: { headers: Headers }) => Promise<unknown>;
	};
};

const emailSignInSchema = z.object({
	email: z.string(),
	password: z.string(),
	rememberMe: z.string().optional(),
});

const emailSignUpSchema = z.object({
	name: z.string(),
	email: z.string(),
	password: z.string(),
});

function requestHeaders() {
	return getRequestEvent().request.headers;
}

function rememberMeFromForm(value: string | undefined) {
	if (value === undefined) return undefined;
	return value === "on" || value === "true";
}

/**
 * SvelteKit remote client for email sign-in, email sign-up, sign-out, and
 * the current session.
 *
 * Import this from a `.remote.ts` file. It is a separate export from
 * `better-auth/svelte` because that entry is loaded in the browser, and
 * these functions import `$app/server`.
 *
 * OAuth callbacks, magic links, and WebAuthn stay on the existing handler.
 *
 * @example
 * ```ts
 * // src/lib/auth.remote.ts
 * import { createRemoteAuthClient } from "better-auth/svelte/remote";
 * import { auth } from "$lib/server/auth";
 *
 * export const { signIn, signUp, signOut, useSession } =
 *   createRemoteAuthClient(auth);
 * ```
 */
export function createRemoteAuthClient<Auth extends RemoteAuth>(auth: Auth) {
	const useSession = query(async () => {
		return auth.api.getSession({ headers: requestHeaders() });
	});

	const signInEmail = form(
		emailSignInSchema,
		async ({ email, password, rememberMe }) => {
			const result = await auth.api.signInEmail({
				body: {
					email,
					password,
					rememberMe: rememberMeFromForm(rememberMe),
				},
				headers: requestHeaders(),
			});
			await useSession().refresh();
			return result;
		},
	);

	const signUpEmail = form(
		emailSignUpSchema,
		async ({ name, email, password }) => {
			const result = await auth.api.signUpEmail({
				body: { name, email, password },
				headers: requestHeaders(),
			});
			await useSession().refresh();
			return result;
		},
	);

	const signOut = command(async () => {
		const result = await auth.api.signOut({ headers: requestHeaders() });
		await useSession().refresh();
		return result;
	});

	return {
		signIn: { email: signInEmail },
		signUp: { email: signUpEmail },
		signOut,
		useSession,
	};
}
