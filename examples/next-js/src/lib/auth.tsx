import { betterAuth } from "better-auth";
import {
	organization,
	passkey,
	twoFactor,
	username,
} from "better-auth/plugins";
import { github, google } from "better-auth/social-providers";
import { ac, admin } from "./permissions";
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";

const dialect = new LibsqlDialect({
	url: process.env.TURSO_DATABASE_URL as string,
	authToken: process.env.TURSO_AUTH_TOKEN as string,
});

export const auth = betterAuth({
	socialProvider: [
		github({
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		}),
		google({
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		}),
	],
	database: dialect,
	secret: process.env.BETTER_AUTH_SECRET as string,
	emailAndPassword: {
		enabled: true,
		async sendResetPasswordToken(token, user) {
			console.log({ token, user });
		},
	},
	plugins: [
		organization({
			async sendInvitationEmail(invitation, email) {
				console.log({ invitation, email });
			},
			ac: ac,
			roles: {
				admin: admin,
			},
		}),
		twoFactor({
			issuer: "BetterAuth",
			otpOptions: {
				async sendOTP(user, otp) {
					console.log({ user, otp });
				},
			},
		}),
		passkey({
			rpID: "better-auth",
			rpName: "better-auth",
			origin: process.env.BETTER_AUTH_URL as string,
		}),
		username(),
	],
});