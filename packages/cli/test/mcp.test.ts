import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcp } from "../src/commands/mcp";

vi.mock(import("node:child_process"), () => ({
	execSync: vi.fn(),
}));

describe("mcp: failed setup", () => {
	let dir: string;

	function logged() {
		return vi.mocked(console.log).mock.calls.flat().join("\n");
	}

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-mcp-"));
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it.each(["--cursor", "--codex", "--claude-code"])(
		"%s exits 1 when the client command fails",
		async (option) => {
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error("command failed");
			});

			await mcp.parseAsync(["node", "mcp", option]);

			expect(process.exitCode).toBe(1);
			expect(logged()).not.toContain("Next Steps");
		},
	);

	it.each([
		["--open-code", "opencode.json"],
		["--manual", "mcp.json"],
	])("%s exits 1 when %s cannot be read", async (option, file) => {
		fs.writeFileSync(path.join(dir, file), "not json");

		await mcp.parseAsync(["node", "mcp", option]);

		expect(process.exitCode).toBe(1);
		expect(logged()).not.toContain("Next Steps");
		expect(fs.readFileSync(path.join(dir, file), "utf-8")).toBe("not json");
	});
});
