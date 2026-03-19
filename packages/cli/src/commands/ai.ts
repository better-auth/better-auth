import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";

const PROTOCOL_URL = "https://agent-auth-protocol.com";
const AGENT_CLI_PKG = "@auth/agent-cli";
const AGENT_PLUGIN_PKG = "@better-auth/agent-auth";
const DEFAULT_REGISTRY = "https://agent-auth.directory";
const SKILLS_REPO = "better-auth/agent-auth";

interface McpEntry {
	command: string;
	args: string[];
}

function cancelled(): never {
	console.log(chalk.yellow("\n✋ Setup cancelled."));
	process.exit(0);
}

function check<T>(value: T | undefined): T {
	if (value === undefined || value === null) cancelled();
	return value;
}

// ── Main ──────────────────────────────────────────

async function aiAction() {
	console.log(
		"\n" +
			[
				`   ██  ████`,
				`   ████  ██  ${chalk.bold("Agent Auth")} ${chalk.dim("Setup")}`,
				`   ██  ████  ${chalk.gray("AI agent authentication & capability-based authorization.")}`,
			].join("\n"),
	);
	console.log();

	const { setup } = await prompts({
		type: "select",
		name: "setup",
		message: "What would you like to do?",
		choices: [
			{
				title: "Integrate Agent Auth client",
				value: "client",
				description: "MCP server, CLI, or SDK for your agents",
			},
			{
				title: "Create an Agent Auth server",
				value: "server",
				description: "expose capabilities from your service to AI agents",
			},
		],
	});

	check(setup);

	if (setup === "client") {
		await setupClient();
	} else {
		await setupServerSelection();
	}
}

// ── Client Integration ────────────────────────────

async function setupClient() {
	const { method } = await prompts({
		type: "select",
		name: "method",
		message: "How do you want to integrate?",
		choices: [
			{
				title: "MCP Server",
				value: "mcp",
				description: "for AI tools — Claude, Cursor, Windsurf, etc.",
			},
			{
				title: "CLI",
				value: "cli",
				description: "command-line tool for agent workflows",
			},
		],
	});

	check(method);

	if (method === "mcp") {
		await setupMcp();
	} else {
		await setupCli();
	}
}

// ── Server Selection ──────────────────────────────

async function setupServerSelection() {
	const { implementation } = await prompts({
		type: "select",
		name: "implementation",
		message: "Choose an implementation",
		choices: [
			{
				title: "Better Auth + Agent Auth",
				value: "better-auth",
				description: "TypeScript",
			},
		],
	});

	check(implementation);

	await setupServer();
}

// ── MCP Server Setup ──────────────────────────────

async function setupMcp() {
	const { tool } = await prompts({
		type: "select",
		name: "tool",
		message: "Which AI tool?",
		choices: [
			{ title: "Cursor", value: "cursor" },
			{ title: "Claude Code", value: "claude-code" },
			{ title: "Claude Desktop", value: "claude-desktop" },
			{ title: "Windsurf", value: "windsurf" },
			{ title: "VS Code / Copilot", value: "vscode" },
			{ title: "Open Code", value: "opencode" },
			{ title: "Other", value: "other" },
		],
	});
	check(tool);

	let scope: "project" | "global" = "global";

	if (tool === "cursor" || tool === "vscode") {
		const hintProject =
			tool === "cursor" ? ".cursor/mcp.json" : ".vscode/mcp.json";
		const hintGlobal =
			tool === "cursor" ? "~/.cursor/mcp.json" : "user settings";
		const { s } = await prompts({
			type: "select",
			name: "s",
			message: "Where should it be configured?",
			choices: [
				{
					title: "This project",
					value: "project",
					description: hintProject,
				},
				{
					title: "Global (all projects)",
					value: "global",
					description: hintGlobal,
				},
			],
		});
		check(s);
		scope = s;
	}

	const { registryUrl } = await prompts({
		type: "text",
		name: "registryUrl",
		message: "Registry URL",
		initial: DEFAULT_REGISTRY,
	});

	const registry = registryUrl?.trim() || DEFAULT_REGISTRY;
	const mcpArgs = buildMcpArgs(registry);

	if (tool === "claude-code") {
		await setupClaudeCode(mcpArgs);
	} else if (tool === "opencode") {
		await setupOpenCode(mcpArgs);
	} else if (tool === "other") {
		const entry: McpEntry = { command: "npx", args: mcpArgs };
		showJsonConfig(entry);
	} else {
		await writeMcpConfigInteractive(tool, scope, mcpArgs);
	}

	await offerSkillInstall("agent-auth-mcp");

	showNextSteps([
		`${chalk.cyan("Docs")}    ${PROTOCOL_URL}/docs/integrate-client`,
		`${chalk.cyan("GitHub")}  https://github.com/better-auth/agent-auth`,
	]);

	console.log(
		chalk.green("\n✔ ") +
			chalk.bold("Done! ") +
			"Restart your AI tool to connect.\n",
	);
}

