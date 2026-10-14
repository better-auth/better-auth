import { oauthTokenExchange } from "@better-auth/oauth-provider";

export function isTokenExchangeDemoEnabled() {
	return process.env.TOKEN_EXCHANGE_DEMO_ENABLED === "true";
}

/** The downstream API's base URL, which is also its resource identifier. */
export function getTokenExchangeDemoAPIURL() {
	const value = process.env.TOKEN_EXCHANGE_DEMO_API_URL;
	if (!value) {
		throw new Error(
			"TOKEN_EXCHANGE_DEMO_API_URL is required for the token exchange demo",
		);
	}
	return value;
}

export function createTokenExchangeDemoPlugins() {
	return isTokenExchangeDemoEnabled() ? [oauthTokenExchange()] : [];
}

export function getTokenExchangeDemoResources() {
	return isTokenExchangeDemoEnabled() ? [getTokenExchangeDemoAPIURL()] : [];
}

/**
 * Links DCR clients (the MCP client) to the MCP resource so they can request
 * `resource=<BASE>/api/mcp`. Without it DCR clients get `invalid_target`.
 */
export function getTokenExchangeDemoRegistrationOptions() {
	if (!isTokenExchangeDemoEnabled()) return {};
	const baseURL = process.env.BETTER_AUTH_URL;
	if (!baseURL) {
		throw new Error("BETTER_AUTH_URL is required for the token exchange demo");
	}
	return { clientRegistrationDefaultResources: [`${baseURL}/api/mcp`] };
}
