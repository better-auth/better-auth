import { generateState as generateStateOAuth } from "oslo/oauth2";
import { z } from "zod";
import { BetterAuthError } from "../error/better-auth-error";

export function generateState(callbackURL?: string) {
	const code = generateStateOAuth();
	const state = JSON.stringify({
		code,
		callbackURL,
	});
	if (state.length > 4000) {
		throw new BetterAuthError(
			"State is too long to be safely stored in a cookie. Make sure the callbackURL is not too long.",
		);
	}
	return state;
}

export function parseState(state: string) {
	const data = z
		.object({
			code: z.string(),
			callbackURL: z.string().optional(),
			currentURL: z.string().optional(),
		})
		.safeParse(JSON.parse(state));
	return data;
}
