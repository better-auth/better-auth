import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "better-auth/db";
import { createAtprotoEndpoints } from "./routes";
import { schema } from "./schema";
import { createSessionStore, createStateStore } from "./stores";
import type { AtprotoAuthOptions } from "./types";
import { isLocalhost, resolveBaseURL } from "./utils";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		atproto: {
			creator: typeof atproto;
		};
	}
}

export type {
	AtprotoAuthOptions,
	AtprotoProfile,
	AtprotoUserFields,
} from "./types";

export const atproto = (options: AtprotoAuthOptions = {}): BetterAuthPlugin => {
	let oauthClient: NodeOAuthClient | undefined;
	const getClient = (): NodeOAuthClient => {
		if (!oauthClient) {
			throw new Error(
				"[atproto] OAuth client not initialized — was the plugin registered before use?",
			);
		}
		return oauthClient;
	};

	return {
		id: "atproto",
		version: PACKAGE_VERSION,
		schema: mergeSchema(schema, options.schema),

		rateLimit: [
			{
				pathMatcher: (path) => path === "/atproto/sign-in",
				window: 60,
				max: 5,
			},
			{
				pathMatcher: (path) => path === "/atproto/callback",
				window: 60,
				max: 10,
			},
		],

		init: async (ctx) => {
			const baseURL = resolveBaseURL(ctx.options.baseURL);
			const basePath = ctx.options.basePath || "/api/auth";
			const prefix = `${baseURL}${basePath}`;
			const isLocal = isLocalhost(baseURL);
			const scope =
				options.clientMetadata?.scope || "atproto transition:generic";

			// RFC 8252: loopback redirect URIs must use 127.0.0.1, not "localhost".
			const port = new URL(baseURL).port ? `:${new URL(baseURL).port}` : "";
			const redirectUri = isLocal
				? `http://127.0.0.1${port}${basePath}/atproto/callback`
				: `${prefix}/atproto/callback`;

			if (!isLocal && !options.privateKey) {
				throw new Error(
					"[atproto] privateKey is required for non-localhost deployments. " +
						"Generate one with: openssl ecparam -name prime256v1 -genkey -noout",
				);
			}

			const keyset = options.privateKey
				? [await JoseKey.fromImportable(options.privateKey, "atproto-key")]
				: [];

			const clientId = isLocal
				? `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`
				: `${prefix}/atproto/client-metadata.json`;

			const { adapter } = ctx;
			const stateStore = createStateStore(adapter as any);
			const sessionStore = createSessionStore(adapter as any);

			oauthClient = new NodeOAuthClient({
				clientMetadata: {
					client_id: clientId,
					client_name: options.clientMetadata?.clientName || "Better Auth",
					redirect_uris: [redirectUri],
					grant_types: ["authorization_code", "refresh_token"],
					scope,
					response_types: ["code"],
					application_type: isLocal ? "native" : "web",
					token_endpoint_auth_method: isLocal ? "none" : "private_key_jwt",
					dpop_bound_access_tokens: true,
					...(isLocal
						? {}
						: {
								token_endpoint_auth_signing_alg: "ES256",
								jwks_uri: `${prefix}/atproto/jwks.json`,
							}),
				},
				keyset,
				stateStore,
				sessionStore,
			});
		},

		endpoints: createAtprotoEndpoints(getClient, options),
	};
};
