import { generateState as generateStateOAuth } from "oslo/oauth2";
import { z } from "zod";

export function generateState(
	callbackURL?: string,
	currentURL?: string,
	dontRememberMe?: boolean,
	additionalFields?: Record<string, any>,
) {
	const code = generateStateOAuth();
	const state = JSON.stringify({
		code,
		callbackURL,
		currentURL,
		dontRememberMe,
		additionalFields,
	});
	return { state, code };
}

export function parseState(state: string) {
	const data = z
		.object({
			code: z.string(),
			callbackURL: z.string().optional(),
			currentURL: z.string().optional(),
			dontRememberMe: z.boolean().optional(),
			additionalFields: z.record(z.string()).optional(),
		})
		.safeParse(JSON.parse(state));
	return data;
}
