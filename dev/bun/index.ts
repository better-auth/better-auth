import { auth } from "./auth";

Bun.serve({
	fetch: auth.handler,
	port: 4000,
});
console.log("Server running on port 4000");
