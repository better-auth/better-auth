import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "./index";

describe("drizzle-adapter relations-v2", () => {
	const defaultSecret = "test-secret-that-is-at-least-32-chars-long!!";

	function createAdapter(config: { supportsDates?: boolean }) {
		const db = { _: { fullSchema: {} } } as any;
		return drizzleAdapter(db, { provider: "sqlite", ...config })({
			secret: defaultSecret,
		});
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10816
	 */
	describe("supportsDates", () => {
		it("defers date conversion to Drizzle by default", () => {
			const adapter = createAdapter({});

			expect(adapter.options?.adapterConfig.supportsDates).toBe(true);
		});

		it("lets a text-column schema opt out", () => {
			const adapter = createAdapter({ supportsDates: false });

			expect(adapter.options?.adapterConfig.supportsDates).toBe(false);
		});
	});
});
