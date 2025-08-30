import type { OIDCOptions } from "./types";
import type { InferOptionSchema } from "..";

import { schema } from "./schema";
import { mergeSchema } from "../../db";
import { consentHook } from "./hooks/consent-hook";
import { oAuth2Token } from "./endpoints/oauth2-token";
import { oAuth2Client } from "./endpoints/oauth2-client";
import { oAuth2Consent } from "./endpoints/oauth2-consent";
import { oAuth2Register } from "./endpoints/oauth2-register";
import { oAuth2UserInfo } from "./endpoints/oauth2-user-info";
import { oAuth2Authorize } from "./endpoints/oauth2-authorize";
import { resolveOIDCOptions } from "./utils/resolve-oidc-options";
import { oAuth2OpenIdConfig } from "./endpoints/oauth2-openid-config";
import { oAuth2AccessTokenData } from "./endpoints/oauth2-access-token-data";

export type MakeOIDCPlugin = {
	pathPrefix: string;
	disableCors: boolean;
	alwaysSkipConsent: boolean;
	schema?: InferOptionSchema<typeof schema>;
};

export const makeOIDCPlugin = (
	makePluginOpts: MakeOIDCPlugin,
	options: OIDCOptions,
) => {
	const resolved = resolveOIDCOptions(options);

	const mergedSchema = mergeSchema(schema, makePluginOpts.schema);

	return {
		schema: mergeSchema(mergedSchema, options.schema),
		consentHook: consentHook(resolved, makePluginOpts),
		oAuth2Token: oAuth2Token(resolved, makePluginOpts),
		oAuth2Client: oAuth2Client(resolved, makePluginOpts),
		oAuth2Consent: oAuth2Consent(resolved, makePluginOpts),
		oAuth2UserInfo: oAuth2UserInfo(resolved, makePluginOpts),
		oAuth2Register: oAuth2Register(resolved, makePluginOpts),
		oAuth2Authorize: oAuth2Authorize(resolved, makePluginOpts),
		oAuth2OpenIdConfig: oAuth2OpenIdConfig(resolved, makePluginOpts),

		oAuth2AccessTokenData: oAuth2AccessTokenData(makePluginOpts),
	};
};

export const makeMetadataEndpoint =
	(fn: () => Promise<any>) => async (_: Request) => {
		const res = await fn();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	};
