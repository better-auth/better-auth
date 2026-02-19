/**
 * Scope namespacing utilities for the MCP Gateway.
 *
 * Scopes use "provider.tool" or "provider.*" format:
 *   - "google-drive.list_files" — grants access to one tool
 *   - "google-drive.*" — grants access to all tools on that provider
 *   - "*" — grants access to all providers and tools
 *
 * When a provider defines toolScopes, compound scopes are supported:
 *   - "google-drive.read" → maps to ["list_files", "read_file"] via toolScopes config
 */

import type { MCPProviderConfig } from "../types";

/**
 * Check whether an agent's granted scopes allow calling a namespaced tool.
 */
export function isScopeAllowed(
	agentScopes: string[],
	providerName: string,
	toolName: string,
	providerConfig?: MCPProviderConfig,
): boolean {
	for (const scope of agentScopes) {
		if (scope === "*") return true;

		if (scope === `${providerName}.*`) return true;

		if (scope === `${providerName}.${toolName}`) return true;

		// Check toolScopes mapping: "google-drive.read" → ["list_files", "read_file"]
		if (providerConfig?.toolScopes) {
			const dotIdx = scope.indexOf(".");
			if (dotIdx !== -1) {
				const scopeProvider = scope.slice(0, dotIdx);
				const scopeSuffix = scope.slice(dotIdx + 1);
				if (
					scopeProvider === providerName &&
					providerConfig.toolScopes[scopeSuffix]?.includes(toolName)
				) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Given an agent's scopes and available providers, return the list of
 * namespaced tool names the agent is allowed to call.
 */
export function getAllowedTools(
	agentScopes: string[],
	providers: Map<string, { config: MCPProviderConfig; toolNames: string[] }>,
): string[] {
	const allowed: string[] = [];

	for (const [providerName, { config, toolNames }] of providers) {
		for (const toolName of toolNames) {
			if (isScopeAllowed(agentScopes, providerName, toolName, config)) {
				allowed.push(`${providerName}.${toolName}`);
			}
		}
	}

	return allowed;
}
