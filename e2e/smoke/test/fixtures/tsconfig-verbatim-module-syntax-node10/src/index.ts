import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { expo } from "@better-auth/expo";

betterAuth({
	database: new Database("./sqlite.db"),
	plugins: [expo()],
});
