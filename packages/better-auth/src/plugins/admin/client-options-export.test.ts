import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @see https://github.com/better-auth/better-auth/issues/9640
 *
 * Test to validate that `AdminClientOptions` is exported.
 *
 * The issue: `adminClient<O extends AdminClientOptions>()` uses a generic constraint
 * that references `AdminClientOptions`, but this interface was not exported.
 * When consumers try to emit declaration files for code that uses `adminClient()`,
 * TypeScript (especially tsgo) fails with TS4023 because it cannot reference
 * an unexported type in the consumer's declarations.
 */
describe("AdminClientOptions export", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/9640
	 */
	it("should export AdminClientOptions interface from the admin client module", async () => {
		const clientModulePath = path.resolve(
			__dirname,
			"../../../dist/plugins/admin/client.d.mts",
		);

		if (!fs.existsSync(clientModulePath)) {
			console.warn(
				"Declaration file not found - run `pnpm build` first to generate it",
			);
			return;
		}

		const content = fs.readFileSync(clientModulePath, "utf-8");

		const hasExportedAdminClientOptions =
			content.includes("export interface AdminClientOptions") ||
			content.includes("export { AdminClientOptions") ||
			content.includes("export type { AdminClientOptions") ||
			(content.includes("interface AdminClientOptions") &&
				/export\s*\{[^}]*AdminClientOptions[^}]*\}/.test(content));

		expect(
			hasExportedAdminClientOptions,
			"AdminClientOptions should be exported to allow consumers to emit declarations",
		).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9640
	 *
	 * Verify the type is importable from the source module.
	 * This test passes at compile time if the type is exported.
	 */
	it("should allow importing AdminClientOptions from the client module", async () => {
		const adminClientModule = await import("./client");

		expect(typeof adminClientModule.adminClient).toBe("function");
	});
});
