import { base64url } from "jose";
import type { SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import { SCIM_DEMO_DIRECTORY_USERS } from "./scim-demo-catalog.ts";

export const SCIM_DEMO_EMAIL_DOMAIN = "acme.example";
export const SCIM_DEMO_EXTERNAL_ID_PREFIX = "scim-demo:";
export const SCIM_DEMO_V2_SUBJECT_PREFIX = "scim-demo:v2:";
export const SCIM_DEMO_SSO_PROVIDER_ID = "scim-demo-sso";
export const SCIM_DEMO_OIDC_CLIENT_ID = "scim-demo-client";
export const SCIM_DEMO_OIDC_ISSUER_PATH = "/api/scim-demo/idp";

const SCIM_DEMO_WORKSPACE_ID_PATTERN = /^[0-9a-f]{12}$/;
const SCIM_DEMO_CONNECTION_ID_PATTERN =
	/^ba_scim_connection_[A-Za-z0-9_-]{32}$/;
const SCIM_DEMO_V2_SUBJECT_PATTERN = /^scim-demo:v2:[A-Za-z0-9_-]{43}$/;
const SCIM_DEMO_V2_SUBJECT_CONTEXT = "better-auth:scim-demo:oidc-subject:v2";

export type SCIMDemoDirectoryFixture = {
	userKey: SCIMDemoUserKey;
	displayName: string;
	email: string;
	subject: string;
};

function getUserDefinition(userKey: string) {
	return SCIM_DEMO_DIRECTORY_USERS.find((user) => user.key === userKey) ?? null;
}

/** Creates the stable, non-reversible sandbox identifier for a demo operator. */
export async function computeSCIMDemoWorkspaceId(operatorId: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(operatorId),
	);
	return Array.from(new Uint8Array(digest).slice(0, 6), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export function isSCIMDemoWorkspaceId(value: string) {
	return SCIM_DEMO_WORKSPACE_ID_PATTERN.test(value);
}

function getSCIMDemoIdentitySecret() {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required to create SCIM demo identities",
		);
	}
	return secret;
}

async function getSCIMDemoIdentityKey() {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(getSCIMDemoIdentitySecret()),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

function getSCIMDemoBaseURL() {
	const value = process.env.BETTER_AUTH_URL;
	if (!value) throw new Error("BETTER_AUTH_URL is required for the SCIM demo");
	const url = new URL(value);
	if (
		url.protocol !== "https:" &&
		url.hostname !== "localhost" &&
		url.hostname !== "127.0.0.1" &&
		url.hostname !== "[::1]"
	) {
		throw new Error(
			"SCIM demo employee links require HTTPS outside localhost or loopback",
		);
	}
	return url.origin;
}

function getSCIMDemoV2SubjectMessage(
	connectionId: string,
	userKey: SCIMDemoUserKey,
) {
	return new TextEncoder().encode(
		[
			SCIM_DEMO_V2_SUBJECT_CONTEXT,
			SCIM_DEMO_OIDC_CLIENT_ID,
			String(connectionId.length),
			connectionId,
			userKey,
		].join(":"),
	);
}

/**
 * Creates the opaque tenant-scoped OIDC subject provisioned as SCIM externalId.
 */
export async function createSCIMDemoV2Subject(
	connectionId: string,
	userKey: SCIMDemoUserKey,
) {
	if (!SCIM_DEMO_CONNECTION_ID_PATTERN.test(connectionId)) {
		throw new Error("Invalid SCIM demo connection identifier");
	}
	const signature = await crypto.subtle.sign(
		"HMAC",
		await getSCIMDemoIdentityKey(),
		getSCIMDemoV2SubjectMessage(connectionId, userKey),
	);
	return `${SCIM_DEMO_V2_SUBJECT_PREFIX}${base64url.encode(
		new Uint8Array(signature),
	)}`;
}

export function isSCIMDemoV2Subject(value: unknown): value is string {
	return typeof value === "string" && SCIM_DEMO_V2_SUBJECT_PATTERN.test(value);
}

export async function resolveSCIMDemoV2Subject(
	connectionId: string,
	subject: string,
): Promise<SCIMDemoUserKey | null> {
	if (
		!SCIM_DEMO_CONNECTION_ID_PATTERN.test(connectionId) ||
		!isSCIMDemoV2Subject(subject)
	) {
		return null;
	}
	for (const user of SCIM_DEMO_DIRECTORY_USERS) {
		if ((await createSCIMDemoV2Subject(connectionId, user.key)) === subject) {
			return user.key;
		}
	}
	return null;
}

export async function createSCIMDemoDirectoryFixtures(
	connectionId: string,
): Promise<SCIMDemoDirectoryFixture[]> {
	const workspaceId = await computeSCIMDemoWorkspaceId(connectionId);
	return await Promise.all(
		SCIM_DEMO_DIRECTORY_USERS.map(async (user) => ({
			userKey: user.key,
			displayName: user.displayName,
			email: createSCIMDemoUserEmail(workspaceId, user.key),
			subject: await createSCIMDemoV2Subject(connectionId, user.key),
		})),
	);
}

export async function createSCIMDemoOIDCManagementContext(
	connectionId: string,
) {
	return {
		providerId: SCIM_DEMO_SSO_PROVIDER_ID,
		issuer: getSCIMDemoOIDCIssuer(),
		fixtures: await createSCIMDemoDirectoryFixtures(connectionId),
	};
}

export function getSCIMDemoOIDCIssuer() {
	return `${getSCIMDemoBaseURL()}${SCIM_DEMO_OIDC_ISSUER_PATH}`;
}

export function isSCIMDemoOIDCConfigured() {
	const baseURL = process.env.BETTER_AUTH_URL;
	const identitySecret = process.env.BETTER_AUTH_SECRET;
	const clientSecret = process.env.SCIM_DEMO_OIDC_CLIENT_SECRET?.trim();
	if (
		!baseURL ||
		!clientSecret ||
		clientSecret.length < 32 ||
		!identitySecret ||
		identitySecret.length < 32
	) {
		return false;
	}
	let hostname: string;
	try {
		hostname = new URL(baseURL).hostname;
	} catch {
		return false;
	}
	const isLoopback =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]";
	return (
		isLoopback ||
		Boolean(process.env.SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY?.trim())
	);
}

export async function getConfiguredSCIMDemoOIDCManagementContext(
	connectionId: string,
) {
	return isSCIMDemoOIDCConfigured()
		? await createSCIMDemoOIDCManagementContext(connectionId)
		: null;
}

/** Creates the unique email alias used by one sandbox directory user. */
export function createSCIMDemoUserEmail(
	workspaceId: string,
	userKey: SCIMDemoUserKey,
) {
	if (!isSCIMDemoWorkspaceId(workspaceId)) {
		throw new Error("Invalid SCIM demo workspace identifier");
	}
	const user = getUserDefinition(userKey);
	if (!user) throw new Error("Invalid SCIM demo user identifier");
	return `${user.emailLocalPart}+${workspaceId}@${SCIM_DEMO_EMAIL_DOMAIN}`;
}
