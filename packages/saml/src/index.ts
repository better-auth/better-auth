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
        },
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
            metadata:parsedSamlConfig.spMetadata,
          });
          const samlClient = saml.IdentityProvider({
            metadata: parsedSamlConfig.idpMetadata,
            ...parsedSamlConfig
          });
          const loginRequest = await samlSp.createLoginRequest(samlClient , "redirect");
          return ctx.json({
            url: loginRequest.context,
            redirect: true,
          });
        },
      ),

      callbackSSOSAML: createAuthEndpoint(
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
            metadata: parsedSamlConfig.idpMetadata
          });
          const samlSp = saml.ServiceProvider({
            metadata:parsedSamlConfig.spMetadata,
          });
          const parsedResponse = await samlSp.parseLoginResponse(
            samlClient, 
            "redirect",
            ctx.request
          );
          console.log({parsedResponse})
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
