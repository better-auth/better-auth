import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";

const CONFIG_DIR = path.join(os.homedir(), ".better-auth");
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");

export function formatUserCode(code: string): string {
	if (code.length === 8) {
		return `${code.slice(0, 4)}-${code.slice(4)}`;
	}
	return code;
}

export async function storeToken(token: {
	access_token: string;
	token_type?: string;
	scope?: string;
}): Promise<void> {
	try {
		await fs.mkdir(CONFIG_DIR, { recursive: true });
		const existing = await getStoredToken();
		const tokenData: StoredToken = {
			access_token: token.access_token,
			token_type: token.token_type || "Bearer",
			scope: token.scope,
			created_at: new Date().toISOString(),
			...(existing?.studio_api_key != null && {
				studio_api_key: existing.studio_api_key,
				studio_key_created_at: existing.studio_key_created_at,
				studio_key_rotation_days: existing.studio_key_rotation_days,
			}),
		};
		await fs.writeFile(TOKEN_FILE, JSON.stringify(tokenData, null, 2), "utf-8");
	} catch {
		p.log.warn("Failed to store authentication token locally");
	}
}

export interface StoredToken {
	access_token: string;
	token_type: string;
	scope?: string;
	created_at: string;
	studio_api_key?: string;
	studio_key_created_at?: string;
	studio_key_rotation_days?: number | null;
}

export async function getStoredToken(): Promise<StoredToken | null> {
	try {
		const data = await fs.readFile(TOKEN_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return null;
	}
}

export async function setStoredStudioKey(
	apiKey: string,
	rotationDays?: number | null,
): Promise<void> {
	try {
		await fs.mkdir(CONFIG_DIR, { recursive: true });
		const existing = await getStoredToken();
		const merged: StoredToken = {
			...(existing ?? {
				access_token: "",
				token_type: "Bearer",
				created_at: new Date().toISOString(),
			}),
			studio_api_key: apiKey,
			studio_key_created_at: new Date().toISOString(),
			...(rotationDays !== undefined && {
				studio_key_rotation_days: rotationDays,
			}),
		};
		await fs.writeFile(TOKEN_FILE, JSON.stringify(merged, null, 2), "utf-8");
	} catch {
		p.log.warn("Failed to store studio API key locally");
	}
}

export async function setStudioKeyRotation(days: number | null): Promise<void> {
	try {
		await fs.mkdir(CONFIG_DIR, { recursive: true });
		const existing = await getStoredToken();
		const merged: StoredToken = {
			...(existing ?? {
				access_token: "",
				token_type: "Bearer",
				created_at: new Date().toISOString(),
			}),
			studio_key_rotation_days: days,
		};
		await fs.writeFile(TOKEN_FILE, JSON.stringify(merged, null, 2), "utf-8");
	} catch {
		p.log.warn("Failed to store rotation setting locally");
	}
}

export function isStudioKeyExpired(token: StoredToken): boolean {
	const days = token.studio_key_rotation_days;
	if (!days || days <= 0) return false;
	if (!token.studio_key_created_at) return false;
	const age = Date.now() - new Date(token.studio_key_created_at).getTime();
	return age > days * 24 * 60 * 60 * 1000;
}

export async function clearStoredToken(): Promise<void> {
	try {
		await fs.unlink(TOKEN_FILE);
	} catch {
		//
	}
}
