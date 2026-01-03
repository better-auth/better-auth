import * as fs from "node:fs/promises";
import * as process from "node:process";
import { OramaCloud } from "@orama/core";
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

	const orama = new OramaCloud({
		projectId: process.env.NEXT_PUBLIC_ORAMA_PROJECT_ID!,
		apiKey: apiKey,
	});

	const content = await fs.readFile(filePath);
	const records = JSON.parse(content.toString()) as OramaDocument[];

	await sync(orama, {
		index: process.env.NEXT_PUBLIC_ORAMA_DATASOURCE_ID!,
		documents: records,
		autoDeploy: true,
	});

	console.log(`search updated: ${records.length} records`);
}

void main();
