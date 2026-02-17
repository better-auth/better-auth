/**
 * File-based MCPAgentStorage implementation.
 *
 * Stores keypairs and connections in `~/.better-auth/agents/`.
 * Private key files are chmod 0o600 (owner-only).
 *
 * This module uses Node.js APIs and is intended for server-side /
 * CLI / MCP-server usage only.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MCPAgentStorage } from "./mcp-tools";

interface StoredKeypair {
	privateKey: Record<string, unknown>;
	publicKey: Record<string, unknown>;
	kid: string;
	createdAt: string;
}

interface StoredConnection {
	appUrl: string;
	agentId: string;
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
	const keypairFile = path.join(dir, "keypair.json");
	const connectionsFile = path.join(dir, "connections.json");
	const pendingFlowsFile = path.join(dir, "pending-flows.json");

	function ensureDir() {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
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
		ensureDir();
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
		if (secret) {
			fs.chmodSync(filePath, 0o600);
		}
	}

	return {
		async getKeypair() {
			const stored = readJSON<StoredKeypair>(keypairFile);
			if (!stored) return null;
			return {
				privateKey: stored.privateKey,
				publicKey: stored.publicKey,
				kid: stored.kid,
			};
		},

		async saveKeypair(keypair) {
			const stored: StoredKeypair = {
				...keypair,
				createdAt: new Date().toISOString(),
			};
			writeJSON(keypairFile, stored, true);
		},

		async getConnection(appUrl) {
			const connections = readJSON<StoredConnection[]>(connectionsFile);
			if (!connections) return null;
			const found = connections.find((c) => c.appUrl === appUrl);
			if (!found) return null;
			return {
				agentId: found.agentId,
				name: found.name,
				scopes: found.scopes,
			};
		},

		async saveConnection(appUrl, connection) {
			const connections = readJSON<StoredConnection[]>(connectionsFile) ?? [];
			const idx = connections.findIndex((c) => c.appUrl === appUrl);
			const entry: StoredConnection = {
				appUrl,
				...connection,
				connectedAt: new Date().toISOString(),
			};
			if (idx >= 0) {
				connections[idx] = entry;
			} else {
				connections.push(entry);
			}
			writeJSON(connectionsFile, connections);
		},

		async removeConnection(appUrl) {
			const connections = readJSON<StoredConnection[]>(connectionsFile) ?? [];
			const updated = connections.filter((c) => c.appUrl !== appUrl);
			writeJSON(connectionsFile, updated);
		},

		async listConnections() {
			const connections = readJSON<StoredConnection[]>(connectionsFile) ?? [];
			return connections.map((c) => ({
				appUrl: c.appUrl,
				agentId: c.agentId,
				name: c.name,
				scopes: c.scopes,
			}));
		},

		async savePendingFlow(appUrl, flow) {
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
