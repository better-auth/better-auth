import { auth } from "./_auth";

Bun.serve({
	fetch(request, server) {
		auth;
		return new Response("Hello, World!");
	},
});
