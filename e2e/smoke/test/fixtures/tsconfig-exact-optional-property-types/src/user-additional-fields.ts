import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

const auth = betterAuth({
	database: new Database("./sqlite.db"),
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
