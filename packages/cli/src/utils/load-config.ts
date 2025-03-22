import { existsSync } from "fs";
import { resolve, extname } from "path";
import { BetterAuthConfigSchema, type BetterAuthConfig } from "../schema/cli";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
/**
 * Loads and validates the configuration file.
 * @param configPath - The path to the configuration file.
 * @returns The validated configuration object.
 */
export async function loadConfig(
	configPath: string,
): Promise<BetterAuthConfig> {
	const resolvedPath = resolve(configPath);
	console.log({ resolvedPath });
	if (!existsSync(resolvedPath)) {
		throw new Error(`Configuration file not found: ${resolvedPath}`);
	}

	const fileExtension = extname(resolvedPath);
	let config: unknown;

	try {
		if (fileExtension === ".json") {
			// Read and parse JSON files
			// const fileContent = readFileSync(resolvedPath, "utf-8");
			// config = JSON.parse(fileContent);
			throw new Error(`We don't support JSON files yet`);
		} else if (fileExtension === ".ts") {
			const configModule = await jiti.import(resolvedPath);
			config = configModule?.default || configModule;
		} else {
			throw new Error(`Unsupported file type: ${fileExtension}`);
		}

		// Validate the configuration against the schema
		const result = BetterAuthConfigSchema.safeParse(config);
		if (!result.success) {
			throw new Error(`Invalid configuration: ${result.error.message}`);
		}

		return result.data;
	} catch (error) {
		throw new Error(`Failed to load or validate config file: ${error}`);
	}
}
