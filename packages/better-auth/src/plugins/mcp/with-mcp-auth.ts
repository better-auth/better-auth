import type { BetterAuthOptions } from "../../types";
import { logger } from "../../utils";
import { isProduction } from "../../utils/env";
import { getBaseURL } from "../../utils/url";
import type { OAuthAccessToken } from "../oidc/types";

export const withMcpAuth = <
	Auth extends {
		api: {
			getMcpSession: (...args: any) => Promise<OAuthAccessToken | null>;
		};
		options: BetterAuthOptions;
	},
>(
	auth: Auth,
	handler: (
		req: Request,
		sesssion: OAuthAccessToken,
	) => Response | Promise<Response>,
) => {
	return async (req: Request) => {
		const baseURL = getBaseURL(auth.options.baseURL, auth.options.basePath);
		if (!baseURL && !isProduction) {
			logger.warn("Unable to get the baseURL, please check your config!");
		}
		const session = await auth.api.getMcpSession({
			headers: req.headers,
		});
		const wwwAuthenticateValue = `Bearer resource_metadata=${baseURL}/api/auth/.well-known/oauth-authorization-server`;
		if (!session) {
			return Response.json(
				{
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Unauthorized: Authentication required",
						"www-authenticate": wwwAuthenticateValue,
					},
					id: null,
				},
				{
					status: 401,
					headers: {
						"WWW-Authenticate": wwwAuthenticateValue,
					},
				},
			);
		}
		return handler(req, session);
	};
};
