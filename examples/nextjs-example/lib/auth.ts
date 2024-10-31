import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import {
	bearer,
	organization,
	passkey,
	twoFactor,
	admin,
	multiSession,
	username,
} from "better-auth/plugins";
import { reactInvitationEmail } from "./email/invitation";
import { reactResetPasswordEmail } from "./email/rest-password";
import { resend } from "./email/resend";
import { expo } from "@better-auth/expo";

const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
const to = process.env.TEST_EMAIL || "";

const database = new Database("better-auth.sqlite");

const twoFactorPlugin = twoFactor({
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
});

const organizationPlugin = organization({
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
});

export const auth = betterAuth({
	database,
	emailVerification: {
		async sendVerificationEmail(user, url) {
			console.log("Sending verification email to", user.email);
			// const res = await resend.emails.send({
			// 	from,
			// 	to: to || user.email,
			// 	subject: "Verify your email address",
			// 	html: `<a href="${url}">Verify your email address</a>`,
			// });
			// console.log(res, user.email);
		},
		sendOnSignUp: true,
	},
	account: {
		enabled: true,
		accountLinking: {
			trustedProviders: ["google", "github"],
		},
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword(user, url) {
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
	},
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
			// accessType: "offline",
			// prompt: "select_account",
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID || "",
			clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		},
		microsoft: {
			clientId: process.env.MICROSOFT_CLIENT_ID || "",
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
		},
		twitch: {
			clientId: process.env.TWITCH_CLIENT_ID || "",
			clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
		},
	},
	plugins: [
		organizationPlugin,
		twoFactorPlugin,
		passkey(),
		bearer(),
		admin(),
		multiSession(),
		username(),
		expo(),
	],
	trustedOrigins: ["better-auth://", "exp://"],
});
