import "dotenv/config";
import * as fs from "node:fs";
import { Client } from "typesense";
import type { DocumentRecord } from "typesense-fumadocs-adapter";
import { getDefaultCollectionFields, sync } from "typesense-fumadocs-adapter";

const typesenseCollectionName = "better-auth-docs";
const typesenseLocale = "en";

// The adapter types tags as strings but creates a string[] field, which rejects imports.
const typesenseCollectionFields = getDefaultCollectionFields(
	typesenseLocale,
).map((field): typeof field =>
	field.name === "tag" ? { ...field, type: "string" } : field,
);

export function getTypesenseSyncOptions(documents: DocumentRecord[]) {
	return {
		typesenseCollectionName,
		documents: documents.map((document) => ({
			...document,
			locale: typesenseLocale,
		})),
		customLocaleCollectionSettings: {
			[typesenseLocale]: {
				field_definitions: typesenseCollectionFields,
			},
		},
	};
}

export function getTypesenseSyncSkipReason(env: NodeJS.ProcessEnv) {
	const url = env.NEXT_PUBLIC_TYPESENSE_SERVER_URL;
	const adminKey = env.TYPESENSE_ADMIN_API_KEY;

	if (!url || !adminKey) {
		return "[Typesense] env vars not set, skipping sync.";
	}

	if (!env.VERCEL) {
		return "[Typesense] not running on Vercel, skipping sync.";
	}

	if (!env.VERCEL_ENV) {
		return "[Typesense] Vercel environment is missing, skipping sync.";
	}

	if (env.VERCEL_ENV !== "production") {
		return `[Typesense] Vercel environment is "${env.VERCEL_ENV}", skipping sync.`;
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
		throw new Error("Typesense build output was not found.");
	}

	const serverUrl = new URL(url);
	const content = fs.readFileSync(filePath, "utf8");
	const records = JSON.parse(content) as DocumentRecord[];
	if (records.length === 0) {
		throw new Error("Typesense build output contains no records.");
	}

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

	await sync(client, getTypesenseSyncOptions(records));
	const collection = await client
		.collections(typesenseCollectionName)
		.retrieve();
	if (collection.num_documents === 0) {
		throw new Error("Typesense search index is empty after sync.");
	}

	console.log(`[Typesense] search updated: ${records.length} records`);
}

if (import.meta.main) {
	await main();
}
