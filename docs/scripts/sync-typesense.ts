import "dotenv/config";
import * as fs from "node:fs";
import { Client } from "typesense";
import type { DocumentRecord } from "typesense-fumadocs-adapter";
import { sync } from "typesense-fumadocs-adapter";

export function getTypesenseSyncSkipReason(env: NodeJS.ProcessEnv) {
	const url = env.NEXT_PUBLIC_TYPESENSE_SERVER_URL;
	const adminKey = env.TYPESENSE_ADMIN_API_KEY;

	if (!url || !adminKey) {
		return "[Typesense] env vars not set, skipping sync.";
	}

	if (env.VERCEL_ENV !== "production") {
		return `[Typesense] Vercel environment is "${env.VERCEL_ENV ?? "undefined"}", skipping sync.`;
	}

	if (env.VERCEL_GIT_COMMIT_REF !== "main") {
		return `[Typesense] Branch is "${env.VERCEL_GIT_COMMIT_REF}", skipping sync.`;
	}

	return null;
}

async function main() {
	const skipReason = getTypesenseSyncSkipReason(process.env);
	if (skipReason) {
		console.log(skipReason);
		return;
	}

	const url = process.env.NEXT_PUBLIC_TYPESENSE_SERVER_URL;
	const adminKey = process.env.TYPESENSE_ADMIN_API_KEY;
	if (!url || !adminKey) {
		console.warn(
			"[Typesense] env vars not set after skip check, skipping sync.",
		);
		return;
	}

	const filePath = ".next/server/app/api/docs/static.json.body";
	if (!fs.existsSync(filePath)) {
		console.log("[Typesense] build output not found, skipping sync.");
		return;
	}

	try {
		const serverUrl = new URL(url);
		const content = fs.readFileSync(filePath, "utf8");
		const records = JSON.parse(content) as DocumentRecord[];

		const client = new Client({
			nodes: [
				{
					host: serverUrl.hostname,
					port:
						Number(serverUrl.port) ||
						(serverUrl.protocol === "https:" ? 443 : 80),
					protocol: serverUrl.protocol.replace(":", ""),
				},
			],
			apiKey: adminKey,
			connectionTimeoutSeconds: 30,
		});

		await sync(client, {
			typesenseCollectionName: "better-auth-docs",
			documents: records,
		});
		console.log(`[Typesense] search updated: ${records.length} records`);
	} catch (error) {
		console.warn("[Typesense] failed to sync index, continuing build:", error);
	}
}

if (import.meta.main) {
	void main();
}
