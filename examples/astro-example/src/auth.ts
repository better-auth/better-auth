import { betterAuth } from "better-auth";
import { passkey } from "better-auth/plugins/passkey";
import { twoFactor } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database("./db.sqlite"),
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		},
	},
	emailAndPassword: {
		enabled: true,
	},
	socialProviders: {
		google: {
			clientId: import.meta.env.GOOGLE_CLIENT_ID!,
			clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET!,
		},
		github: {
			clientId: import.meta.env.GITHUB_CLIENT_ID!,
			clientSecret: import.meta.env.GITHUB_CLIENT_SECRET!,
		},
	},
	plugins: [
		passkey(),
		twoFactor({
			otpOptions: {
				async sendOTP(user, otp) {
					console.log(`Sending OTP to ${user.email}: ${otp}`);
					// await resend.emails.send({
					// 	from: "Acme <no-reply@demo.better-auth.com>",
					// 	to: user.email,
					// 	subject: "Your OTP",
					// 	html: `Your OTP is ${otp}`,
					// });
				},
			},
		}),
	],
	rateLimit: {
		enabled: true,
	},
});
