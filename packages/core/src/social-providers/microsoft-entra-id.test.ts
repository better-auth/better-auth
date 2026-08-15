import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { microsoft } from "./microsoft-entra-id";

const mockedBetterFetch = vi.mocked(betterFetch);

const CLIENT_ID = "ms-app";
const AUTHORITY = "https://login.microsoftonline.com";
const CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const WORK_TENANT_ID = "11111111-2222-3333-4444-555555555555";
const KID = "ms-test-key";

let privateKey: CryptoKey;
let publicJWK: JWK;

beforeEach(async () => {
	const keyPair = await generateKeyPair("RS256", { extractable: true });
	privateKey = keyPair.privateKey;
	publicJWK = await exportJWK(keyPair.publicKey);
	publicJWK.kid = KID;
	publicJWK.alg = "RS256";
	publicJWK.use = "sig";

	mockedBetterFetch.mockReset();
	// getMicrosoftPublicKey resolves the signing key from the discovery endpoint.
	mockedBetterFetch.mockResolvedValue({
		data: { keys: [publicJWK] },
		error: null,
	} as Awaited<ReturnType<typeof betterFetch>>);
});

async function signMicrosoftToken(opts: {
	tid: string;
	/** Defaults to the issuer Microsoft would mint for `tid`. */
	iss?: string;
	audience?: string;
}) {
	const iss = opts.iss ?? `${AUTHORITY}/${opts.tid}/v2.0`;
	return new SignJWT({ tid: opts.tid, sub: "ms-user-1" })
		.setProtectedHeader({ alg: "RS256", kid: KID })
		.setIssuer(iss)
		.setAudience(opts.audience ?? CLIENT_ID)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);
}

describe("microsoft.verifyIdToken tenant enforcement", () => {
	it("rejects a consumer-tenant token when restricted to organizations", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "organizations",
		});
		const token = await signMicrosoftToken({ tid: CONSUMER_TENANT_ID });
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(false);
	});

	it("rejects a work-tenant token when restricted to consumers", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "consumers",
		});
		const token = await signMicrosoftToken({ tid: WORK_TENANT_ID });
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(false);
	});

	it("accepts a work-tenant token under organizations", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "organizations",
		});
		const token = await signMicrosoftToken({ tid: WORK_TENANT_ID });
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(true);
	});

	it("accepts a consumer-tenant token under consumers", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "consumers",
		});
		const token = await signMicrosoftToken({ tid: CONSUMER_TENANT_ID });
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(true);
	});

	it("accepts any tenant under common", async () => {
		const provider = microsoft({ clientId: CLIENT_ID, tenantId: "common" });
		await expect(
			provider.verifyIdToken(
				await signMicrosoftToken({ tid: WORK_TENANT_ID }),
				undefined,
			),
		).resolves.toBe(true);
		await expect(
			provider.verifyIdToken(
				await signMicrosoftToken({ tid: CONSUMER_TENANT_ID }),
				undefined,
			),
		).resolves.toBe(true);
	});

	it("rejects a token whose issuer does not name its own tenant", async () => {
		const provider = microsoft({ clientId: CLIENT_ID, tenantId: "common" });
		// Valid signature and audience, but the issuer points at a different tenant
		// than the `tid` claim, which Microsoft never does.
		const token = await signMicrosoftToken({
			tid: WORK_TENANT_ID,
			iss: `${AUTHORITY}/${CONSUMER_TENANT_ID}/v2.0`,
		});
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(false);
	});

	it("accepts a valid token when the authority is configured with a trailing slash", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "common",
			authority: `${AUTHORITY}/`,
		});
		const token = await signMicrosoftToken({ tid: WORK_TENANT_ID });
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(true);
	});

	it("rejects a token with a non-string tid", async () => {
		const provider = microsoft({ clientId: CLIENT_ID, tenantId: "common" });
		const token = await new SignJWT({ sub: "ms-user-1" })
			.setProtectedHeader({ alg: "RS256", kid: KID })
			.setIssuer(`${AUTHORITY}/${WORK_TENANT_ID}/v2.0`)
			.setAudience(CLIENT_ID)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(privateKey);
		await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(false);
	});
});
