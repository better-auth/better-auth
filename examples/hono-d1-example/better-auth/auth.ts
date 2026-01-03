import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import {baseAuthConfig} from "../src/lib/auth";

export const auth = betterAuth({
	...baseAuthConfig,
	database: new Database("./better-auth/database.sqlite"),
});
