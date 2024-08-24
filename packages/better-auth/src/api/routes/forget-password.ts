import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { createJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";

export const forgetPassword = createAuthEndpoint(
	"/send-forget-password",
	{
		method: "POST",
		body: z.object({
			email: z.string().email(),
		}),
	},
	async (ctx) => {
		const { email } = ctx.body;
		const user = await ctx.context.internalAdapter.findUserByEmail(email);
		if (!user) {
			return ctx.json(
				{
					error: "User not found",
				},
				{
					status: 400,
					statusText: "USER_NOT_FOUND",
					body: {
						message: "User not found",
					},
				},
			);
		}
		const token = await createJWT(
			"HS256",
			Buffer.from(ctx.context.secret),
			{
				email: user.user.email,
			},
			{
				expiresIn: new TimeSpan(1, "h"),
				issuer: "better-auth",
				subject: "forget-password",
				audiences: [user.user.email],
				includeIssuedTimestamp: true,
			},
		);
	},
);
