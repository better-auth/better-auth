import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { base64 } from "@better-auth/utils/base64";
import chalk from "chalk";
import { Command } from "commander";

interface MCPOptions {
	cursor?: boolean;
	claudeCode?: boolean;
	openCode?: boolean;
	manual?: boolean;
	localOnly?: boolean;
	remoteOnly?: boolean;
}

const REMOTE_MCP_URL =
	"https://mcp.chonkie.ai/better-auth/better-auth-builder/mcp";
const LOCAL_MCP_COMMAND = "npx @better-auth/mcp";

async function mcpAction(options: MCPOptions) {
	const installLocal = !options.remoteOnly;
	const installRemote = !options.localOnly;

	if (options.cursor) {
		await handleCursorAction(installLocal, installRemote);
	} else if (options.claudeCode) {
		handleClaudeCodeAction(installLocal, installRemote);
	} else if (options.openCode) {
		handleOpenCodeAction(installLocal, installRemote);
	} else if (options.manual) {
		handleManualAction(installLocal, installRemote);
	} else {
		showAllOptions();
	}
}

export async function installMcpServers(
	client: "cursor" | "claude-code" | "open-code" | "manual" | string,
	installLocal: boolean = true,
	installRemote: boolean = true
) {
	switch (client) {
		case "cursor":
			await handleCursorAction(installLocal, installRemote);
			break;
		case "claude-code":
			handleClaudeCodeAction(installLocal, installRemote);
			break;
		case "open-code":
			handleOpenCodeAction(installLocal, installRemote);
			break;
		case "manual":
			handleManualAction(installLocal, installRemote);
			break;
	}
}

async function handleCursorAction(installLocal: boolean, installRemote: boolean) {
	console.log(chalk.bold.blue("🚀 Adding Better Auth MCP to Cursor..."));

	const platform = os.platform();
	let openCommand: string;

	switch (platform) {
		case "darwin":
			openCommand = "open";
			break;
		case "win32":
			openCommand = "start";
			break;
		case "linux":
			openCommand = "xdg-open";
			break;
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}

	const installed: string[] = [];

	if (installRemote) {
		const remoteConfig = { url: REMOTE_MCP_URL };
		const encodedRemote = base64.encode(
			new TextEncoder().encode(JSON.stringify(remoteConfig))
		);
		const remoteDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent("better-auth-docs")}&config=${encodedRemote}`;

		try {
			const cmd =
				platform === "win32"
					? `start "" "${remoteDeeplink}"`
					: `${openCommand} "${remoteDeeplink}"`;
			execSync(cmd, { stdio: "inherit" });
			installed.push("better-auth-docs (remote - documentation & search)");
		} catch {
			console.log(
				chalk.yellow(
					"\n⚠ Could not automatically open Cursor for remote MCP."
				)
			);
		}
	}

	if (installLocal) {
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const localConfig = { command: LOCAL_MCP_COMMAND };
		const encodedLocal = base64.encode(
			new TextEncoder().encode(JSON.stringify(localConfig))
		);
		const localDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent("better-auth")}&config=${encodedLocal}`;

		try {
			const cmd =
				platform === "win32"
					? `start "" "${localDeeplink}"`
					: `${openCommand} "${localDeeplink}"`;
			execSync(cmd, { stdio: "inherit" });
			installed.push("better-auth (local - setup & diagnostics)");
		} catch {
			console.log(
				chalk.yellow("\n⚠ Could not automatically open Cursor for local MCP.")
			);
		}
	}

	if (installed.length > 0) {
		console.log(chalk.green("\n✓ Cursor MCP servers installed:"));
		for (const name of installed) {
			console.log(chalk.green(`  • ${name}`));
		}
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(
		chalk.gray("• The MCP servers will be added to your Cursor configuration")
	);
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Cursor")
	);
	console.log(
		chalk.gray('• Try: "Set up Better Auth with Google login" or "Help me debug my auth"')
	);
}

function handleClaudeCodeAction(installLocal: boolean, installRemote: boolean) {
	console.log(chalk.bold.blue("🤖 Adding Better Auth MCP to Claude Code..."));

	const commands: string[] = [];

	if (installRemote) {
		commands.push(
			`claude mcp add --transport http better-auth-docs ${REMOTE_MCP_URL}`
		);
	}
	if (installLocal) {
		commands.push(`claude mcp add better-auth -- ${LOCAL_MCP_COMMAND}`);
	}

	for (const command of commands) {
		try {
			execSync(command, { stdio: "inherit" });
		} catch {
			console.log(
				chalk.yellow(
					"\n⚠ Could not automatically add to Claude Code. Please run this command manually:"
				)
			);
			console.log(chalk.cyan(command));
		}
	}

	console.log(chalk.green("\n✓ Claude Code MCP configured!"));
	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(
		chalk.gray(
			"• The MCP servers will be added to your Claude Code configuration"
		)
	);
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Claude Code")
	);
}

