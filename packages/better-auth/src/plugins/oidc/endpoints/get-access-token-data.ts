import type { MakeOIDCPlugin } from "../index";
import type { OAuthAccessToken } from "../types";

import { modelName } from "../schema";
import { createAuthEndpoint } from "../../../api";

export const getAccessTokenData = (makePluginOpts: MakeOIDCPlugin) =>
	createAuthEndpoint(
		`/${makePluginOpts.pathPrefix}/get-access-token-data`,
		{
			method: "GET",
			requireHeaders: true,
		},
		async (c) => {
			const accessToken = c.headers
				?.get("Authorization")
				?.replace("Bearer ", "");
			if (!accessToken) {
				c.headers?.set("WWW-Authenticate", "Bearer");
				return c.json(null);
			}
			const accessTokenData = await c.context.adapter.findOne<OAuthAccessToken>(
				{
					model: modelName.oauthAccessToken,
					where: [
						{
							field: "accessToken",
							value: accessToken,
						},
					],
				},
			);
			if (!accessTokenData) {
				return c.json(null);
			}
			return c.json(accessTokenData);
		},
	);
