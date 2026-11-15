import type { OAuthProviderExtension } from "@better-auth/oauth-provider";
import { extendOAuthProvider } from "@better-auth/oauth-provider";
import { getAuthEndpointUrl } from "@better-auth/oauth-provider/internal";
import type { BetterAuthPlugin } from "better-auth";
import { AUTHORIZE_CHALLENGE_PATH } from "./constants";
import { createAuthorizeChallenge } from "./endpoint";
import { FIRST_PARTY_APPS_ERROR_CODES } from "./error-codes";
import { schema } from "./schema";
import { authSessionTokenResponse, createStepUpCheck } from "./token-endpoint";
import type {
	FirstPartyAppsOptions,
	ResolvedFirstPartyAppsOptions,
} from "./types";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"first-party-apps": {
			creator: typeof firstPartyApps;
		};
	}
}

/**
 * OAuth 2.0 for First-Party Applications for `oauthProvider()`: native and
 * CLI apps from the same operator sign users in without a browser, at
 * `POST /oauth2/authorize-challenge`, and redeem the code at the token
 * endpoint.
 *
 * Only clients with `metadata.first_party_app: true` and `skip_consent`
 * may use it. Requires the `oauth-provider` and `jwt` plugins.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-oauth-first-party-apps/
 */
export const firstPartyApps = (options: FirstPartyAppsOptions) => {
	const ids = new Set<string>();
	for (const strategy of options.strategies) {
		if (ids.has(strategy.id)) {
			throw new Error(
				`first-party-apps: two strategies use the id "${strategy.id}"`,
			);
		}
		ids.add(strategy.id);
	}
	const clientBudget = options.budget?.client;
	const resolved: ResolvedFirstPartyAppsOptions = {
		...options,
		authSession: {
			expiresIn: options.authSession?.expiresIn ?? 600,
			maxFailures: options.authSession?.maxFailures ?? 3,
		},
		budget: {
			account: {
				window: options.budget?.account?.window ?? 900,
				max: options.budget?.account?.max ?? 10,
			},
			client:
				clientBudget === false
					? false
					: {
							window: clientBudget?.window ?? 60,
							max: clientBudget?.max ?? 100,
						},
		},
	};
	const extension: OAuthProviderExtension = {
		name: "first-party-apps",
		metadata: ({ ctx }) => ({
			authorization_challenge_endpoint: getAuthEndpointUrl(
				ctx,
				AUTHORIZE_CHALLENGE_PATH,
			),
		}),
		beforeTokenIssuance: createStepUpCheck(resolved),
		tokenResponseFields: authSessionTokenResponse,
	};
	return {
		id: "first-party-apps",
		version: PACKAGE_VERSION,
		schema,
		init(ctx) {
			extendOAuthProvider(ctx, extension);
		},
		endpoints: {
			authorizeChallenge: createAuthorizeChallenge(resolved),
		},
		// Credential guessing is limited per account, client, and handle in the
		// endpoint; this caps each IP as well.
		rateLimit: [
			{
				pathMatcher: (path: string) => path === AUTHORIZE_CHALLENGE_PATH,
				window: 60,
				max: 30,
			},
		],
		$ERROR_CODES: FIRST_PARTY_APPS_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export { AUTHORIZE_CHALLENGE_PATH, FIRST_PARTY_APP_FIELD } from "./constants";
export { FIRST_PARTY_APPS_ERROR_CODES } from "./error-codes";
export { passwordStrategy } from "./strategies/password";
export type {
	FirstPartyAppsOptions,
	FirstPartyAuthInput,
	FirstPartyAuthResult,
	FirstPartyAuthSession,
	FirstPartyAuthSessionState,
	FirstPartyAuthStrategy,
	FirstPartyFailureBudget,
	FirstPartyStepUpRequirement,
} from "./types";
