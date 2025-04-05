import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { z } from "zod";
import {baseAuthConfig} from "../src/lib/auth";

const env = z.object({
	GOOGLE_ID: z.string(),
	GOOGLE_SECRET: z.string(),
});
const parsedEnv = env.parse(process.env);

export const auth = betterAuth({
	...baseAuthConfig,
	database: new Database("./better-auth/database.sqlite"),
	socialProviders: {
		google: {
			clientId: parsedEnv.GOOGLE_ID,
			clientSecret: parsedEnv.GOOGLE_SECRET,
		},
	},
});
