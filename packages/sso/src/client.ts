import type { BetterAuthClientPlugin } from "better-auth/client";
import type { SSOPlugin } from "./index";
import { PACKAGE_VERSION } from "./version";

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
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as SSOPlugin<{
			domainVerification: {
				enabled: CO["domainVerification"] extends { enabled: true }
					? true
					: false;
			};
		}>,
		pathMethods: {
			"/sso/providers": "GET",
			"/sso/get-provider": "GET",
		},
	} satisfies BetterAuthClientPlugin;
};
