import type { MiddlewareHandler } from "hono";
import { contextStorage } from "hono/context-storage";
import { getBetterAuthSetCookie } from "../auth";

const storage = contextStorage();

const authMiddleware = (): MiddlewareHandler => {
	return (c, next) =>
		storage(c, async () => {
			await next();
			for (const cookie of getBetterAuthSetCookie() ?? []) {
				c.header("set-cookie", cookie, { append: true });
			}
		});
};

export default authMiddleware;
