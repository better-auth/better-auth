import { createAuthEndpoint } from "better-auth/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { ElectronOptions } from "./types";
import * as z from "zod";
import { ELECTRON_ERROR_CODES } from "./error-codes";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { setSessionCookie } from "better-auth/cookies";
import type { User } from "better-auth/db";
import { parseUserOutput } from "better-auth/db";
import { betterFetch } from "@better-fetch/fetch";
import { SocialProviderListEnum } from "@better-auth/core/social-providers";

export const electronTokenBodySchema = z.object({
  token: z.string().nonempty(),
  state: z.string().nonempty(),
  code_verifier: z.string().nonempty(),
});

export const electronToken = (opts: ElectronOptions) =>
  createAuthEndpoint(
    "/electron/token",
    {
      method: "POST",
      body: electronTokenBodySchema,
      metadata: {
        scope: "http",
      },
    },
    async (ctx) => {
      const token = await ctx.context.internalAdapter.findVerificationValue(
        `electron:${ctx.body.token}`,
      );
      if (!token || token.expiresAt < new Date()) {
        throw APIError.from("NOT_FOUND", ELECTRON_ERROR_CODES.INVALID_TOKEN);
      }

      const tokenRecord = safeJSONParse<Record<string, any>>(token.value);
      if (!tokenRecord) {
        throw APIError.from(
          "INTERNAL_SERVER_ERROR",
          ELECTRON_ERROR_CODES.INVALID_TOKEN,
        );
      }

      if (tokenRecord.state !== ctx.body.state) {
        throw APIError.from("BAD_REQUEST", ELECTRON_ERROR_CODES.STATE_MISMATCH);
      }

      if (!tokenRecord.codeChallenge) {
        throw APIError.from(
          "BAD_REQUEST",
          ELECTRON_ERROR_CODES.MISSING_CODE_CHALLENGE,
        );
      }
      if (tokenRecord.codeChallengeMethod === "s256") {
        const codeChallenge = Buffer.from(
          base64Url.decode(tokenRecord.codeChallenge),
        );
        const codeVerifier = Buffer.from(
          await createHash("SHA-256").digest(ctx.body.code_verifier),
        );

        if (
          codeChallenge.length !== codeVerifier.length ||
          !timingSafeEqual(codeChallenge, codeVerifier)
        ) {
          throw APIError.from(
            "BAD_REQUEST",
            ELECTRON_ERROR_CODES.INVALID_CODE_VERIFIER,
          );
        }
      } else {
        if (tokenRecord.codeChallenge !== ctx.body.code_verifier) {
          throw APIError.from(
            "BAD_REQUEST",
            ELECTRON_ERROR_CODES.INVALID_CODE_VERIFIER,
          );
        }
      }
      await ctx.context.internalAdapter.deleteVerificationValue(token.id);

      const user = await ctx.context.internalAdapter.findUserById(
        tokenRecord.userId,
      );
      if (!user) {
        throw APIError.from(
          "INTERNAL_SERVER_ERROR",
          BASE_ERROR_CODES.USER_NOT_FOUND,
        );
      }

      const session = await ctx.context.internalAdapter.createSession(user.id);
      if (!session) {
        throw APIError.from(
          "INTERNAL_SERVER_ERROR",
          BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
        );
      }

      await setSessionCookie(ctx, {
        session,
        user,
      });

      return ctx.json({
        token: session.token,
        user: parseUserOutput(ctx.context.options, user) as User &
          Record<string, any>,
      });
    },
  );

export const electronInitOAuthProxyQuerySchema = z.object({
  provider: z.string().nonempty(),
  state: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string().optional(),
});

export const electronInitOAuthProxy = (opts: ElectronOptions) =>
  createAuthEndpoint(
    "/electron/init-oauth-proxy",
    {
      method: "GET",
      query: electronInitOAuthProxyQuerySchema,
      metadata: {
        scope: "http",
      },
    },
    async (ctx) => {
      const isSocialProvider = SocialProviderListEnum.safeParse(
        ctx.query.provider,
      );
      if (!isSocialProvider && !ctx.context.getPlugin("generic-oauth")) {
        throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PROVIDER_NOT_FOUND);
      }

      const headers = new Headers(ctx.request?.headers);
      headers.set("origin", new URL(ctx.context.baseURL).origin);
      let setCookie: string | null = null;
      const searchParams = new URLSearchParams();
      searchParams.set("client_id", opts.clientID || "electron");
      searchParams.set("code_challenge", ctx.query.code_challenge);
      searchParams.set(
        "code_challenge_method",
        ctx.query.code_challenge_method || "plain",
      );
      searchParams.set("state", ctx.query.state);
      const res = await betterFetch<{
        url: string | undefined;
        redirect: boolean;
        user?: User & Record<string, any>;
        token?: string;
      }>(
        `${isSocialProvider ? "/sign-in/social" : "/sign-in/oauth2"}?${searchParams.toString()}`,
        {
          baseURL: ctx.context.baseURL,
          method: "POST",
          body: {
            provider: ctx.query.provider,
            disableRedirect: true,
          },
          onResponse: (ctx) => {
            const headers = ctx.response.headers;
            setCookie = headers.get("set-cookie") ?? null;
          },
          headers,
        },
      );

      if (res.error) {
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message: res.error.message || "An unknown error occurred.",
        });
      }

      if (setCookie) {
        ctx.setHeader("set-cookie", setCookie);
      }
      if (res.data.url) {
        ctx.setHeader("Location", res.data.url);
        ctx.setStatus(302);
        return;
      }
      return ctx.json(res.data);
    },
  );
