import { betterAuth } from "better-auth";
import { organization, passkey, twoFactor } from "better-auth/plugins";
import { github } from "better-auth/social-providers";

export const auth = betterAuth({
	basePath: "/api/auth",
	providers: [
		github({
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		}),
	],
	database: {
		provider: "sqlite",
		url: "./prisma/db.sqlite",
	},
	secret: "better-auth-secret.1234567890",
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
			rpID: "localhost",
			rpName: "BetterAuth",
			origin: "http://localhost:3000",
		}),
	],
});
