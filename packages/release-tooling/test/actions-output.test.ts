import { afterEach, describe, expect, it, vi } from "vitest";
import { setOutput } from "../src/actions-output.ts";

describe("Actions output", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("does not write output values to runner logs", () => {
		vi.stubEnv("GITHUB_OUTPUT", "");
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const value = "summary\n::stop-commands::untrusted";

		setOutput("description", value);

		expect(log).toHaveBeenCalledWith(
			`Set output description (${value.length} characters)`,
		);
		expect(log).not.toHaveBeenCalledWith(expect.stringContaining(value));
	});
});
