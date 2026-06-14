import type { BetterAuthClientPlugin } from "better-auth/client";
import type { DBFieldAttribute } from "better-auth/db";
import type { SSOPlugin } from "./index";
import { PACKAGE_VERSION } from "./version";

interface SSOClientOptions {
	domainVerification?:
		| {
				enabled: boolean;
		  }
		| undefined;
	schema?:
		| {
				ssoProvider?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
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
			schema: CO["schema"];
		}>,
		pathMethods: {
			"/sso/providers": "GET",
			"/sso/get-provider": "GET",
		},
	} satisfies BetterAuthClientPlugin;
};
