import { betterAuth } from "better-auth";
import {
	bearer,
	organization,
	passkey,
	twoFactor,
	admin,
} from "better-auth/plugins";
import { reactInvitationEmail } from "./email/invitation";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { reactResetPasswordEmail } from "./email/rest-password";
import { resend } from "./email/resend";

const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
const to = process.env.TEST_EMAIL || "";

const libsql = new LibsqlDialect({
	url: process.env.TURSO_DATABASE_URL || "",
	authToken: process.env.TURSO_AUTH_TOKEN || "",
});

export const auth = betterAuth({
	database: {
		dialect: libsql,
		type: "sqlite",
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword(url, user) {
			await resend.emails.send({
				from,
				to: user.email,
				subject: "Reset your password",
				react: reactResetPasswordEmail({
					username: user.email,
					resetLink: url,
				}),
			});
		},
		sendEmailVerificationOnSignUp: true,
		async sendVerificationEmail(email, url) {
			console.log("Sending verification email to", email);
			const res = await resend.emails.send({
				from,
				to: to || email,
				subject: "Verify your email address",
				html: `<a href="${url}">Verify your email address</a>`,
			});
			console.log(res, email);
		},
	},
	plugins: [
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
				async sendOTP(user, otp) {
					await resend.emails.send({
						from,
						to: user.email,
						subject: "Your OTP",
						html: `Your OTP is ${otp}`,
					});
				},
			},
		}),
		passkey(),
		bearer(),
		admin(),
	],
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID || "",
			clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		},
		microsoft: {
			clientId: process.env.MICROSOFT_CLIENT_ID || "",
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
		},
	},
});
