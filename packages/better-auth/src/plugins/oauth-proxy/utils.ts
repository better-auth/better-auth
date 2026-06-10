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
 * Returns `ctx.request.url` only when its origin is explicitly trusted.
 */
function getTrustedRequestURL(ctx: GenericEndpointContext): string | undefined {
	const requestURL = ctx.request?.url;
	if (!requestURL) {
		return undefined;
	}
	if (ctx.context.isTrustedOrigin(requestURL, { allowRelativePaths: false })) {
		return requestURL;
	}
	return undefined;
}

/**
 * Resolve the current URL from various sources.
 *
 * The raw request URL is only honored when its origin is allowlisted in
 * `trustedOrigins`; otherwise it falls back to the vendor/base URL so an
 * un-allowlisted request origin isn't used as the proxy callback origin.
 */
export function resolveCurrentURL(
	ctx: GenericEndpointContext,
	opts?: OAuthProxyOptions,
) {
	// An explicit `currentURL` is developer-provided config and always trusted.
	if (opts?.currentURL) {
		return new URL(opts.currentURL);
	}
	const trustedRequestURL = getTrustedRequestURL(ctx);
	if (trustedRequestURL) {
		return new URL(trustedRequestURL);
	}
	if (ctx.request?.url) {
		ctx.context.logger.warn(
			`OAuth proxy: request origin "${getOrigin(
				ctx.request.url,
			)}" is not in \`trustedOrigins\`; falling back to the configured URL. Add it (or a matching wildcard) to \`trustedOrigins\`, or set the \`currentURL\` option, to use it as the proxy callback origin.`,
		);
	}
	return new URL(getVendorBaseURL() || ctx.context.baseURL);
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

	// Determine current URL from config, a trusted request origin, or vendor env
	// vars. The raw request URL is only used when its origin is allowlisted,
	// so an un-allowlisted request origin doesn't affect the proxy decision.
	const currentURL =
		opts?.currentURL || getTrustedRequestURL(ctx) || getVendorBaseURL();
	if (!currentURL) {
		return false;
	}

	const productionOrigin = getOrigin(productionURL);
	const currentOrigin = getOrigin(currentURL);

	return productionOrigin === currentOrigin;
}
