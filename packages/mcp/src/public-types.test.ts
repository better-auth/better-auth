import type {
	McpProtectedRequestHandlerOptions,
	RequireMcpAuthOptions,
} from "@better-auth/mcp";
import { describe, expect, expectTypeOf, it } from "vitest";
import mcpPackage from "../package.json";
import * as mcpExports from "./index";

describe("public MCP surface", () => {
	it("exports the protected-request vocabulary from the package root", () => {
		expect(mcpExports).toHaveProperty("createMcpProtectedRequestHandler");
		expect(mcpExports).toHaveProperty("requireMcpAuth");
		expect(mcpExports).not.toHaveProperty("mcpHandler");
		expectTypeOf<
			McpProtectedRequestHandlerOptions["issuer"]
		>().toEqualTypeOf<string>();
		expectTypeOf<
			McpProtectedRequestHandlerOptions["audience"]
		>().toEqualTypeOf<string>();
		expectTypeOf<McpProtectedRequestHandlerOptions>().toHaveProperty(
			"jwtVerifyOptions",
		);
		expectTypeOf<McpProtectedRequestHandlerOptions>().toHaveProperty(
			"challengeScopes",
		);
		expectTypeOf<McpProtectedRequestHandlerOptions>().not.toHaveProperty(
			"verifyOptions",
		);
		expectTypeOf<RequireMcpAuthOptions>().toHaveProperty("requiredScopes");
	});

	it("publishes no Better Auth MCP client or adapter subpath", () => {
		expect(mcpPackage.exports).not.toHaveProperty("./client");
		expect(mcpPackage.exports).not.toHaveProperty("./client/adapters");
		expect(mcpPackage.typesVersions["*"]).not.toHaveProperty("client");
		expect(mcpPackage.typesVersions["*"]).not.toHaveProperty("client/adapters");
	});
});
