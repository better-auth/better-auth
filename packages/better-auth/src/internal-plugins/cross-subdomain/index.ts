import type { BetterAuthPlugin } from "../../types";

interface Options {
	/**
	 * By default, domain name will be extracted from base URL
	 * you can provide a custom domain name here
	 */
	domainName?: string;
	/**
	 * List of cookies that should be shared across subdomains
	 *
	 * by default, only sessionToken, csrfToken and dontRememberToken
	 * cookies will be shared across subdomains
	 */
	eligibleCookies?: string[];
}

/**
 * This plugin will update the domain of the cookies
 * that are eligible to be shared across subdomains
 * @param options
 * @category Plugins
 *
 * @internal plugin
 */
export const crossSubdomainCookies = (options?: Options) => {
	return {
		id: "cross-subdomain-cookies",
		async onResponse(response, ctx) {
			const setCookie = response.headers.get("set-cookie");
			if (!setCookie) return;
			const baseURL = ctx.baseURL;
			const cookieParts = setCookie.split(";");
			const domain = options?.domainName || new URL(baseURL).hostname;
			const authCookies = ctx.authCookies;
			const cookieNamesEligibleForDomain = [
				authCookies.sessionToken.name,
				authCookies.csrfToken.name,
				authCookies.dontRememberToken.name,
			];

			if (
				!cookieNamesEligibleForDomain.some((name) => setCookie.includes(name))
			) {
				return;
			}

			const updatedCookies = cookieParts
				.map((part) => {
					if (
						!cookieNamesEligibleForDomain.some((name) =>
							part.toLowerCase().includes(name.toLowerCase()),
						)
					) {
						return part;
					}

					const trimmedPart = part.trim();
					if (trimmedPart.toLowerCase().startsWith("domain=")) {
						return `Domain=${domain}`;
					}
					if (!trimmedPart.toLowerCase().includes("domain=")) {
						return `${trimmedPart}; Domain=${domain}`;
					}
					return trimmedPart;
				})
				.filter(
					(part, index, self) =>
						index ===
						self.findIndex((p) => p.split(";")[0] === part.split(";")[0]),
				)
				.join("; ");
			response.headers.set("set-cookie", updatedCookies);
			return {
				response,
			};
		},
	} satisfies BetterAuthPlugin;
};
