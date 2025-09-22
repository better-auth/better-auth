import { Command } from "commander";
import { execSync } from "child_process";
import * as os from "os";
import chalk from "chalk";

interface MCPOptions {
	cursor?: boolean;
}

export async function mcpAction(options: MCPOptions) {
	const mcpUrl = "https://bt-mcp-vercel.vercel.app/api/mcp";
	const mcpName = "better-auth";

	const mcpConfig = {
		url: mcpUrl,
	};

	const encodedConfig = Buffer.from(JSON.stringify(mcpConfig)).toString(
		"base64",
	);

	const deeplinkUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${mcpName}&config=${encodedConfig}`;

	if (options.cursor) {
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
			console.log(
				chalk.green("\n✓ Cursor MCP install dialog opened successfully!"),
			);
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
	} else {
		console.log(chalk.bold.white("\n📝 Manual Installation:"));
		console.log(chalk.gray("1. Copy the deeplink URL above"));
		console.log(chalk.gray("2. Open it in your browser or paste it in Cursor"));
		console.log(
			chalk.gray(
				"3. Or manually add the configuration to your Cursor MCP settings",
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

	console.log();
}

export const mcp = new Command("mcp")
	.description("Add Better Auth MCP server to MCP Clients")
	.option("--cursor", "Automatically open Cursor with the MCP configuration")
	.action(mcpAction);
