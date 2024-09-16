import { betterAuth } from "better-auth";
import { organization, passkey, twoFactor } from "better-auth/plugins";
import { Resend } from "resend";
import { reactInvitationEmail } from "./email/invitation";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./auth.db",
	},
	emailAndPassword: {
		enabled: true,
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
		twoFactor(),
		passkey({
			rpID: "localhost",
		}),
	],
});
