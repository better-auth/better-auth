import type { BetterAuthClientPlugin } from "better-auth";
import type { SSOPlugin } from "./index";

interface SSOClientOptions {
	domainVerification?:
		| {
				enabled: boolean;
		  }
		| undefined;
}

export const ssoClient = <CO extends SSOClientOptions>(
	options?: CO | undefined,
) => {
	return {
		id: "sso-client",
		$InferServerPlugin: {} as SSOPlugin<{
			domainVerification: {
				enabled: CO["domainVerification"] extends { enabled: true }
					? true
					: false;
			};
		}>,
		pathMethods: {
			"/sso/providers": "GET",
			"/sso/providers/:providerId": "GET",
			// PATCH/DELETE inferred from endpoints or specified in fetchOptions
		},
	} satisfies BetterAuthClientPlugin;
};
