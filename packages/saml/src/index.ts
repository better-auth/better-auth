import { z } from "zod";
import { APIError, sessionMiddleware } from "better-auth/api";
import {
  type GenericEndpointContext,
  type BetterAuthPlugin,
  logger,
} from "better-auth";

import { createAuthEndpoint, createAuthMiddleware } from "better-auth/plugins";
import { betterFetch, BetterFetchError } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { setSessionCookie } from "better-auth/cookies";
import * as saml from "samlify";
import {
  SAMLConfigSchema,
  type SSOOptions,
  type SSOProvider,
  type SAMLAssertion,
  type SAMLConfig,
} from "./types";
import { parseIsolatedEntityName } from "typescript";
import { w } from "../../better-auth/dist/shared/better-auth.QJMYV_xr.mjs";

export const ssoSAML = (options?: SSOOptions) => {
  return {
    id: "sso-saml",
    endpoints: {
      idpMetadata: createAuthEndpoint(
        "/sso/saml2/idp/metadata",
        {
          method: "GET",
          query: z.object({
            providerId: z.string(),
            format: z.enum(["xml", "json"]).default("xml"),
          }),
          metadata: {
            openapi: {
              summary: "Get Identity Provider metadata",
              description:
                "Returns the SAML metadata for the Identity Provider",
              responses: {
                "200": {
                  description: "SAML metadata in XML format",
                },
              },
            },
          },
        },
        async (ctx) => {
          const provider = await ctx.context.adapter.findOne<SSOProvider>({
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
          const idp = saml.IdentityProvider({
            metadata: parsedSamlConfig.idpMetadata.metadata,
          });
          return new Response(idp.getMetadata(), {
            headers: {
              "Content-Type": "application/xml",
            },
          });
        }
      ),
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
          console.log("From meta fetch: " , ctx) 
          const provider = await ctx.context.adapter.findOne<SSOProvider>({
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
        }
      ),
      createSAMLProvider: createAuthEndpoint(
        "/sso/register-saml",
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
              userId: ctx.context.session.user.id,
              providerId: body.providerId,
            },
          });
          return ctx.json({
            ...provider,
            samlConfig: JSON.parse(provider.samlConfig) as SAMLConfig,
          });
        }
      ),

      signInSSOSAML: createAuthEndpoint(
        "/sign-in/saml",
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
          const provider = await ctx.context.adapter.findOne<SSOProvider>({
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
          const samlSp = saml.ServiceProvider({
            metadata: parsedSamlConfig.spMetadata.metadata
          });
          const samlClient = saml.IdentityProvider({
            ...parsedSamlConfig.idpMetadata,
           });
          const loginRequest = await samlSp.createLoginRequest(
            samlClient,
            "redirect"
          );
          return ctx.json({
            url: loginRequest.context,
            redirect: true,
          });
        }
      ),
      callbackSSOSAML: createAuthEndpoint(
        "/sso/callback-saml/:providerId",
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

          const provider = await ctx.context.adapter.findOne<SSOProvider>({
            model: "ssoProvider",
            where: [{ field: "providerId", value: providerId }],
          });

          if (!provider) {
            throw new APIError("NOT_FOUND", {
              message: "No provider found for the given providerId",
            });
          }

          const parsedSamlConfig = JSON.parse(
            provider.samlConfig
          );
          const idp = saml.IdentityProvider({
            ...parsedSamlConfig,
            metadata: parsedSamlConfig.idpMetadata,
          });
          // const idp = saml.IdentityProvider({
          //   metadata: parsedSamlConfig,
          //   privateKey: parsedSamlConfig.privateKey,
          //   privateKeyPass: parsedSamlConfig.privateKeyPass,
          //   isAssertionEncrypted: parsedSamlConfig.isAssertionEncrypted,
          //   loginResponseTemplate: {
          //     context: parsedSamlConfig.loginResponseTemplate?.context,
          //     attributes: parsedSamlConfig.loginResponseTemplate?.attributes,
          //   },
          // });

          const sp = saml.ServiceProvider({
            metadata: parsedSamlConfig.spMetadata,
            entityID: parsedSamlConfig.issuer,
            authnRequestsSigned: parsedSamlConfig.authnRequestsSigned,
            wantAssertionsSigned: parsedSamlConfig.wantAssertionsSigned,
            wantMessageSigned: parsedSamlConfig.wantMessageSigned,
            signingCert: parsedSamlConfig.signingCert,
            privateKey: parsedSamlConfig.privateKey,
            encryptCert: parsedSamlConfig.encryptCert,
            assertionConsumerService: [
              {
                Binding: saml.Constants.namespace.post,
                Location: `${parsedSamlConfig.issuer}/sso/callback-saml/${providerId}`,
              },
            ],
          });

          // 3. Parse and validate the SAML response
          let parsedResponse: saml.LoginResponse;
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

          // 4. Extract user information
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

          // 5. Handle user provisioning
          let session, user;
          if (options?.provisionUser && false) {
            const provisionResult = await options.provisionUser({
              user: null, // No existing user
              userInfo,
              token: {
                nameID: parsedResponse.extract.nameID,
                sessionIndex: parsedResponse.extract.sessionIndex,
                attributes: parsedResponse.extract.attributes,
              },
              provider,
            });

            session = provisionResult.session;
            user = provisionResult.user;
          } else {
            // Fallback to default user creation if no provisionUser callback provided
            user = await ctx.context.adapter.create({
              model: "user",
              data: {
                email: userInfo.email,
                name: userInfo.name,
                emailVerified: true,
              },
            });

            session = await ctx.context.adapter.create({
              model: "session",
              data: {
                userId: user.id,
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
              },
            });
          }

          
          await setSessionCookie(ctx, { session, user });

          return ctx.redirect(
            RelayState || `${parsedSamlConfig.issuer}/dashboard`
          );
        }
      ),
      callbackSSOSAMLO: createAuthEndpoint(
        "/sso/callback-saml/:providerId",
        {
          method: "GET",
          body: z.object({
            SAMLResponse: z.string(),
            RelayState: z.string(),
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
              },
            },
          },
        },
        async (ctx) => {
          const { SAMLResponse, RelayState } = ctx.body;
          const provider = await ctx.context.adapter.findOne<SSOProvider>({
            model: "ssoProvider",
            where: [
              {
                field: "providerId",
                value: ctx.params.providerId,
              },
            ],
          });
          if (!provider) {
            throw new APIError("NOT_FOUND", {
              message: "No provider found for the given providerId",
            });
          }
          const parsedSamlConfig = JSON.parse(provider.samlConfig);

          const samlClient = saml.IdentityProvider({
            ...parsedSamlConfig,
            metadata: parsedSamlConfig.idpMetadata,
          });
          const samlSp = saml.ServiceProvider({
            metadata: parsedSamlConfig.spMetadata,
          });
          const parsedResponse = await samlSp.parseLoginResponse(
            samlClient,
            "redirect",
            ctx.request
          );
          console.log({ parsedResponse });
          if (!parsedResponse) {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid SAML response",
            });
          }

          const userInfo = {
            id: parsedResponse.nameID,
            email: parsedResponse.user.email,
            name: parsedResponse.user.name,
            image: parsedResponse.user.image,
            emailVerified: true,
          };

          const session = null;
          const user = null;
          if (options?.provisionUser) {
            await options.provisionUser({
              user,
              userInfo,
              token: {
                nameID: parsedResponse.nameID,
                sessionIndex: parsedResponse.sessionIndex,
                attributes: parsedResponse.user,
              },
              provider,
            });
          }

          await setSessionCookie(ctx, {
            session,
            user,
          });

          return ctx.redirect(RelayState);
        }
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
          userId: {
            type: "string",
            references: {
              model: "user",
              field: "id",
            },
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
