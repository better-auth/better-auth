import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
	plugins: [
		organization({
			requireEmailVerificationOnInvitation: true,
			creatorRole: "owner",
			teams: {
				enabled: true,
			},
			dynamicAccessControl: {
				maximumRolesPerOrganization: 20,
				enabled: true,
			},
		}),
	],
});

export const auth2 = betterAuth({
	plugins: [organization({})],
});
