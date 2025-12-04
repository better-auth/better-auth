import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Hono } from "hono";
import { createDrizzle } from "./db";

interface CloudflareBindings {
	DB: D1Database;
}

const createAuth = (env: CloudflareBindings) =>
	betterAuth({
		baseURL: "http://localhost:4000",
		database: drizzleAdapter(createDrizzle(env.DB), { provider: "sqlite" }),
		emailAndPassword: {
			enabled: true,
		},
		logger: {
			level: "debug",
		},
	});

type Auth = ReturnType<typeof createAuth>;

const app = new Hono<{
	Bindings: CloudflareBindings;
	Variables: {
		auth: Auth;
	};
}>();

app.use("*", async (c, next) => {
	const auth = createAuth(c.env);
	c.set("auth", auth);
	await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

app.get("/", async (c) => {
	const session = await c.var.auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (session) return c.text("Hello " + session.user.name);
	return c.text("Not logged in");
});

export default app satisfies ExportedHandler<CloudflareBindings>;
