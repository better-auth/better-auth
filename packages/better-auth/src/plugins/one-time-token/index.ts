import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { sessionMiddleware } from "../../api";
import { generateRandomString } from "../../crypto";
import type { Session, User } from "../../types";
import { defaultKeyHasher } from "./utils";

export interface OneTimeTokenOptions {
	/**
	 * Expires in minutes
	 *
	 * @default 3
	 */
	expiresIn?: number | undefined;
	/**
	 * Only allow server initiated requests
	 */
	disableClientRequest?: boolean | undefined;
	/**
	 * Generate a custom token
	 */
	generateToken?:
		| ((
				session: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
				},
				ctx: GenericEndpointContext,
		  ) => Promise<string>)
		| undefined;
	/**
	 * This option allows you to configure how the token is stored in your database.
	 * Note: This will not affect the token that's sent, it will only affect the token stored in your database.
	 *
	 * @default "plain"
	 */
	storeToken?:
		| (
				| "plain"
				| "hashed"
				| { type: "custom-hasher"; hash: (token: string) => Promise<string> }
		  )
		| undefined;
}

const verifyOneTimeTokenBodySchema = z.object({
	token: z.string().meta({
		description: 'The token to verify. Eg: "some-token"',
	}),
});

export const oneTimeToken = (options?: OneTimeTokenOptions | undefined) => {
	const opts = {
		storeToken: "plain",
		...options,
	} satisfies OneTimeTokenOptions;

	async function storeToken(ctx: GenericEndpointContext, token: string) {
		if (opts.storeToken === "hashed") {
			return await defaultKeyHasher(token);
		}
		if (
			typeof opts.storeToken === "object" &&
			"type" in opts.storeToken &&
			opts.storeToken.type === "custom-hasher"
		) {
			return await opts.storeToken.hash(token);
		}

		return token;
	}

	return {
		id: "one-time-token",
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * GET `/one-time-token/generate`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.generateOneTimeToken`
			 *
			 * **client:**
			 * `authClient.oneTimeToken.generate`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/one-time-token#api-method-one-time-token-generate)
			 */
			generateOneTimeToken: createAuthEndpoint(
				"/one-time-token/generate",
				{
					method: "GET",
					use: [sessionMiddleware],
				},
				async (c) => {
					//if request exist, it means it's a client request
					if (opts?.disableClientRequest && c.request) {
						throw c.error("BAD_REQUEST", {
							message: "Client requests are disabled",
						});
					}
					const session = c.context.session;
					const token = opts?.generateToken
						? await opts.generateToken(session, c)
						: generateRandomString(32);
					const expiresAt = new Date(
						Date.now() + (opts?.expiresIn ?? 3) * 60 * 1000,
					);
					const storedToken = await storeToken(c, token);
					await c.context.internalAdapter.createVerificationValue({
						value: session.session.token,
						identifier: `one-time-token:${storedToken}`,
						expiresAt,
					});
					return c.json({ token });
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/one-time-token/verify`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyOneTimeToken`
			 *
			 * **client:**
			 * `authClient.oneTimeToken.verify`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/one-time-token#api-method-one-time-token-verify)
			 */
			verifyOneTimeToken: createAuthEndpoint(
				"/one-time-token/verify",
				{
					method: "POST",
					body: verifyOneTimeTokenBodySchema,
				},
				async (c) => {
					const { token } = c.body;
					const storedToken = await storeToken(c, token);
					const verificationValue =
						await c.context.internalAdapter.findVerificationValue(
							`one-time-token:${storedToken}`,
						);
					if (!verificationValue) {
						throw c.error("BAD_REQUEST", {
							message: "Invalid token",
						});
					}
					await c.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					if (verificationValue.expiresAt < new Date()) {
						throw c.error("BAD_REQUEST", {
							message: "Token expired",
						});
					}
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
