import { generateState as generateStateOAuth } from "oslo/oauth2";

export function generateState(callbackURL?: string, currentURL?: string) {
	const code = generateStateOAuth();
	const state = `${code}!${callbackURL}!${currentURL}`;
	return { state, code };
}

export function parseState(state: string) {
	const [code, callbackURL, currentURL] = state.split("!");
	return { code, callbackURL, currentURL };
}
