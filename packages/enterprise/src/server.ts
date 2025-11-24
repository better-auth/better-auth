import "dotenv/config";

import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import openapi from "@elysiajs/openapi";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Elysia } from "elysia";

import { auth } from "./better-auth";
import { db } from "./db";

await migrate(db, {
	migrationsFolder: "./drizzle",
	migrationsSchema: "enterprise",
	migrationsTable: "_migrations",
});

await import("./init");

const app = new Elysia()
	.use(
		openapi({
			path: "/openapi",
		}),
	)
	.use(
		jwt({
			name: "jwt",
			secret: "Fischl von Luftschloss Narfidort",
		}),
	)
	.use(cors())
	.all("/api/auth/*", (context) => {
		const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
		// validate request method
		if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
			return auth.handler(context.request);
		} else {
			throw new Error("Method not allowed");
		}
	})
	.get("/", () => "Hello Elysia");

export default {
	fetch: app.fetch.bind(app),
	port: 3001,
};

console.log("Server is running on port 3001");
console.log("Playground: http://localhost:3001/api/auth/reference");
