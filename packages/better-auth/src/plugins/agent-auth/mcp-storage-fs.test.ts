import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateAgentKeypair } from "./crypto";
import { createFileStorage } from "./mcp-storage-fs";

describe("file storage encryption", () => {
	const tmpDir = path.join(os.tmpdir(), `ba-test-${Date.now()}`);

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should encrypt keypairs at rest and decrypt on read", async () => {
		const storage = createFileStorage({
			directory: tmpDir,
			encryptionKey: "test-secret-key-32chars-minimum!",
		});

		const keypair = await generateAgentKeypair();
		const agentId = "test-agent-enc";

		await storage.saveConnection(agentId, {
			appUrl: "https://example.com",
			keypair,
			name: "Test Agent",
			scopes: ["read"],
		});

		const raw = fs.readFileSync(
			path.join(tmpDir, "connections", `${agentId}.json`),
			"utf-8",
		);
		const parsed = JSON.parse(raw);

		expect(typeof parsed.keypair).toBe("string");
		expect(parsed.keypair).toMatch(/^enc:/);
		expect(parsed.keypair).not.toContain(keypair.kid);

		const connection = await storage.getConnection(agentId);
		expect(connection).not.toBeNull();
		expect(connection!.keypair.kid).toBe(keypair.kid);
		expect(connection!.keypair.privateKey).toEqual(keypair.privateKey);
		expect(connection!.keypair.publicKey).toEqual(keypair.publicKey);
	});

	it("should read unencrypted files without encryption key", async () => {
		const plainStorage = createFileStorage({ directory: tmpDir });
		const keypair = await generateAgentKeypair();
		const agentId = "test-agent-plain";

		await plainStorage.saveConnection(agentId, {
			appUrl: "https://example.com",
			keypair,
			name: "Plain Agent",
			scopes: ["read"],
		});

		const connection = await plainStorage.getConnection(agentId);
		expect(connection).not.toBeNull();
		expect(connection!.keypair.kid).toBe(keypair.kid);
	});

	it("should read unencrypted files when encryption key is set (migration)", async () => {
		const plainStorage = createFileStorage({ directory: tmpDir });
		const keypair = await generateAgentKeypair();
		const agentId = "test-agent-migrate";

		await plainStorage.saveConnection(agentId, {
			appUrl: "https://example.com",
			keypair,
			name: "Migration Agent",
			scopes: ["read"],
		});

		const encStorage = createFileStorage({
			directory: tmpDir,
			encryptionKey: "migration-key-test",
		});

		const connection = await encStorage.getConnection(agentId);
		expect(connection).not.toBeNull();
		expect(connection!.keypair.kid).toBe(keypair.kid);
		expect(connection!.keypair.privateKey).toEqual(keypair.privateKey);
	});

	it("should throw when reading encrypted file without key", async () => {
		const encStorage = createFileStorage({
			directory: tmpDir,
			encryptionKey: "throw-test-key",
		});
		const keypair = await generateAgentKeypair();
		const agentId = "test-agent-nokey";

		await encStorage.saveConnection(agentId, {
			appUrl: "https://example.com",
			keypair,
			name: "NoKey Agent",
			scopes: [],
		});

		const noKeyStorage = createFileStorage({ directory: tmpDir });

		await expect(noKeyStorage.getConnection(agentId)).rejects.toThrow(
			"encrypted but no encryptionKey",
		);
	});
});
