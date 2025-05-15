//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const verifyOneTimeToken=createAuthEndpoint(
	"/one-time-token/verify",
	{
		method: "POST",
		body: z.object({
			token: z.string({
				description:
					'The token to verify. Eg: "some-token"',
			}),
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
)