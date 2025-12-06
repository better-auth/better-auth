import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { getAuth } from "./lib/auth";

export type APP_ENV = {
	Bindings: {
		D1: D1Database;
		GOOGLE_ID: string;
		GOOGLE_SECRET: string;
	};
};
export type AppContext = Context<APP_ENV>;

const app = new Hono<APP_ENV>();

app.use(
	"/api/auth/*",
	cors({
		origin: "https://example.com",
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/**", (c) => {
	const auth = getAuth(c);
	return auth.handler(c.req.raw);
});

export default app;