async function setupClaudeCode(args: string[]) {
	const { scope } = await prompts({
		type: "select",
		name: "scope",
		message: "Where should it be configured?",
		choices: [
			{
				title: "This project",
				value: "project",
				description: "--scope project",
			},
			{
				title: "Global (all projects)",
				value: "user",
				description: "--scope user",
			},
		],
	});
	check(scope);

	const cmdParts = [
		"claude",
		"mcp",
		"add",
		"agent-auth",
		"--scope",
		scope,
		"--",
		"npx",
		...args,
	];
	const cmd = cmdParts.join(" ");

	console.log(chalk.bold.white("\nRun this command:"));
	console.log(chalk.cyan(`  ${cmd}\n`));

	const { run } = await prompts({
		type: "confirm",
		name: "run",
		message: "Run it now?",
		initial: true,
	});

	if (run) {
		const s = yoctoSpinner({
			text: "Adding MCP server to Claude Code…",
			color: "white",
		});
		s.start();
		try {
			execSync(cmd, { stdio: "pipe" });
			s.success("Added to Claude Code.");
		} catch {
			s.stop();
			console.log(chalk.yellow("⚠ Could not run the command automatically."));
			console.log(chalk.gray("  Run the command above manually."));
		}
	}
}

async function setupOpenCode(args: string[]) {
	const configPath = path.join(process.cwd(), "opencode.json");
	const display = "opencode.json";

	const openCodeEntry = {
		type: "stdio" as const,
		command: "npx",
		args,
		enabled: true,
	};

	const { write } = await prompts({
		type: "confirm",
		name: "write",
		message: `Write config to ${chalk.cyan(display)}?`,
		initial: true,
	});

	if (write) {
		writeOpenCodeConfig(configPath, openCodeEntry);
		console.log(chalk.green(`\n✓ Written to ${display}`));
	} else {
		const json = JSON.stringify(
			{
				$schema: "https://opencode.ai/config.json",
				mcp: { "agent-auth": openCodeEntry },
			},
			null,
			2,
		);
		console.log(chalk.bold.white("\nAdd to your opencode.json:\n"));
		console.log(
			json
				.split("\n")
				.map((line) => chalk.cyan(`  ${line}`))
				.join("\n"),
		);
		console.log();
	}
}

