import { z } from "zod";
import { createAuthEndpoint, type BetterAuthPlugin } from "..";
import { sessionMiddleware } from "../../api";
import { generateRandomString } from "../../crypto";
import type { GenericEndpointContext, Session, User } from "../../types";

interface OneTimeTokenOptions {
	/**
	 * Expires in minutes
	 *
	 * @default 3
	 */
	expiresIn?: number;
	/**
	 * Only allow server initiated requests
	 */
	disableClientRequest?: boolean;
	/**
	 * Generate a custom token
	 */
	generateToken?: (
		session: {
			user: User & Record<string, any>;
			session: Session & Record<string, any>;
		},
		ctx: GenericEndpointContext,
	) => Promise<string>;
}

export const oneTimeToken = (options?: OneTimeTokenOptions) => {
	return {
		id: "one-time-token",
		endpoints: {
			generateOneTimeToken: createAuthEndpoint(
				"/one-time-token/generate",
				{
					method: "GET",
					use: [sessionMiddleware],
				},
				async (c) => {
					//if request exist, it means it's a client request
					if (options?.disableClientRequest && c.request) {
						throw c.error("BAD_REQUEST", {
							message: "Client requests are disabled",
						});
					}
					const session = c.context.session;
					const token = options?.generateToken
						? await options.generateToken(session, c)
						: generateRandomString(32);
					const expiresAt = new Date(
						Date.now() + (options?.expiresIn ?? 3) * 60 * 1000,
					);
					await c.context.internalAdapter.createVerificationValue({
						value: session.session.token,
						identifier: `one-time-token:${token}`,
						expiresAt,
					});
					return c.json({ token });
				},
			),
			verifyOneTimeToken: createAuthEndpoint(
				"/one-time-token/verify",
				{
					method: "POST",
					body: z.object({
						token: z.string(),
					}),
				},
				async (c) => {
					const { token } = c.body;
					const verificationValue =
						await c.context.internalAdapter.findVerificationValue(
							`one-time-token:${token}`,
						);
					if (!verificationValue) {
						throw c.error("BAD_REQUEST", {
							message: "Invalid token",
						});
					}
					if (verificationValue.expiresAt < new Date()) {
						await c.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw c.error("BAD_REQUEST", {
							message: "Token expired",
						});
					}
					await c.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const session = await c.context.internalAdapter.findSession(
						verificationValue.value,
					);
					if (!session) {
						throw c.error("BAD_REQUEST", {
							message: "Session not found",
						});
					}
					return c.json(session);
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
