import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ai } from "../src/commands/ai";

describe("ai: MCP config write", () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-ai-"));
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
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
