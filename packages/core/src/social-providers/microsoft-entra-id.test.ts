import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { verifyProviderIdToken } from "../oauth2";
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

async function encodeMicrosoftProfile(profile: Record<string, unknown>) {
	return new SignJWT(profile)
		.setProtectedHeader({ alg: "RS256", kid: KID })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);
}

describe("microsoft id_token tenant enforcement", () => {
	it("rejects a consumer-tenant token when restricted to organizations", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "organizations",
		});
		const token = await signMicrosoftToken({ tid: CONSUMER_TENANT_ID });
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(false);
	});

	it("rejects a work-tenant token when restricted to consumers", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "consumers",
		});
		const token = await signMicrosoftToken({ tid: WORK_TENANT_ID });
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(false);
	});

	it("accepts a work-tenant token under organizations", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "organizations",
		});
		const token = await signMicrosoftToken({ tid: WORK_TENANT_ID });
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(true);
	});

	it("accepts a consumer-tenant token under consumers", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "consumers",
		});
		const token = await signMicrosoftToken({ tid: CONSUMER_TENANT_ID });
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(true);
	});

	it("accepts any tenant under common", async () => {
		const provider = microsoft({ clientId: CLIENT_ID, tenantId: "common" });
		await expect(
			verifyProviderIdToken(
				provider,
				await signMicrosoftToken({ tid: WORK_TENANT_ID }),
				undefined,
			),
		).resolves.toBe(true);
		await expect(
			verifyProviderIdToken(
				provider,
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
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(false);
	});

	it("accepts a valid token when the authority is configured with a trailing slash", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "common",
			authority: `${AUTHORITY}/`,
		});
		const token = await signMicrosoftToken({ tid: WORK_TENANT_ID });
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(true);
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
		await expect(
			verifyProviderIdToken(provider, token, undefined),
		).resolves.toBe(false);
	});
});

describe("microsoft account subject", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10194
	 */
	it("uses the stable oid claim instead of the pairwise sub claim", async () => {
		const provider = microsoft({ clientId: CLIENT_ID, tenantId: "common" });
		const idToken = await encodeMicrosoftProfile({
			sub: "ms-pairwise-sub",
			oid: "ms-stable-oid",
			tid: WORK_TENANT_ID,
			email: "user@example.com",
			name: "Microsoft User",
		});

		const result = await provider.getUserInfo({
			idToken,
			accessToken: "ms-access-token",
		});

		expect(
			await provider.accountSubject({
				tokens: { idToken, accessToken: "ms-access-token" },
				profile: result!.data,
			}),
		).toBe("ms-stable-oid");
		expect(result?.data.oid).toBe("ms-stable-oid");
		expect(result?.data.sub).toBe("ms-pairwise-sub");
	});

	it("does not fetch a photo when profile photos are disabled and still maps the profile", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "common",
			disableProfilePhoto: true,
			mapProfileToUser: () => ({ name: "Mapped User" }),
		});
		const idToken = await encodeMicrosoftProfile({
			sub: "ms-pairwise-sub",
			oid: "ms-stable-oid",
			tid: WORK_TENANT_ID,
			email: "user@example.com",
			name: "Microsoft User",
		});

		const result = await provider.getUserInfo({
			idToken,
			accessToken: "ms-access-token",
		});

		expect(result?.user.name).toBe("Mapped User");
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("does not fetch a photo when accessToken is missing and still maps the profile", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "common",
			mapProfileToUser: () => ({ name: "Mapped User" }),
		});
		const idToken = await encodeMicrosoftProfile({
			sub: "ms-pairwise-sub",
			oid: "ms-stable-oid",
			tid: WORK_TENANT_ID,
			email: "user@example.com",
			name: "Microsoft User",
		});

		const result = await provider.getUserInfo({ idToken });

		expect(result?.user.name).toBe("Mapped User");
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("returns null without fetching a photo when oid is missing", async () => {
		const provider = microsoft({
			clientId: CLIENT_ID,
			tenantId: "common",
		});
		const idToken = await encodeMicrosoftProfile({
			sub: "ms-pairwise-sub",
			tid: WORK_TENANT_ID,
			email: "user@example.com",
			name: "Microsoft User",
		});

		await expect(
			provider.getUserInfo({
				idToken,
				accessToken: "ms-access-token",
			}),
		).resolves.toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("returns null when the oid claim is not a string", async () => {
		const provider = microsoft({ clientId: CLIENT_ID, tenantId: "common" });
		const idToken = await encodeMicrosoftProfile({
			sub: "ms-pairwise-sub",
			oid: 123,
			tid: WORK_TENANT_ID,
			email: "user@example.com",
			name: "Microsoft User",
		});

		await expect(
			provider.getUserInfo({
				idToken,
				accessToken: "ms-access-token",
			}),
		).resolves.toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});
});
