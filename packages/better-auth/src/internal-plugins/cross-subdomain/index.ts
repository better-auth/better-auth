import type { BetterAuthPlugin } from "../../types";
import type { BetterAuthCookies } from "../../utils/cookies";

type EligibleCookies = keyof BetterAuthCookies;

interface Options {
	/**
	 * Domain name for the cookies. If not provided, it will be extracted from the base URL.
	 * Should start with a dot for cross-subdomain compatibility (e.g., '.example.com')
	 */
	domain?: string;
	/**
	 * List of cookies that should be shared across subdomains.
	 * By default, only sessionToken, csrfToken, and dontRememberToken cookies will be shared.
	 */
	eligibleCookies?: EligibleCookies[];
}

function getEligibleCookies(
	authCookies: BetterAuthCookies,
	eligibleCookies?: EligibleCookies[],
) {
	const cookies: string[] = [];
	for (const cookie of eligibleCookies || []) {
		cookies.push(authCookies[cookie].name);
	}
	return cookies;
}

/**
 * This plugin updates the domain of eligible cookies to be shared across subdomains
 * @param options
 * @category Plugins
 *
 * @internal plugin
 */
export const crossSubdomainCookies = (options?: Options): BetterAuthPlugin => {
	return {
		id: "cross-subdomain-cookies",
		async onResponse(response, ctx) {
			const setCookie = response.headers.get("set-cookie");
			if (!setCookie) return { response };

			const baseURL = ctx.baseURL;
			const domain = options?.domain || `.${new URL(baseURL).hostname}`;
			const authCookies = ctx.authCookies;
			const eligibleCookies = options?.eligibleCookies
				? getEligibleCookies(
						authCookies,
						options.eligibleCookies as EligibleCookies[],
					)
				: [
						authCookies.sessionToken.name,
						authCookies.csrfToken.name,
						authCookies.dontRememberToken.name,
					];

			const updatedCookies = setCookie
				.split(",")
				.map((cookie) => {
					const [name] = cookie.trim().split("=");
					if (!eligibleCookies.includes(name)) return cookie;

					const parts = cookie.split(";").map((part) => part.trim());
					const domainIndex = parts.findIndex((part) =>
						part.toLowerCase().startsWith("domain="),
					);

					if (domainIndex !== -1) {
						parts[domainIndex] = `Domain=${domain}`;
					} else {
						parts.push(`Domain=${domain}`);
					}

					const sameSiteIndex = parts.findIndex((part) =>
						part.toLowerCase().startsWith("samesite="),
					);
					if (sameSiteIndex !== -1) {
						parts[sameSiteIndex] = "SameSite=None";
					} else {
						parts.push("SameSite=None");
					}

					if (!parts.includes("Secure")) {
						parts.push("Secure");
					}

					return parts.join("; ");
				})
				.join(", ");

			response.headers.set("set-cookie", updatedCookies);
			return { response };
		},
	};
};
