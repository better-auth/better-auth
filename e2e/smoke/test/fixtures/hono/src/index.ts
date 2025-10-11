import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { expo } from "@better-auth/expo";
import { serve } from "@hono/node-server";

import { Hono } from "hono";

const app = new Hono();

export const auth = betterAuth({
	database: new Database("./sqlite.db"),
	plugins: [expo()],
});

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
