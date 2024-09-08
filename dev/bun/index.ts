import { auth } from "./auth";

Bun.serve({
	fetch(request, server) {
		auth;
		return new Response("Hello, World!");
	},
});
