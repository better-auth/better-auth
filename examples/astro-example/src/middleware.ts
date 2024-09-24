import { auth } from "@/auth";
import { defineMiddleware } from "astro:middleware";

// `context` and `next` are automatically typed
export const onRequest = defineMiddleware(async (context, next) => {
	const isAuthed = await auth.api
		.getSession({
			headers: context.request.headers,
		})
		.catch((e) => {
			return null;
		});
	if (context.url.pathname === "/dashboard" && !isAuthed) {
		return context.redirect("/");
	}
	return next();
});
