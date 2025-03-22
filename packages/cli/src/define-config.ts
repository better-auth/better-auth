import { type BetterAuthConfig, BetterAuthConfigSchema } from "./schema/cli";
/**
 * Validates the configuration object against the schema.
 * @param config - The configuration object to validate.
 * @returns The validated configuration object.
 */
export function defineConfig(config: BetterAuthConfig): BetterAuthConfig {
	const result = BetterAuthConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(`Invalid configuration: ${result.error.message}`);
	}
	return result.data;
}
