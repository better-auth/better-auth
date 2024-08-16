import { generateState as generateStateOAuth } from "oslo/oauth2";

export function generateState(callbackURL?: string) {
	const code = generateStateOAuth();
	const state = `${code}!${callbackURL}`;
	return { state, code };
}

export function parseState(state: string) {
	const [code, callbackURL] = state.split("!");
	return { code, callbackURL };
}