function handleOpenCodeAction(installLocal: boolean, installRemote: boolean) {
	console.log(chalk.bold.blue("🔧 Adding Better Auth MCP to Open Code..."));

	const mcpConfig: Record<string, unknown> = {};

	if (installRemote) {
		mcpConfig["better-auth-docs"] = {
			type: "remote",
			url: REMOTE_MCP_URL,
			enabled: true,
		};
	}

	if (installLocal) {
		mcpConfig["better-auth"] = {
			type: "stdio",
			command: LOCAL_MCP_COMMAND,
			enabled: true,
		};
	}

	const openCodeConfig = {
		$schema: "https://opencode.ai/config.json",
		mcp: mcpConfig,
	};

	const configPath = path.join(process.cwd(), "opencode.json");

	try {
		let existingConfig: {
			mcp?: Record<string, unknown>;
			[key: string]: unknown;
		} = {};
		if (fs.existsSync(configPath)) {
			const existingContent = fs.readFileSync(configPath, "utf8");
			existingConfig = JSON.parse(existingContent);
		}

		const mergedConfig = {
			...existingConfig,
			...openCodeConfig,
			mcp: {
				...existingConfig.mcp,
				...openCodeConfig.mcp,
			},
		};

		fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
		console.log(
			chalk.green(`\n✓ Open Code configuration written to ${configPath}`)
		);
		console.log(chalk.green("✓ Better Auth MCP servers added successfully!"));
	} catch {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically write opencode.json. Please add this configuration manually:"
			)
		);
		console.log(chalk.cyan(JSON.stringify(openCodeConfig, null, 2)));
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• Restart Open Code to load the new MCP servers"));
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Open Code")
	);
}

function handleManualAction(installLocal: boolean, installRemote: boolean) {
	console.log(chalk.bold.blue("📝 Better Auth MCP Configuration..."));

	const manualConfig: Record<string, unknown> = {};

	if (installRemote) {
		manualConfig["better-auth-docs"] = {
			url: REMOTE_MCP_URL,
		};
	}

	if (installLocal) {
		manualConfig["better-auth"] = {
			command: LOCAL_MCP_COMMAND,
		};
	}

	const configPath = path.join(process.cwd(), "mcp.json");

	try {
		let existingConfig = {};
		if (fs.existsSync(configPath)) {
			const existingContent = fs.readFileSync(configPath, "utf8");
			existingConfig = JSON.parse(existingContent);
		}

		const mergedConfig = {
			...existingConfig,
			...manualConfig,
		};

		fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
		console.log(chalk.green(`\n✓ MCP configuration written to ${configPath}`));
		console.log(chalk.green("✓ Better Auth MCP servers added successfully!"));
	} catch {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically write mcp.json. Please add this configuration manually:"
			)
		);
		console.log(chalk.cyan(JSON.stringify(manualConfig, null, 2)));
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• Restart your MCP client to load the new servers"));
	console.log(
		chalk.gray(
			"• You can now use Better Auth features directly in your MCP client"
		)
	);
}

function showAllOptions() {
	console.log(chalk.bold.blue("🔌 Better Auth MCP Servers"));
	console.log(chalk.gray("Choose your MCP client to get started:"));
	console.log();

	console.log(chalk.bold.white("MCP Clients:"));
	console.log(chalk.cyan("  --cursor      ") + chalk.gray("Add to Cursor"));
	console.log(
		chalk.cyan("  --claude-code ") + chalk.gray("Add to Claude Code")
	);
	console.log(chalk.cyan("  --open-code   ") + chalk.gray("Add to Open Code"));
	console.log(
		chalk.cyan("  --manual      ") + chalk.gray("Manual configuration")
	);
	console.log();

	console.log(chalk.bold.white("Server Selection:"));
	console.log(
		chalk.cyan("  --local-only  ") +
			chalk.gray("Install only local MCP (setup & diagnostics)")
	);
	console.log(
		chalk.cyan("  --remote-only ") +
			chalk.gray("Install only remote MCP (documentation & search)")
	);
	console.log(chalk.gray("  (default: install both servers)"));
	console.log();

	console.log(chalk.bold.white("Servers:"));
	console.log(
		chalk.gray("  • ") +
			chalk.white("better-auth") +
			chalk.gray(" (local) - Setup auth, diagnose issues, validate config")
	);
	console.log(
		chalk.gray("  • ") +
			chalk.white("better-auth-docs") +
			chalk.gray(" (remote) - Search documentation, code examples")
	);
	console.log();
}

export const mcp = new Command("mcp")
	.description("Add Better Auth MCP servers to MCP Clients")
	.option("--cursor", "Automatically open Cursor with the MCP configuration")
	.option("--claude-code", "Show Claude Code MCP configuration command")
	.option("--open-code", "Show Open Code MCP configuration")
	.option("--manual", "Show manual MCP configuration for mcp.json")
	.option("--local-only", "Install only local MCP server (setup & diagnostics)")
	.option(
		"--remote-only",
		"Install only remote MCP server (documentation & search)"
	)
	.action(mcpAction);
