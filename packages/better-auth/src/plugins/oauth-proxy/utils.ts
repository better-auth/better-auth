import { env } from "@better-auth/core/env";
import type { EndpointContext } from "better-call";
import { getOrigin } from "../../utils/url";
import type { OAuthProxyOptions } from "./index";

/**
 * Get base URL from vendor-specific environment variables
 */
export function getVendorBaseURL() {
	const vercel = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
	const netlify = env.NETLIFY_URL;
	const render = env.RENDER_URL;
	const aws = env.AWS_LAMBDA_FUNCTION_NAME;
	const google = env.GOOGLE_CLOUD_FUNCTION_NAME;
	const azure = env.AZURE_FUNCTION_NAME;

	return vercel || netlify || render || aws || google || azure;
}

/**
 * Resolve the current URL from various sources
 */
export function resolveCurrentURL(
	ctx: EndpointContext<string, any>,
	opts?: OAuthProxyOptions,
) {
	return new URL(
		opts?.currentURL ||
			ctx.request?.url ||
			getVendorBaseURL() ||
			ctx.context.baseURL,
	);
}

/**
 * Check if the proxy should be skipped for this request
 */
export function checkSkipProxy(
	ctx: EndpointContext<string, any>,
	opts?: OAuthProxyOptions,
) {
	// If skip proxy header is set, we don't need to proxy
	const skipProxyHeader = ctx.request?.headers.get("x-skip-oauth-proxy");
	if (skipProxyHeader) {
		return true;
	}

	const productionURL = opts?.productionURL || env.BETTER_AUTH_URL;
	if (!productionURL) {
		return false;
	}

	// Use request URL to determine current environment, not baseURL
	// because baseURL is always the production URL
	const currentURL = ctx.request?.url || getVendorBaseURL();
	if (!currentURL) {
		return false;
	}

	// Compare origins - if same, we're in production so skip proxy
	const productionOrigin = getOrigin(productionURL);
	const currentOrigin = getOrigin(currentURL);

	return productionOrigin === currentOrigin;
}
