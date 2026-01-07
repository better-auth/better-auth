import { describe, expect, it } from "vitest";
import type { OAuthClient } from "../types/oauth";
import { checkCimdClient } from "./cimd";

describe("cimd - utils", async () => {
	const url = "https://localhost:3000";

	it("checkCimdClient accepts valid CIMD metadata", async () => {
		const cimdMetadata: OAuthClient = {
			client_id: `${url}/client-metadata.json`,
			redirect_uris: [`${url}/callback`],
		};
		await expect(
			checkCimdClient(new URL(`${url}/client-metadata.json`), cimdMetadata, {
				cimd: { enable: true },
			} as any),
		).resolves.toBeUndefined();
	});

	it("checkCimdClient rejects non-https redirect_uris", async () => {
		const cimdMetadata: OAuthClient = {
			client_id: `${url}/client-metadata.json`,
			redirect_uris: ["http://example.com/callback"],
		};
		await expect(
			checkCimdClient(new URL(`${url}/client-metadata.json`), cimdMetadata, {
				cimd: { enable: true },
			} as any),
		).rejects.toThrow();
	});

	it("checkCimdClient rejects redirect_uris with mismatched origin", async () => {
		const cimdMetadata: OAuthClient = {
			client_id: `${url}/client-metadata.json`,
			redirect_uris: ["https://example.com/callback"],
		};
		await expect(
			checkCimdClient(new URL(`${url}/client-metadata.json`), cimdMetadata, {
				cimd: { enable: true },
			} as any),
		).rejects.toThrow();
	});

	it("checkCimdClient rejects when client_secret is present", async () => {
		const cimdMetadata: OAuthClient = {
			client_id: `${url}/client-metadata.json`,
			client_secret: "secret",
			redirect_uris: [`${url}/callback`],
		};
		await expect(
			checkCimdClient(new URL(`${url}/client-metadata.json`), cimdMetadata, {
				cimd: { enable: true },
			} as any),
		).rejects.toThrow();
	});

	it("checkCimdClient rejects when token_endpoint_auth_method uses shared secrets", async () => {
		const cimdMetadata: OAuthClient = {
			client_id: `${url}/client-metadata.json`,
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [`${url}/callback`],
		};
		await expect(
			checkCimdClient(new URL(`${url}/client-metadata.json`), cimdMetadata, {
				cimd: { enable: true },
			} as any),
		).rejects.toThrow();
	});
});
