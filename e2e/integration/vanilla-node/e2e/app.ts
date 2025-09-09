import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import Database from "better-sqlite3";
import { getMigrations } from "better-auth/db";
import fs from "node:fs/promises";
import { join } from "path";

export async function createAuthServer(
	baseURL: string = "http://localhost:3000",
	https: boolean = false,
) {
	const database = new Database(":memory:");

	const auth = betterAuth({
		database,
		baseURL: "https://auth.test.com",
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			crossOriginCookies: {
				enabled: true,
			},
			defaultCookieAttributes: {
				sameSite: "none",
				partitioned: true,
			},
		},
		trustedOrigins: ["https://test.com:3000"],
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
	if (https) {
		const options = {
			key: await fs.readFile(
				join(import.meta.dirname, "fixtures", "private-key.pem"),
			),
			cert: await fs.readFile(
				join(import.meta.dirname, "fixtures", "certificate.pem"),
			),
		};
		return createHttpsServer(options, async (req, res) => {
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
	}

	return createServer(async (req, res) => {
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
}
