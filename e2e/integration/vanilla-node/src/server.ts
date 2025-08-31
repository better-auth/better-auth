import { createServer } from "node:http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import Database from "better-sqlite3";
import { getMigrations } from "better-auth/db";

const database = new Database(":memory:");

const auth = betterAuth({
	database,
	baseURL: "http://localhost:3000",
	emailAndPassword: {
		enabled: true,
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();
// Create an example user
await auth.api.signUpEmail({
	body: {
		name: "Test User",
		email: "test@test.com",
		password: "password123",
	},
});

const authHandler = toNodeHandler(auth);

const server = createServer(async (req, res) => {
	res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	res.setHeader("Access-Control-Allow-Credentials", "true");

	if (req.method === "OPTIONS") {
		res.statusCode = 200;
		res.end();
		return;
	}

	const isAuthRoute = req.url?.startsWith("/api/auth");

	if (isAuthRoute) {
		return authHandler(req, res);
	}

	res.statusCode = 404;
	res.end(JSON.stringify({ error: "Not found" }));
});

const PORT = 3000;
server.listen(PORT, () => {
	console.log(`✅ Server running at http://localhost:${PORT}`);
	console.log(
		`   Auth endpoints available at http://localhost:${PORT}/api/auth/*`,
	);
});
