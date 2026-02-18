/**
 * File-based MCPAgentStorage implementation.
 *
 * Stores each agent connection as a separate JSON file in a
 * `connections/` directory. Private key files are chmod 0o600.
 *
 * Directory structure:
 *   ~/.better-auth/agents/
 *     connections/
 *       <agentId>.json   — { appUrl, keypair, name, scopes, connectedAt }
 *     pending-flows.json — { "<appUrl>": { deviceCode, clientId, name, scopes } }
 *
 * Every new agent requires explicit user approval via device auth.
 *
 * This module uses Node.js APIs and is intended for server-side /
 * CLI / MCP-server usage only.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentKeypair, MCPAgentStorage } from "./mcp-tools";

interface StoredConnection {
	appUrl: string;
	keypair: {
		privateKey: Record<string, unknown>;
		publicKey: Record<string, unknown>;
		kid: string;
	};
	name: string;
	scopes: string[];
	connectedAt: string;
}

export interface FileStorageOptions {
	/** Custom directory for storing agent data. Default: ~/.better-auth/agents */
	directory?: string;
}

function defaultDir(): string {
	return path.join(os.homedir(), ".better-auth", "agents");
}

export function createFileStorage(
	options?: FileStorageOptions,
): MCPAgentStorage {
	const dir = options?.directory ?? defaultDir();
	const connectionsDir = path.join(dir, "connections");
	const pendingFlowsFile = path.join(dir, "pending-flows.json");

	function ensureDir(d: string) {
		if (!fs.existsSync(d)) {
			fs.mkdirSync(d, { recursive: true });
		}
	}

	function readJSON<T>(filePath: string): T | null {
		try {
			const data = fs.readFileSync(filePath, "utf-8");
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}

	function writeJSON(filePath: string, data: unknown, secret = false) {
		ensureDir(path.dirname(filePath));
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
		if (secret) {
			fs.chmodSync(filePath, 0o600);
		}
	}

	function connectionFile(agentId: string): string {
		const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, "_");
		return path.join(connectionsDir, `${safe}.json`);
	}

	return {
		async getConnection(agentId) {
			const stored = readJSON<StoredConnection>(connectionFile(agentId));
			if (!stored) return null;
			return {
				appUrl: stored.appUrl,
				keypair: stored.keypair as AgentKeypair,
				name: stored.name,
				scopes: stored.scopes,
			};
		},

		async saveConnection(agentId, connection) {
			const stored: StoredConnection = {
				appUrl: connection.appUrl,
				keypair: connection.keypair,
				name: connection.name,
				scopes: connection.scopes,
				connectedAt: new Date().toISOString(),
			};
			writeJSON(connectionFile(agentId), stored, true);
		},

		async removeConnection(agentId) {
			const file = connectionFile(agentId);
			try {
				fs.unlinkSync(file);
			} catch {
				// File may not exist
			}
		},

		async listConnections() {
			ensureDir(connectionsDir);
			const result: Array<{
				agentId: string;
				appUrl: string;
				name: string;
				scopes: string[];
			}> = [];

			let files: string[];
			try {
				files = fs.readdirSync(connectionsDir);
			} catch {
				return result;
			}

			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const agentId = file.replace(/\.json$/, "");
				const stored = readJSON<StoredConnection>(
					path.join(connectionsDir, file),
				);
				if (stored) {
					result.push({
						agentId,
						appUrl: stored.appUrl,
						name: stored.name,
						scopes: stored.scopes,
					});
				}
			}

			return result;
		},

		async savePendingFlow(appUrl, flow) {
			const flows = readJSON<Record<string, unknown>>(pendingFlowsFile) ?? {};
			flows[appUrl] = flow;
			writeJSON(pendingFlowsFile, flows);
		},

		async getPendingFlow(appUrl) {
			const flows =
				readJSON<
					Record<
						string,
						{
							deviceCode: string;
							clientId: string;
							name: string;
							scopes: string[];
						}
					>
				>(pendingFlowsFile) ?? {};
			return flows[appUrl] ?? null;
		},

		async removePendingFlow(appUrl) {
			const flows = readJSON<Record<string, unknown>>(pendingFlowsFile) ?? {};
			delete flows[appUrl];
			writeJSON(pendingFlowsFile, flows);
		},
	};
}
