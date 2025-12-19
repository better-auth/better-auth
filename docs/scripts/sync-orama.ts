import * as fs from "node:fs/promises";
import * as process from "node:process";
import { CloudManager } from "@oramacloud/client";
import type { OramaDocument } from "fumadocs-core/search/orama-cloud";
import { sync } from "fumadocs-core/search/orama-cloud";
import "dotenv/config";

const filePath = ".next/server/app/static.json.body";

async function main() {
	const apiKey = process.env.ORAMA_PRIVATE_API_KEY;

	if (!apiKey) {
		console.log("no api key for Orama found, skipping");
		return;
	}

	const content = await fs.readFile(filePath);
	const records = JSON.parse(content.toString()) as OramaDocument[];
	const manager = new CloudManager({ api_key: apiKey });

	await sync(manager, {
		index: process.env.ORAMA_INDEX_ID!,
		documents: records,
		autoDeploy: true,
	});

	console.log(`search updated: ${records.length} records`);
}

void main();
