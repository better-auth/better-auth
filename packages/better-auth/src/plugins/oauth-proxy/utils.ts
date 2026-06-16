import type { GenericEndpointContext } from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { getOrigin, trimTrailingSlashes } from "../../utils/url";
import type { OAuthProxyOptions } from "./index";

/**
 * Strip trailing slashes from URL to prevent double slashes
 */
export function stripTrailingSlash(url: string | undefined): string {
	if (!url) return "";
	return trimTrailingSlashes(url);
}

/**
 * Get base URL from vendor-specific environment variables
 */
function getVendorBaseURL() {
	const vercel = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
	const netlify = env.NETLIFY_URL;
	const render = env.RENDER_URL;
	const aws = env.AWS_LAMBDA_FUNCTION_NAME;
	const google = env.GOOGLE_CLOUD_FUNCTION_NAME;
	const azure = env.AZURE_FUNCTION_NAME;

	return vercel || netlify || render || aws || google || azure;
}

/**
 * Resolve the current URL from various sources.
 *
 * The request URL host can come from an untrusted source (`Host` / forwarded host),
 * and this origin becomes the receiver for the encrypted OAuth profile replay.
 * So a request-derived origin is only honored when it is an explicitly trusted
 * origin; otherwise resolution falls back to the configured platform/base URL,
 * never the raw request host. An explicit `opts.currentURL` and the vendor/base
 * URLs are configured by the developer and trusted as-is.
 */
export function resolveCurrentURL(
	ctx: GenericEndpointContext,
	opts?: OAuthProxyOptions,
) {
	if (opts?.currentURL) {
		return new URL(opts.currentURL);
	}

	const requestURL = ctx.request?.url;
	if (requestURL) {
		const origin = getOrigin(requestURL);
		if (origin && ctx.context.isTrustedOrigin(origin)) {
			return new URL(requestURL);
		}
	}

	// getVendorBaseURL() returns a full URL on some platforms (Vercel, Netlify,
	// Render) but a bare function name on others (AWS Lambda, GCP, Azure). Only
	// use it when it parses as a URL; otherwise fall back to the base URL.
	const vendorBaseURL = getVendorBaseURL();
	return new URL(
		vendorBaseURL && getOrigin(vendorBaseURL)
			? vendorBaseURL
			: ctx.context.baseURL,
	);
}

/**
 * Check if the proxy should be skipped for this request
 */
export function checkSkipProxy(
	ctx: GenericEndpointContext,
	opts?: OAuthProxyOptions,
) {
	// If skip proxy header is set, we don't need to proxy
	const skipProxyHeader = ctx.request?.headers.get("x-skip-oauth-proxy");
	if (skipProxyHeader) {
		return true;
	}

	// Determine production URL (fallback to baseURL if not set)
	const productionURL =
		opts?.productionURL || env.BETTER_AUTH_URL || ctx.context.baseURL;
	if (!productionURL) {
		return false;
	}

	// Determine current URL from request or vendor env vars
	const currentURL = opts?.currentURL || ctx.request?.url || getVendorBaseURL();
	if (!currentURL) {
		return false;
	}

	const productionOrigin = getOrigin(productionURL);
	const currentOrigin = getOrigin(currentURL);

	return productionOrigin === currentOrigin;
}
