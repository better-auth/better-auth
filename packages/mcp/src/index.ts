#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSetupAuth } from "./tools/index.js";

const server = new McpServer({
	name: "better-auth",
	description:
		"Better Auth MCP server for AI-powered auth setup and diagnostics",
	version: process.env.BETTER_AUTH_VERSION!,
});

registerSetupAuth(server);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch(console.error);