function writeOpenCodeConfig(
	configPath: string,
	entry: { type: string; command: string; args: string[]; enabled: boolean },
) {
	let config: { mcp?: Record<string, unknown>; [key: string]: unknown } = {};
	if (fs.existsSync(configPath)) {
		try {
			config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		} catch {
			/* start fresh */
		}
	}
	const mcp = (config.mcp as Record<string, unknown> | undefined) ?? {};
	mcp["agent-auth"] = entry;
	config.$schema = "https://opencode.ai/config.json";
	config.mcp = mcp;

	fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

async function writeMcpConfigInteractive(
	tool: string,
	scope: "project" | "global",
	args: string[],
) {
	const entry: McpEntry = { command: "npx", args };
	const configPath = getMcpConfigPath(tool, scope);

	if (!configPath) {
		showJsonConfig(entry);
		return;
	}

	const display = displayPath(configPath, scope);
	const { write } = await prompts({
		type: "confirm",
		name: "write",
		message: `Write config to ${chalk.cyan(display)}?`,
		initial: true,
	});

	if (write) {
		writeMcpConfig(configPath, entry);
		console.log(chalk.green(`\n✓ Written to ${display}`));
	} else {
		showJsonConfig(entry);
	}
}

// ── CLI Setup ─────────────────────────────────────

async function setupCli() {
	const { installCli } = await prompts({
		type: "confirm",
		name: "installCli",
		message: `Install ${chalk.cyan(AGENT_CLI_PKG)} globally?`,
		initial: true,
	});

	if (installCli) {
		const s = yoctoSpinner({
			text: `Installing ${AGENT_CLI_PKG}…`,
			color: "white",
		});
		s.start();
		try {
			execSync(`npm install -g ${AGENT_CLI_PKG}`, { stdio: "pipe" });
			s.success(`${AGENT_CLI_PKG} installed globally.`);
		} catch {
			s.stop();
			console.log(
				chalk.yellow("⚠ Could not install automatically. Run manually:"),
			);
			console.log(chalk.cyan(`  npm install -g ${AGENT_CLI_PKG}\n`));
		}
	} else {
		console.log(
			chalk.dim(`\n  To install later: npm install -g ${AGENT_CLI_PKG}\n`),
		);
	}

	await offerSkillInstall("agent-auth-cli");

	console.log(chalk.bold.white("\nUsage:"));
	console.log(chalk.gray("  # Discover a provider"));
	console.log(chalk.cyan("  auth-agent discover https://api.example.com"));
	console.log(chalk.gray("\n  # Search the registry for providers"));
	console.log(chalk.cyan(`  auth-agent search "send email"`));
	console.log(chalk.gray("\n  # Connect an agent with capabilities"));
	console.log(
		chalk.cyan(
			"  auth-agent connect --provider <url> --capabilities <cap1> <cap2>",
		),
	);
	console.log(chalk.gray("\n  # Execute a capability"));
	console.log(
		chalk.cyan(
			`  auth-agent execute <agent-id> <capability> --args '{"key":"value"}'`,
		),
	);
	console.log(chalk.gray("\n  # Run as MCP server"));
	console.log(chalk.cyan(`  auth-agent mcp`));

	showNextSteps([
		`${chalk.cyan("Docs")}    ${PROTOCOL_URL}/docs/integrate-client`,
		`${chalk.cyan("GitHub")}  https://github.com/better-auth/agent-auth`,
	]);

	console.log(
		chalk.green("\n✔ ") +
			chalk.bold("Ready. ") +
			"Run auth-agent --help to see all commands.\n",
	);
}

// ── Server Setup ──────────────────────────────────

async function setupServer() {
	const { source } = await prompts({
		type: "select",
		name: "source",
		message: "How do you want to define capabilities?",
		choices: [
			{
				title: "Default",
				value: "manual",
				description: "define capabilities in code",
			},
			{
				title: "From an OpenAPI spec",
				value: "openapi",
				description: "derive capabilities from an OpenAPI document",
			},
			{
				title: "From an MCP server",
				value: "mcp",
				description: "proxy an existing MCP server's tools",
			},
		],
	});
	check(source);

	const { name } = await prompts({
		type: "text",
		name: "name",
		message: "What's your service called?",
		validate: (v: string) => (v?.trim() ? true : "Name is required."),
	});
	check(name);

	const { description } = await prompts({
		type: "text",
		name: "description",
		message: `Short description ${chalk.dim("(press Enter to skip)")}`,
	});

	const desc = description?.trim() || undefined;

	let sourceUrl: string | undefined;
	if (source === "openapi") {
		const { url } = await prompts({
			type: "text",
			name: "url",
			message: `OpenAPI spec URL ${chalk.dim("(e.g. https://api.example.com/openapi.json)")}`,
			validate: (v: string) => (v?.trim() ? true : "URL is required."),
		});
		check(url);
		sourceUrl = url.trim();
	} else if (source === "mcp") {
		const { url } = await prompts({
			type: "text",
			name: "url",
			message: `MCP server URL ${chalk.dim("(e.g. https://api.example.com/mcp)")}`,
			validate: (v: string) => (v?.trim() ? true : "URL is required."),
		});
		check(url);
		sourceUrl = url.trim();
	}

	const code = generateServerCode(name.trim(), desc, source, sourceUrl);

	const { write } = await prompts({
		type: "confirm",
		name: "write",
		message: "Generate an auth config file?",
		initial: true,
	});

	if (write) {
		const { filePath } = await prompts({
			type: "text",
			name: "filePath",
			message: "File path",
			initial: "lib/auth.ts",
		});

		const target = filePath?.trim() || "lib/auth.ts";

		if (fs.existsSync(target)) {
			const { overwrite } = await prompts({
				type: "confirm",
				name: "overwrite",
				message: `${chalk.yellow(target)} already exists. Overwrite?`,
				initial: false,
			});

			if (!overwrite) {
				showCodeBlock(code, "auth config");
				showServerOutro();
				return;
			}
		}

		const dir = path.dirname(target);
		if (dir && dir !== "." && !fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(target, code);
		console.log(chalk.green(`\n✓ Created ${target}`));
	} else {
		showCodeBlock(code, "auth config");
	}

	showServerOutro();
}

function generateServerCode(
	name: string,
	description: string | undefined,
	source: string,
	sourceUrl: string | undefined,
): string {
	const descLine = description
		? `\n\t\t\tproviderDescription: ${JSON.stringify(description)},`
		: "";

	if (source === "openapi" && sourceUrl) {
		return `import { betterAuth } from "better-auth";
import { agentAuth } from "${AGENT_PLUGIN_PKG}";
import { createFromOpenAPI } from "${AGENT_PLUGIN_PKG}/openapi";

const spec = await fetch(${JSON.stringify(sourceUrl)}).then(r => r.json());

const openapi = createFromOpenAPI(spec, {
\tbaseUrl: ${JSON.stringify(sourceUrl.replace(/\/openapi\.json$|\/openapi\.yaml$|\/swagger\.json$|\/docs\/openapi$/, ""))},
});

export const auth = betterAuth({
\tplugins: [
\t\tagentAuth({
\t\t\tproviderName: ${JSON.stringify(name)},${descLine}
\t\t\t...openapi,
\t\t}),
\t],
});
`;
	}

	if (source === "mcp" && sourceUrl) {
		return `import { betterAuth } from "better-auth";
import { agentAuth } from "${AGENT_PLUGIN_PKG}";

export const auth = betterAuth({
\tplugins: [
\t\tagentAuth({
\t\t\tproviderName: ${JSON.stringify(name)},${descLine}
\t\t\tmcpServer: ${JSON.stringify(sourceUrl)},
\t\t}),
\t],
});
`;
	}

	return `import { betterAuth } from "better-auth";
import { agentAuth } from "${AGENT_PLUGIN_PKG}";

export const auth = betterAuth({
\tplugins: [
\t\tagentAuth({
\t\t\tproviderName: ${JSON.stringify(name)},${descLine}
\t\t\tcapabilities: [
\t\t\t\t{
\t\t\t\t\tname: "example",
\t\t\t\t\tdescription: "An example capability — replace with your own",
\t\t\t\t\tinput: {
\t\t\t\t\t\ttype: "object",
\t\t\t\t\t\tproperties: {
\t\t\t\t\t\t\tmessage: { type: "string", description: "Input message" },
\t\t\t\t\t\t},
\t\t\t\t\t},
\t\t\t\t},
\t\t\t],
\t\t\tasync onExecute({ capability, arguments: args }) {
\t\t\t\tswitch (capability) {
\t\t\t\t\tcase "example":
\t\t\t\t\t\treturn { message: \`Hello from \${(args as Record<string, string>).message}\` };
\t\t\t\t\tdefault:
\t\t\t\t\t\tthrow new Error(\`Unknown capability: \${capability}\`);
\t\t\t\t}
\t\t\t},
\t\t}),
\t],
});
`;
}

function showServerOutro() {
	console.log(chalk.bold.white("\nNext steps:\n"));
	console.log(chalk.white("  1. Install dependencies:"));
	console.log(chalk.cyan(`     npm install better-auth ${AGENT_PLUGIN_PKG}\n`));
	console.log(chalk.white("  2. Configure your database:"));
	console.log(
		chalk.gray(
			"     Better Auth needs a database to store agents, hosts, and grants.",
		),
	);
	console.log(
		chalk.cyan("     https://www.better-auth.com/docs/concepts/database\n"),
	);
	console.log(chalk.white("  3. Run database migrations:"));
	console.log(chalk.cyan("     npx auth migrate\n"));
	console.log(
		chalk.white("  4. Expose the discovery endpoint at your app root:"),
	);
	console.log(chalk.gray("     GET /.well-known/agent-configuration"));
	console.log(
		chalk.gray("     → return auth.api.getAgentConfiguration({ headers })\n"),
	);
	console.log(`  ${chalk.cyan("Docs")}    ${PROTOCOL_URL}/docs/build-server`);
	console.log(
		`  ${chalk.cyan("GitHub")}  https://github.com/better-auth/agent-auth`,
	);

	console.log(
		chalk.green("\n✔ ") +
			chalk.bold("Server scaffolded. ") +
			"Follow the steps above to finish setup.\n",
	);
}

// ── Helpers ───────────────────────────────────────

async function offerSkillInstall(skillName: string) {
	const { installSkill } = await prompts({
		type: "confirm",
		name: "installSkill",
		message: `Install the ${chalk.cyan(skillName)} skill for your coding agents?`,
		initial: true,
	});

	if (!installSkill) return;

	const cmd = `npx -y skills add ${SKILLS_REPO} --skill ${skillName}`;
	const s = yoctoSpinner({
		text: `Installing ${skillName} skill…`,
		color: "white",
	});
	s.start();
	try {
		execSync(cmd, { stdio: "pipe" });
		s.success(`${skillName} skill installed.`);
	} catch {
		s.stop();
		console.log(
			chalk.yellow("⚠ Could not install automatically. Run manually:"),
		);
		console.log(chalk.cyan(`  ${cmd}\n`));
	}
}

function buildMcpArgs(registry: string): string[] {
	const args = ["-y", AGENT_CLI_PKG, "mcp"];
	if (registry && registry !== DEFAULT_REGISTRY) {
		args.push("--registry-url", registry);
	}
	return args;
}

function getMcpConfigPath(
	tool: string,
	scope: "project" | "global",
): string | null {
	const home = os.homedir();
	switch (tool) {
		case "cursor":
			return scope === "global"
				? path.join(home, ".cursor", "mcp.json")
				: path.join(process.cwd(), ".cursor", "mcp.json");
		case "claude-desktop":
			if (process.platform === "win32")
				return path.join(
					process.env.APPDATA || home,
					"Claude",
					"claude_desktop_config.json",
				);
			if (process.platform === "darwin")
				return path.join(
					home,
					"Library",
					"Application Support",
					"Claude",
					"claude_desktop_config.json",
				);
			return path.join(home, ".config", "Claude", "claude_desktop_config.json");
		case "windsurf":
			return path.join(home, ".codeium", "windsurf", "mcp_config.json");
		case "vscode":
			return scope === "global"
				? null
				: path.join(process.cwd(), ".vscode", "mcp.json");
		default:
			return null;
	}
}

function writeMcpConfig(configPath: string, entry: McpEntry) {
	let config: Record<string, unknown> = {};
	if (fs.existsSync(configPath)) {
		try {
			config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		} catch {
			/* start fresh */
		}
	}
	const servers =
		(config.mcpServers as Record<string, unknown> | undefined) ?? {};
	servers["agent-auth"] = entry;
	config.mcpServers = servers;

	const dir = path.dirname(configPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

function displayPath(filePath: string, scope: "project" | "global"): string {
	if (scope === "project") {
		return path.relative(process.cwd(), filePath) || filePath;
	}
	return filePath.replace(os.homedir(), "~");
}

function showJsonConfig(entry: McpEntry) {
	const json = JSON.stringify({ mcpServers: { "agent-auth": entry } }, null, 2);
	console.log(chalk.bold.white("\nAdd to your MCP configuration:\n"));
	console.log(
		json
			.split("\n")
			.map((line) => chalk.cyan(`  ${line}`))
			.join("\n"),
	);
	console.log();
}

function showCodeBlock(code: string, title: string) {
	console.log(chalk.bold.white(`\n${title}:\n`));
	console.log(
		code
			.split("\n")
			.map((line) => chalk.dim(`  ${line}`))
			.join("\n"),
	);
}

function showNextSteps(lines: string[]) {
	console.log(chalk.bold.white("\nLearn more:\n"));
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}

// ── Export ─────────────────────────────────────────

export const ai = new Command("ai")
	.description("Interactive setup for Agent Auth — AI agent authentication")
	.action(aiAction);
