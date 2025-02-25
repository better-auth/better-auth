import { Hono } from "hono";
import { Auth, createAuth } from "./auth";

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
