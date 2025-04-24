import { z } from "zod";
import { APIError, sessionMiddleware } from "better-auth/api";
import { type BetterAuthPlugin, logger } from "better-auth";
import { createAuthEndpoint } from "better-auth/plugins";
import { setSessionCookie } from "better-auth/cookies";
import * as saml from "samlify";
import { SAMLConfigSchema, type SSOOptions, type SAMLConfig } from "./types";
import type { Session, User } from "../../better-auth/src";
import type { BindingContext } from "samlify/types/src/entity";
import type { FlowResult } from "samlify/types/src/flow";
export const ssoSAML = (options?: SSOOptions) => {
	return {
		id: "sso-saml",
		endpoints: {
			spMetadata: createAuthEndpoint(
				"/sso/saml2/sp/metadata",
				{
					method: "GET",
					query: z.object({
						providerId: z.string(),
						format: z.enum(["xml", "json"]).default("xml"),
					}),
					metadata: {
						openapi: {
							summary: "Get Service Provider metadata",
							description: "Returns the SAML metadata for the Service Provider",
							responses: {
								"200": {
									description: "SAML metadata in XML format",
								},
							},
						},
					},
				},
				async (ctx) => {
					const provider = await ctx.context.adapter.findOne<{
						samlConfig: string;
					}>({
						model: "ssoProvider",
						where: [
							{
								field: "providerId",
								value: ctx.query.providerId,
							},
						],
					});
					if (!provider) {
						throw new APIError("NOT_FOUND", {
							message: "No provider found for the given providerId",
						});
					}

					const parsedSamlConfig = JSON.parse(provider.samlConfig);
					const sp = saml.ServiceProvider({
						metadata: parsedSamlConfig.spMetadata.metadata,
					});
					return new Response(sp.getMetadata(), {
						headers: {
							"Content-Type": "application/xml",
						},
					});
				},
			),
			createSAMLProvider: createAuthEndpoint(
				"/sso/saml2/register",
				{
					method: "POST",
					body: SAMLConfigSchema,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Register a SAML provider",
							description: "This endpoint is used to register a SAML provider.",
							responses: {
								"200": {
									description: "The created provider",
								},
							},
						},
					},
				},
				async (ctx) => {
					const body = ctx.body;
					const provider = await ctx.context.adapter.create({
						model: "ssoProvider",
						data: {
							issuer: body.issuer,
							samlConfig: JSON.stringify(body),
							providerId: body.providerId,
						},
					});
					return ctx.json({
						...provider,
						samlConfig: JSON.parse(provider.samlConfig) as SAMLConfig,
					});
				},
			),

			signInSSOSAML: createAuthEndpoint(
				"/sso/saml2/sign-in",
				{
					method: "POST",
					body: z.object({
						providerId: z.string(),
						callbackURL: z.string(),
					}),
					metadata: {
						openapi: {
							summary: "Sign in with SAML provider",
							description:
								"This endpoint is used to sign in with a SAML provider.",
							responses: {
								"200": {
									description: "The SAML login URL",
								},
							},
						},
					},
				},
				async (ctx) => {
					const { providerId, callbackURL } = ctx.body;
					const provider = await ctx.context.adapter.findOne<{
						samlConfig: string;
					}>({
						model: "ssoProvider",
						where: [
							{
								field: "providerId",
								value: providerId,
							},
						],
					});

					if (!provider) {
						throw new APIError("NOT_FOUND", {
							message: "No provider found for the given providerId",
						});
					}

					const parsedSamlConfig = JSON.parse(provider.samlConfig);
					const sp = saml.ServiceProvider({
						metadata: parsedSamlConfig.spMetadata.metadata,
						allowCreate: true,
						loginRequestTemplate: {
							context:
								'<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{ID}" Version="2.0" IssueInstant="{IssueInstant}" Destination="{Destination}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" AssertionConsumerServiceURL="{AssertionConsumerServiceURL}"><saml:Issuer>{Issuer}</saml:Issuer><samlp:NameIDPolicy Format="{NameIDFormat}" AllowCreate="{AllowCreate}"/></samlp:AuthnRequest>',
						},
					});
					const idp = saml.IdentityProvider({
						metadata: parsedSamlConfig.idpMetadata.metadata,
					});

					const loginRequest = sp.createLoginRequest(
						idp,
						"post",
					) as BindingContext & { entityEndpoint: string; type: string };
					const { samlContent, extract } = await idp.parseLoginRequest(
						sp,
						"post",
						{
							body: {
								SAMLRequest: loginRequest.context,
							},
						},
					);
					if (!samlContent) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid SAML request",
						});
					}
					const responseResult = await fetch(loginRequest.entityEndpoint);
					const responseResultValues = await responseResult.json();
					return ctx.json({
						url: responseResultValues.entityEndpoint,
						samlResponse: responseResultValues.samlResponse,
					});
				},
			),
			callbackSSOSAML: createAuthEndpoint(
				"/sso/saml2/callback/:providerId",
				{
					method: "POST",
					body: z.object({
						SAMLResponse: z.string(),
						RelayState: z.string().optional(),
					}),
					metadata: {
						isAction: false,
						openapi: {
							summary: "Callback URL for SAML provider",
							description:
								"This endpoint is used as the callback URL for SAML providers.",
							responses: {
								"302": {
									description: "Redirects to the callback URL",
								},
								"400": {
									description: "Invalid SAML response",
								},
								"401": {
									description: "Unauthorized - SAML authentication failed",
								},
							},
						},
					},
				},
				async (ctx) => {
					const { SAMLResponse, RelayState } = ctx.body;
					const { providerId } = ctx.params;
					const provider = await ctx.context.adapter.findOne<{
						samlConfig: string;
					}>({
						model: "ssoProvider",
						where: [{ field: "providerId", value: providerId }],
					});

					if (!provider) {
						throw new APIError("NOT_FOUND", {
							message: "No provider found for the given providerId",
						});
					}

					const parsedSamlConfig = JSON.parse(provider.samlConfig);

					const idp = saml.IdentityProvider({
						metadata: parsedSamlConfig.idpMetadata.metadata,
					});
					const sp = saml.ServiceProvider({
						metadata: parsedSamlConfig.spMetadata.metadata,
					});

					let parsedResponse: FlowResult;
					try {
						parsedResponse = await sp.parseLoginResponse(idp, "post", {
							body: { SAMLResponse, RelayState },
						});

						if (!parsedResponse) {
							throw new Error("Empty SAML response");
						}
					} catch (error) {
						logger.error("SAML response validation failed", error);
						throw new APIError("BAD_REQUEST", {
							message: "Invalid SAML response",
							details: error instanceof Error ? error.message : String(error),
						});
					}
					const { extract } = parsedResponse;
					const userInfo = {
						id: parsedResponse.extract.nameID,
						email:
							parsedResponse.extract.attributes?.email ||
							parsedResponse.extract.nameID,
						name:
							[
								parsedResponse.extract.attributes?.givenName,
								parsedResponse.extract.attributes?.surname,
							]
								.filter(Boolean)
								.join(" ") || parsedResponse.extract.attributes?.displayName,
						attributes: parsedResponse.extract.attributes,
					};
					const sessionRefs = extract.sessionToken;
					let user: User;
					const userExsists = await ctx.context.adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: "email",
								value: userInfo.email,
							},
						],
					});
					if (userExsists) {
						user = userExsists;
					} else {
						user = await ctx.context.adapter.create({
							model: "user",
							data: {
								email: userInfo.email,
								name: userInfo.name,
								emailVerified: true,
							},
						});
					}
					let session: Session =
						await ctx.context.internalAdapter.createSession(
							user.id,
							ctx.request,
						);
					await setSessionCookie(ctx, { session, user });
					return ctx.json({
						redirect: true,
						url: RelayState || `${parsedSamlConfig.issuer}/dashboard`,
					});
				},
			),
		},
		schema: {
			ssoProvider: {
				fields: {
					issuer: {
						type: "string",
						required: true,
					},
					samlConfig: {
						type: "string",
						required: true,
					},
					providerId: {
						type: "string",
						required: true,
						unique: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
