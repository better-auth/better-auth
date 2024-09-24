import { betterAuth } from "better-auth";
import {
	organization,
	passkey,
	twoFactor,
	rateLimiter,
} from "better-auth/plugins";
import { reactInvitationEmail } from "./email/invitation";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { github, google } from "better-auth/social-providers";
import { reactResetPasswordEmail } from "./email/rest-password";
import { resend } from "./email/resend";

const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
export const auth = betterAuth({
	database: new LibsqlDialect({
		url: process.env.TURSO_DATABASE_URL || "",
		authToken: process.env.TURSO_AUTH_TOKEN || "",
	}),
	emailAndPassword: {
		enabled: true,
		async sendResetPasswordToken(token, user) {
			const res = await resend.emails.send({
				from,
				to: user.email,
				subject: "Reset your password",
				react: reactResetPasswordEmail({
					username: user.email,
					resetLink: `${
						process.env.NODE_ENV === "development"
							? "http://localhost:3000"
							: process.env.NEXT_PUBLIC_APP_URL ||
								process.env.VERCEL_URL ||
								process.env.BETTER_AUTH_URL
					}/reset-password/${token}`,
				}),
			});
			console.log(res, user.email);
		},
	},
	plugins: [
		// rateLimiter({
		// 	enabled: true,
		// 	max: 1000,
		// }),
		organization({
			async sendInvitationEmail(data) {
				const res = await resend.emails.send({
					from,
					to: data.email,
					subject: "You've been invited to join an organization",
					react: reactInvitationEmail({
						username: data.email,
						invitedByUsername: data.inviter.user.name,
						invitedByEmail: data.inviter.user.email,
						teamName: data.organization.name,
						inviteLink:
							process.env.NODE_ENV === "development"
								? `http://localhost:3000/accept-invitation/${data.id}`
								: `https://${
										process.env.NEXT_PUBLIC_APP_URL ||
										process.env.VERCEL_URL ||
										process.env.BETTER_AUTH_URL
									}/accept-invitation/${data.id}`,
					}),
				});
				console.log(res, data.email);
			},
		}),
		twoFactor({
			otpOptions: {
				sendOTP(user, otp) {
					console.log({ otp });
				},
			},
		}),
		passkey(),
	],
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		google: {
			clientId: "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
	},
});
