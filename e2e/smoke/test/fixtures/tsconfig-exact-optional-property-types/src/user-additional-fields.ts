import { betterAuth } from "better-auth";

const auth = betterAuth({
	trustedOrigins: [],
	emailAndPassword: {
		enabled: true,
	},
	user: {
		additionalFields: {
			timeZone: {
				type: "string",
				required: true,
			},
		},
	},
});

// expect no error here because timeZone is optional
await auth.api.signUpEmail({
	body: {
		email: "",
		password: "",
		name: "",
		timeZone: "",
	},
});
