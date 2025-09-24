import { Command } from "commander";
import { execSync } from "child_process";
import * as os from "os";
import chalk from "chalk";
import { base64 } from "@better-auth/utils/base64";

interface MCPOptions {
	cursor?: boolean;
	claudeCode?: boolean;
	openCode?: boolean;
	manual?: boolean;
}

export async function mcpAction(options: MCPOptions) {
	const mcpUrl = "https://mcp.chonkie.ai/better-auth/better-auth-builder/mcp";
	const mcpName = "Better Auth";

	if (options.cursor) {
		await handleCursorAction(mcpUrl, mcpName);
	} else if (options.claudeCode) {
		handleClaudeCodeAction(mcpUrl);
	} else if (options.openCode) {
		handleOpenCodeAction(mcpUrl);
	} else if (options.manual) {
		handleManualAction(mcpUrl, mcpName);
	} else {
		showAllOptions(mcpUrl, mcpName);
	}
}

async function handleCursorAction(mcpUrl: string, mcpName: string) {
	const mcpConfig = {
		url: mcpUrl,
	};

	const encodedConfig = base64.encode(
		new TextEncoder().encode(JSON.stringify(mcpConfig)),
	);
	const deeplinkUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(mcpName)}&config=${encodedConfig}`;

	console.log(chalk.bold.blue("🚀 Adding Better Auth MCP to Cursor..."));

	try {
		const platform = os.platform();
		let command: string;

		switch (platform) {
			case "darwin":
				command = `open "${deeplinkUrl}"`;
				break;
			case "win32":
				command = `start "" "${deeplinkUrl}"`;
				break;
			case "linux":
				command = `xdg-open "${deeplinkUrl}"`;
				break;
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}

		execSync(command, { stdio: "inherit" });
		console.log(chalk.green("\n✓ Cursor MCP installed successfully!"));
	} catch (error) {
		console.log(
			chalk.yellow(
				"\n⚠ Could not automatically open Cursor. Please copy the deeplink URL above and open it manually.",
			),
		);
		console.log(
			chalk.gray(
				"\nYou can also manually add this configuration to your Cursor MCP settings:",
			),
		);
		console.log(chalk.gray(JSON.stringify(mcpConfig, null, 2)));
	}

	console.log(chalk.bold.white("\n✨ Next Steps:"));
	console.log(
		chalk.gray("• The MCP server will be added to your Cursor configuration"),
	);
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Cursor"),
	);
}

function handleClaudeCodeAction(mcpUrl: string) {
	console.log(chalk.bold.blue("🤖 Claude Code MCP Configuration"));
	console.log(chalk.gray("Run this command in your terminal:"));
	console.log();
	console.log(
		chalk.cyan(`claude mcp add --transport http better-auth ${mcpUrl}`),
	);
	console.log();
	console.log(chalk.bold.white("✨ Next Steps:"));
	console.log(chalk.gray("• Run the command above in your terminal"));
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

function handleOpenCodeAction(mcpUrl: string) {
	console.log(chalk.bold.blue("🔧 Open Code MCP Configuration"));
	console.log(chalk.gray("Add this configuration to your opencode.json file:"));
	console.log();

	const openCodeConfig = {
		$schema: "https://opencode.ai/config.json",
		mcp: {
			"Better Auth": {
				type: "remote",
				url: mcpUrl,
				enabled: true,
			},
		},
	};

	console.log(chalk.cyan(JSON.stringify(openCodeConfig, null, 2)));
	console.log();
	console.log(chalk.bold.white("✨ Next Steps:"));
	console.log(
		chalk.gray("• Add the configuration above to your opencode.json file"),
	);
	console.log(chalk.gray("• Restart Open Code to load the new MCP server"));
	console.log(
		chalk.gray("• You can now use Better Auth features directly in Open Code"),
	);
}

function handleManualAction(mcpUrl: string, mcpName: string) {
	console.log(chalk.bold.blue("📝 Manual MCP Configuration"));
	console.log(chalk.gray("Add this configuration to your mcp.json file:"));
	console.log();

	const manualConfig = {
		[mcpName]: {
			url: mcpUrl,
		},
	};

	console.log(chalk.cyan(JSON.stringify(manualConfig, null, 2)));
	console.log();
	console.log(chalk.bold.white("✨ Next Steps:"));
	console.log(
		chalk.gray("• Add the configuration above to your mcp.json file"),
	);
	console.log(chalk.gray("• Restart your MCP client to load the new server"));
	console.log(
		chalk.gray(
			"• You can now use Better Auth features directly in your MCP client",
		),
	);
}

function showAllOptions(mcpUrl: string, mcpName: string) {
	console.log(chalk.bold.blue("🔌 Better Auth MCP Server"));
	console.log(chalk.gray("Choose your MCP client to get started:"));
	console.log();

	console.log(chalk.bold.white("Available Commands:"));
	console.log(chalk.cyan("  --cursor      ") + chalk.gray("Add to Cursor"));
	console.log(
		chalk.cyan("  --claude-code ") + chalk.gray("Add to Claude Code"),
	);
	console.log(chalk.cyan("  --open-code   ") + chalk.gray("Add to Open Code"));
	console.log(
		chalk.cyan("  --manual      ") + chalk.gray("Manual configuration"),
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
