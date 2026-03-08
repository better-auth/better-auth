import "dotenv/config";
import * as fs from "node:fs";
import { Client } from "typesense";
import type { DocumentRecord } from "typesense-fumadocs-adapter";
import { sync } from "typesense-fumadocs-adapter";

const url = process.env.NEXT_PUBLIC_TYPESENSE_SERVER_URL;
const adminKey = process.env.TYPESENSE_ADMIN_API_KEY;

if (!url || !adminKey) {
	console.log("Typesense env vars not set, skipping sync.");
	process.exit(0);
}

if (process.env.VERCEL && process.env.VERCEL_GIT_COMMIT_REF !== "main") {
	console.log(
		`Branch is "${process.env.VERCEL_GIT_COMMIT_REF}", skipping sync.`,
	);
	process.exit(0);
}

const filePath = ".next/server/app/api/docs/static.json.body";
if (!fs.existsSync(filePath)) {
	console.log("Build output not found, run 'pnpm build' first. Skipping sync.");
	process.exit(0);
}
const content = fs.readFileSync(filePath);
const records = JSON.parse(content.toString()) as DocumentRecord[];

const serverUrl = new URL(url);

const client = new Client({
	nodes: [
		{
			host: serverUrl.hostname,
			port:
				Number(serverUrl.port) || (serverUrl.protocol === "https:" ? 443 : 80),
			protocol: serverUrl.protocol.replace(":", ""),
		},
	],
	apiKey: adminKey,
	connectionTimeoutSeconds: 30,
});

void sync(client, {
	typesenseCollectionName: "better-auth-docs",
	documents: records,
})
	.then(() => {
		console.log(`search updated: ${records.length} records`);
	})
	.catch((error) => {
		console.error("Failed to sync Typesense index:", error);
		process.exitCode = 1;
	});
