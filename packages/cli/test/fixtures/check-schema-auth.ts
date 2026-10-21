import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	baseURL: "https://auth.example.com",
	database: new DatabaseSync(":memory:"),
	secret: "check-schema-test-secret-at-least-32-characters",
	logger: { disabled: true },
	advanced: {
		database: {
			validateSchema: false,
		},
	},
});
