import { beforeAll, describe } from "vitest";

import { Surreal } from "surrealdb";
import { surrealdbAdapter } from ".";
import { runAdapterTest } from "../test";

describe("adapter test", async () => {
	const surrealClient = async (
		url: string,
		surrealDB: string,
		surrealNS: string,
		auth?: { username: string; password: string },
		token?: string,
	) => {
		const client = new Surreal();
		await client.connect(url, {
			namespace: surrealNS,
			database: surrealDB,
			auth: auth || token,
		});
		return client;
	};

	const db = await surrealClient(
		"wss://localhost:8000",
		"better_auth",
		"better_auth",
		{ username: "root", password: "root" },
	);
	async function cleanup() {
		await db.query(
			"DEFINE NAMESPACE IF NOT EXISTS better_auth; DEFINE DATABASE IF NOT EXISTS better_auth; DELETE user;",
		);
	}

	beforeAll(async () => {
		await cleanup();
	});

	const adapter = surrealdbAdapter(db);
	await runAdapterTest({
		adapter,
	});
});
