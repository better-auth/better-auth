import { Hono } from "hono";
import { auth } from "./auth";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
	"/api/auth/**",
	cors({
		origin: "http://localhost:5173",
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/**", (c) => {
	return auth.handler(c.req.raw);
});

serve(app);
