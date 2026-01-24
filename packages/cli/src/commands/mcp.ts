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
}

const REMOTE_MCP_URL = "https://mcp.inkeep.com/better-auth/mcp";

async function mcpAction(options: MCPOptions) {
	if (options.cursor) {
		await handleCursorAction();
	} else if (options.claudeCode) {
		handleClaudeCodeAction();
	} else if (options.openCode) {
		handleOpenCodeAction();
	} else if (options.manual) {
		handleManualAction();
	} else {
		showAllOptions();
	}
}

async function handleCursorAction() {
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

	const remoteConfig = { url: REMOTE_MCP_URL };
	const encodedRemote = base64.encode(
		new TextEncoder().encode(JSON.stringify(remoteConfig)),
	);
	const remoteDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent("better-auth")}&config=${encodedRemote}`;

	try {
		const cmd =
			platform === "win32"
				? `start "" "${remoteDeeplink}"`
				: `${openCommand} "${remoteDeeplink}"`;
		execSync(cmd, { stdio: "inherit" });
		console.log(chalk.green("\n✓ Better Auth MCP server installed!"));
	} catch {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically open Cursor for MCP installation.",
			),
		);
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(
		chalk.gray("• The MCP server will be added to your Cursor configuration"),
	);
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Cursor"),
	);
	console.log(
		chalk.gray(
			'• Try: "Set up Better Auth with Google login" or "Help me debug my auth"',
		),
	);
}

function handleClaudeCodeAction() {
	console.log(chalk.bold.blue("🤖 Adding Better Auth MCP to Claude Code..."));

	const command = `claude mcp add --transport http better-auth ${REMOTE_MCP_URL}`;

	try {
		execSync(command, { stdio: "inherit" });
		console.log(chalk.green("\n✓ Claude Code MCP configured!"));
	} catch {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically add to Claude Code. Please run this command manually:",
			),
		);
		console.log(chalk.cyan(command));
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(
		chalk.gray(
			"• The MCP server will be added to your Claude Code configuration",
		),
	);
	console.log(
		chalk.gray(
			"• You can now use Better Auth features directly in Claude Code",
		),
	);
}

function handleOpenCodeAction() {
	console.log(chalk.bold.blue("🔧 Adding Better Auth MCP to Open Code..."));

	const openCodeConfig = {
		$schema: "https://opencode.ai/config.json",
		mcp: {
		"better-auth": {
			type: "remote",
			url: REMOTE_MCP_URL,
			enabled: true,
		},
		},
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
			chalk.green(`\n✓ Open Code configuration written to ${configPath}`),
		);
		console.log(chalk.green("✓ Better Auth MCP server added successfully!"));
	} catch {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically write opencode.json. Please add this configuration manually:",
			),
		);
		console.log(chalk.cyan(JSON.stringify(openCodeConfig, null, 2)));
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• Restart Open Code to load the new MCP server"));
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Open Code"),
	);
}

function handleManualAction() {
	console.log(chalk.bold.blue("📝 Better Auth MCP Configuration..."));

	const manualConfig = {
		"better-auth": {
			url: REMOTE_MCP_URL,
		},
	};

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
		console.log(chalk.green("✓ Better Auth MCP server added successfully!"));
	} catch {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically write mcp.json. Please add this configuration manually:",
			),
		);
		console.log(chalk.cyan(JSON.stringify(manualConfig, null, 2)));
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(chalk.gray("• Restart your MCP client to load the new server"));
	console.log(
		chalk.gray(
			"• You can now use Better Auth features directly in your MCP client",
		),
	);
}

function showAllOptions() {
	console.log(chalk.bold.blue("🔌 Better Auth MCP Server"));
	console.log(chalk.gray("Choose your MCP client to get started:"));
	console.log();

	console.log(chalk.bold.white("MCP Clients:"));
	console.log(chalk.cyan("  --cursor      ") + chalk.gray("Add to Cursor"));
	console.log(
		chalk.cyan("  --claude-code ") + chalk.gray("Add to Claude Code"),
	);
	console.log(chalk.cyan("  --open-code   ") + chalk.gray("Add to Open Code"));
	console.log(
		chalk.cyan("  --manual      ") + chalk.gray("Manual configuration"),
	);
	console.log();

	console.log(chalk.bold.white("Server:"));
	console.log(
		chalk.gray("  • ") +
			chalk.white("better-auth") +
			chalk.gray(" - Search documentation, code examples, setup assistance"),
	);
	console.log();
}

export const mcp = new Command("mcp")
	.description("Add Better Auth MCP server to MCP Clients")
	.option("--cursor", "Automatically open Cursor with the MCP configuration")
	.option("--claude-code", "Show Claude Code MCP configuration command")
	.option("--open-code", "Show Open Code MCP configuration")
	.option("--manual", "Show manual MCP configuration for mcp.json")
	.action(mcpAction);
