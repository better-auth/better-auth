import fs from "node:fs/promises";
import {
	parseSpiceDBSchema,
	analyzeSpiceDbSchema,
	generateSDK,
} from "@schoolai/spicedb-zed-schema-parser";

async function generatePermissionsSDK() {
	// 1. Read your schema file
	const schemaContent = await fs.readFile(
		"src/test-utils/graph-schema.test.zed",
		"utf-8",
	);

	// 2. Parse the schema
	const { ast, errors: parseErrors } = parseSpiceDBSchema(schemaContent);
	if (parseErrors.length > 0) {
		console.error("Parse errors:", parseErrors);
		return;
	}

	// 3. Analyze the schema
	const {
		augmentedAst,
		errors: analysisErrors,
		isValid,
	} = analyzeSpiceDbSchema(ast!);
	if (!isValid) {
		console.error("Analysis errors:", analysisErrors);
		return;
	}

	// 4. Generate TypeScript SDK
	const generatedCode = generateSDK(augmentedAst!);

	// 5. Write to file
	await fs.writeFile("src/generated/graph.ts", generatedCode);
	console.log("✅ Type-safe permissions SDK generated!");
}

generatePermissionsSDK().catch(console.error);
