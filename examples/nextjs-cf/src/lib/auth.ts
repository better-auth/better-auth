import { Resend } from "resend";
import { betterAuth } from "better-auth";
import { magicLink, passkey } from "better-auth/plugins";
import { db } from "./db";

const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
const to = process.env.TEST_EMAIL || "";
const resend = new Resend(process.env.RESEND_API_KEY!);

export const auth = betterAuth({
	database: {
		db,
		type: "sqlite",
	},
	baseURL: process.env.BETTER_AUTH_URL,
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID!,
			clientSecret: process.env.DISCORD_CLIENT_SECRET!,
		},
	},
	plugins: [
		passkey(),
		magicLink({
			async sendMagicLink(data) {
				console.log({
					data,
				});
				await resend.emails.send({
					from,
					to: to || data.email,
					subject: "Sign in to Better Auth",
					html: `
						<p>Click the link below to sign in to Better Auth:</p>
						<a href="${data.url}">Sign in</a>
					`,
				});
			},
		}),
	],
});
