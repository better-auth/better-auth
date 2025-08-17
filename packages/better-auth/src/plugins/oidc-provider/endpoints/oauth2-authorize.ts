import type { MakeOidcPlugin } from "../make-oidc-plugin";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import * as z from "zod/v4";
import { createAuthEndpoint } from "../../../api";
import { makeAuthorize } from "../make-authorize";

export const oAuth2authorize = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOidcPlugin,
) =>
	createAuthEndpoint(
		`/${makePluginOpts.pathPrefix}/authorize`,
		{
			method: "GET",
			query: z.record(z.string(), z.any()),
			metadata: {
				openapi: {
					description: "Authorize an OAuth2 request",
					responses: {
						"200": {
							description: "Authorization response generated successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										additionalProperties: true,
										description:
											"Authorization response, contents depend on the authorize function implementation",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const authorize = makeAuthorize(makePluginOpts);
			return authorize(ctx, options);
		},
	);
