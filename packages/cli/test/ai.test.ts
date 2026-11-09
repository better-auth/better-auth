import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ai } from "../src/commands/ai";

// These tests answer prompts as if the run had a terminal.
vi.mock(import("../src/utils/interactive"));

vi.mock(import("node:child_process"), () => ({
	execSync: vi.fn(),
}));

describe("ai: MCP config write", () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-ai-"));
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	async function runCursorProjectFlow() {
		prompts.inject([
			"client",
			"mcp",
			"cursor",
			"project",
			"https://agent-auth.directory",
			true,
			false,
		]);
		await ai.parseAsync(["node", "ai"]);
	}

	async function runOpenCodeFlow() {
		prompts.inject([
			"client",
			"mcp",
			"opencode",
			"https://agent-auth.directory",
			true,
			false,
		]);
		await ai.parseAsync(["node", "ai"]);
	}

	function logged() {
		return vi.mocked(console.log).mock.calls.flat().join("\n");
	}

	function writeCursorConfig(content: string) {
		fs.mkdirSync(path.join(dir, ".cursor"), { recursive: true });
		const configPath = path.join(dir, ".cursor", "mcp.json");
		fs.writeFileSync(configPath, content);
		return configPath;
	}

	it("merges agent-auth into an existing JSON config", async () => {
		const configPath = writeCursorConfig(
			JSON.stringify({ mcpServers: { "other-server": { command: "x" } } }),
		);
		await runCursorProjectFlow();
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		expect(Object.keys(config.mcpServers)).toEqual([
			"other-server",
			"agent-auth",
		]);
	});

	it("exits 1 without claiming success when the config cannot be written", async () => {
		writeCursorConfig("null\n");
		await runCursorProjectFlow();
		expect(process.exitCode).toBe(1);
		expect(logged()).toContain("Setup incomplete.");
		expect(logged()).not.toContain("Done!");
	});

	it("exits 1 when the skill cannot be installed", async () => {
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error("npx failed");
		});
		prompts.inject([
			"client",
			"mcp",
			"cursor",
			"project",
			"https://agent-auth.directory",
			true,
			true,
		]);
		await ai.parseAsync(["node", "ai"]);
		expect(process.exitCode).toBe(1);
	});

	it("exits 130 when a later prompt is canceled", async () => {
		const exit = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		prompts.inject([
			"client",
			"mcp",
			"cursor",
			"project",
			new Error("canceled"),
		]);

		await expect(ai.parseAsync(["node", "ai"])).rejects.toThrow("exit");

		expect(exit).toHaveBeenCalledWith(130);
		expect(fs.existsSync(path.join(dir, ".cursor", "mcp.json"))).toBe(false);
	});

	it("leaves a config with a trailing comma unchanged", async () => {
		const original = `{\n  "mcpServers": {\n    "other-server": { "command": "x" },\n  }\n}\n`;
		const configPath = writeCursorConfig(original);
		await runCursorProjectFlow();
		expect(fs.readFileSync(configPath, "utf-8")).toBe(original);
	});

	it("leaves a config with comments unchanged", async () => {
		const original = `// my servers\n{\n  "mcpServers": { "other-server": { "command": "x" } }\n}\n`;
		const configPath = writeCursorConfig(original);
		await runCursorProjectFlow();
		expect(fs.readFileSync(configPath, "utf-8")).toBe(original);
	});

	it.each(["null\n", "[]\n"])(
		"leaves a config that is not a JSON object unchanged: %j",
		async (original) => {
			const configPath = writeCursorConfig(original);
			await runCursorProjectFlow();
			expect(fs.readFileSync(configPath, "utf-8")).toBe(original);
		},
	);

	it("leaves an opencode.json with a trailing comma unchanged", async () => {
		const original = `{\n  "theme": "dark",\n  "mcp": { "other-server": { "type": "local" } },\n}\n`;
		const configPath = path.join(dir, "opencode.json");
		fs.writeFileSync(configPath, original);
		await runOpenCodeFlow();
		expect(fs.readFileSync(configPath, "utf-8")).toBe(original);
	});
});
