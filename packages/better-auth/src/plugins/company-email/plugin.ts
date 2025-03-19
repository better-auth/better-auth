import type { BetterAuthPlugin } from "../../types";
import { APIError } from "../../api";
import { generateRandomString } from "../../crypto";
import { createAuthEndpoint } from "../../plugins";
import { z } from "zod";

import CompanyEmailValidator from "./company-email-validator";

import {
  checkCompanyEmailMetadata,
  sendEmailVerificationMetadata,
  verifyEmailMetadata,
} from "./metadata";
import type { CompanyEmailOptions } from "./types";

/**
 * Plugin for company email verification
 * @param options Options for the verification plugin
 * @returns Plugin for company email verification
 */
export const companyEmail = (
  {
    expiresIn = 60 * 60 * 24,
    disableCleanup = false,
    allowedEmails = [],
    generateToken = () => generateRandomString(32),
    storeCookieAfterVerification = {
      enabled: false,
      cookieName: "temp-verification",
      expires: 60 * 60 * 24,
    },
    sendEmailVerification,
  }: CompanyEmailOptions = {} as CompanyEmailOptions
) =>
  ({
    id: "company-email",
    endpoints: {
      sendEmailVerification: createAuthEndpoint(
        "/company-email/send-verification-email",
        {
          method: "POST",
          metadata: sendEmailVerificationMetadata,
          body: z.object({
            email: z.string({ message: "Email is required" }).email({
              message: "Invalid email",
            }),
            callbackUrl: z
              .string({
                message: "Invalid callback URL",
                description: "Callback URL after email verification",
              })
              .url({ message: "Invalid callback URL" })
              .optional(),
          }),
        },
        async (ctx) => {
          try {
            const { email, callbackUrl } = ctx.body;

            const isCompanyEmail = CompanyEmailValidator.isCompanyEmail(email);

            if (!isCompanyEmail && !allowedEmails.includes(email)) {
              throw new APIError("BAD_REQUEST", {
                message: "Email is not a company email",
              });
            }

            const token = await generateToken();

            await ctx.context.adapter.delete({
              model: "verification",
              where: [
                {
                  field: "value",
                  operator: "eq",
                  value: email,
                },
              ],
            });

            await ctx.context.internalAdapter.createVerificationValue({
              identifier: token,
              value: email,
              expiresAt: new Date(new Date().setSeconds(expiresIn)),
            });

            await sendEmailVerification({
              email,
              url: callbackUrl || ctx.context.baseURL,
              token,
            });

            return { success: true };
          } catch (error) {
            if (error instanceof APIError) {
              throw error;
            }

            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to send verification email",
            });
          }
        }
      ),
      verifyEmailVerification: createAuthEndpoint(
        "/company-email/verify-email",
        {
          method: "GET",
          metadata: verifyEmailMetadata,
          query: z.object({
            token: z.string({
              message: "Invalid token",
              description: "Token to verify email",
            }),
            redirectTo: z
              .string({ message: "Invalid redirect path" })
              .optional(),
          }),
        },
        async (ctx) => {
          try {
            const { token, redirectTo } = ctx.query;

            const verification =
              await ctx.context.internalAdapter.findVerificationValue(token);

            if (!verification || verification.expiresAt < new Date()) {
              throw new APIError("BAD_REQUEST", {
                message: "Invalid or expired verification token",
              });
            }

            if (storeCookieAfterVerification.enabled) {
              const generatedToken = await generateToken();
              await ctx.context.internalAdapter.createVerificationValue({
                identifier: generatedToken,
                value: verification.value,
                expiresAt: new Date(new Date().setHours(24)),
              });

              ctx.setCookie(
                storeCookieAfterVerification.cookieName || "temp-verification",
                generatedToken,
                {
                  httpOnly: true,
                  secure: true,
                  sameSite: "strict",
                  path: "/",
                  expires: new Date(new Date().setHours(24)), // 1 day
                }
              );
            }

            if (!disableCleanup) {
              await ctx.context.internalAdapter.deleteVerificationValue(
                verification.id
              );
            }

            if (redirectTo) {
              ctx.redirect(redirectTo);
            }

            return { success: true };
          } catch (error) {
            if (error instanceof APIError) {
              throw error;
            }

            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to verify email",
            });
          }
        }
      ),
      checkCompanyEmail: createAuthEndpoint(
        "/company-email/check",
        {
          method: "POST",
          metadata: checkCompanyEmailMetadata,
        },
        async (ctx) => {
          const { email } = ctx.body;

          const isCompanyEmail = CompanyEmailValidator.isCompanyEmail(email);

          if (!isCompanyEmail) {
            throw new APIError("BAD_REQUEST", {
              message: "Email is not a company email",
            });
          }

          return { success: true };
        }
      ),
    },
  } satisfies BetterAuthPlugin);
