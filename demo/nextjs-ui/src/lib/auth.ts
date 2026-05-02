import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database("auth.db"),
	appName: "Test UI App",
	emailAndPassword: {
		enabled: true,
	},
	ui: {
		enabled: true,
		basePath: "/auth",
		redirectTo: "/dashboard",
	},
	plugins: [passkey()],
});
