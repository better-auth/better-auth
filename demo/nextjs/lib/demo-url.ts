/**
 * Public URLs the auth server and the MCP route must agree on: JWT issuer,
 * token audience, protected-resource metadata, and the organization claim.
 * Server-only: `BETTER_AUTH_URL` is not exposed to the client bundle.
 */
export const baseURL =
	process.env.BETTER_AUTH_URL || "https://demo.better-auth.com";

export const mcpResource = `${baseURL}/api/mcp`;

export const organizationClaim = `${baseURL}/org`;
