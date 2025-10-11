import type { oauthProvider } from "./oauth";
import type { BetterAuthClientPlugin } from "../../types";
import { verifyAccessToken } from "./verify";
import type { JWTPayload, JWTVerifyOptions } from "jose";
import { handleMcpErrors } from "./mcp";
import type { Auth } from "../../auth";
import { getJwtPlugin, getOAuthProviderPlugin } from "./utils";

export const oauthProviderClient = () => {
	return {
		id: "oauth-provider-client",
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
		getActions() {
			return {
				verifyAccessToken: _verifyAccessToken,
			};
		},
	} satisfies BetterAuthClientPlugin;
};

interface VerifyAccessTokenRemote {
	/** Full url of the introspect endpoint. Should end with `/oauth2/introspect` */
	introspectUrl: string;
	/** Client Secret */
	clientId: string;
	/** Client Secret */
	clientSecret: string;
	/**
	 * Forces remote verification of a token.
	 * This ensures attached session (if applicable)
	 * is also still active.
	 */
	force?: boolean;
}

// Without auth available
async function _verifyAccessToken(
	token: string,
	opts: {
		verifyOptions: JWTVerifyOptions &
			Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
		scopes?: string[];
		jwksUrl?: string;
		remoteVerify?: VerifyAccessTokenRemote;
	},
): Promise<JWTPayload>;
// With auth available
async function _verifyAccessToken(
	token: string,
	opts:
		| {
				verifyOptions?: JWTVerifyOptions;
				scopes?: string[];
				jwksUrl?: string;
				remoteVerify?: Omit<VerifyAccessTokenRemote, "introspectUrl"> &
					Partial<Pick<VerifyAccessTokenRemote, "introspectUrl">>;
		  }
		| undefined,
	auth: Auth,
): Promise<JWTPayload>;

async function _verifyAccessToken(
	token: string,
	opts?: {
		/** Verify options */
		verifyOptions?: JWTVerifyOptions;
		/** Scopes to additionally verify. Token must include all but not exact. */
		scopes?: string[];
		/** Required to verify access token locally */
		jwksUrl?: string;
		/** If provided, can verify a token remotely */
		remoteVerify?: Omit<VerifyAccessTokenRemote, "introspectUrl"> &
			Partial<Pick<VerifyAccessTokenRemote, "introspectUrl">>;
	},
	auth?: Auth,
) {
	const oauthProvider = auth ? getOAuthProviderPlugin(auth) : undefined;
	const oauthProviderOptions = oauthProvider?.options;
	const jwtPlugin =
		auth && !oauthProviderOptions?.disableJwtPlugin
			? getJwtPlugin(auth)
			: undefined;
	const jwtPluginOptions = jwtPlugin?.options;
	const authServerBaseUrl = auth?.options.baseURL;
	const authServerBasePath = auth?.options.basePath;

	const audience =
		opts?.verifyOptions?.audience ??
		jwtPluginOptions?.jwt?.audience ??
		authServerBaseUrl;
	const issuer =
		opts?.verifyOptions?.issuer ??
		jwtPluginOptions?.jwt?.issuer ??
		authServerBaseUrl;
	if (!audience) {
		throw Error("please define opts.verifyOptions.audience");
	}
	if (!issuer) {
		throw Error("please define opts.verifyOptions.issuer");
	}

	const jwksUrl =
		opts?.jwksUrl ??
		jwtPluginOptions?.jwks?.remoteUrl ??
		(authServerBaseUrl
			? `${authServerBaseUrl + (authServerBasePath ?? "")}/jwks`
			: undefined);
	const introspectUrl =
		opts?.remoteVerify?.introspectUrl ??
		(authServerBaseUrl
			? `${authServerBaseUrl}${authServerBasePath ?? ""}/oauth2/introspect`
			: undefined);

	try {
		return await verifyAccessToken(token, {
			...opts,
			jwksUrl,
			verifyOptions: {
				...opts?.verifyOptions,
				audience,
				issuer,
			},
			remoteVerify:
				opts?.remoteVerify && introspectUrl
					? {
							introspectUrl,
							...opts.remoteVerify,
						}
					: undefined,
		});
	} catch (error) {
		handleMcpErrors(error, audience);
	}
}
