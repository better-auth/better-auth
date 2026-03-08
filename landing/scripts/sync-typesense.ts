import "dotenv/config";
import * as fs from "node:fs";
import { Client } from "typesense";
import type { DocumentRecord } from "typesense-fumadocs-adapter";
import { sync } from "typesense-fumadocs-adapter";

const filePath = ".next/server/app/api/docs/static.json.body";
const content = fs.readFileSync(filePath);
const records = JSON.parse(content.toString()) as DocumentRecord[];

const serverUrl = new URL(process.env.NEXT_PUBLIC_TYPESENSE_SERVER_URL!);

const client = new Client({
	nodes: [
		{
			host: serverUrl.hostname,
			port:
				Number(serverUrl.port) || (serverUrl.protocol === "https:" ? 443 : 80),
			protocol: serverUrl.protocol.replace(":", ""),
		},
	],
	apiKey: process.env.TYPESENSE_ADMIN_API_KEY!,
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
