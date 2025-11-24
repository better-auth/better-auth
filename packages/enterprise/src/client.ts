import { createAuthClient } from "better-auth/react";
import type { AuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { apiKeyClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { lastLoginMethodClient } from "better-auth/client/plugins";

export * from "better-auth/client/plugins";

export const createEnterpriseClient = ({ baseURL }: { baseURL: string }) => {
	return createAuthClient({
		baseURL, // The base URL of your auth server
		plugins: [
			organizationClient(),
			adminClient(),
			apiKeyClient(),
			ssoClient(),
			twoFactorClient(),
			lastLoginMethodClient(),
		],
	}) as AuthClient<{
		baseURL: string;
		plugins: [
			ReturnType<typeof organizationClient>,
			ReturnType<typeof adminClient>,
			ReturnType<typeof apiKeyClient>,
			ReturnType<typeof ssoClient>,
			ReturnType<typeof twoFactorClient>,
			ReturnType<typeof lastLoginMethodClient>,
		];
	}>;
};
