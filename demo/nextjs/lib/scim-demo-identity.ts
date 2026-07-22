import type { SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import {
	isSCIMDemoUserKey,
	SCIM_DEMO_DIRECTORY_USERS,
} from "./scim-demo-catalog.ts";

export const SCIM_DEMO_EMAIL_DOMAIN = "acme.example";
export const SCIM_DEMO_EXTERNAL_ID_PREFIX = "scim-demo:";

const SCIM_DEMO_WORKSPACE_ID_PATTERN = /^[0-9a-f]{12}$/;

export interface SCIMDemoUserIdentity {
	userKey: SCIMDemoUserKey;
	workspaceId: string;
}

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

/** Creates the exact external directory identifier used as the OIDC subject. */
export function createSCIMDemoUserExternalId(
	workspaceId: string,
	userKey: SCIMDemoUserKey,
) {
	if (!isSCIMDemoWorkspaceId(workspaceId)) {
		throw new Error("Invalid SCIM demo workspace identifier");
	}
	return `${SCIM_DEMO_EXTERNAL_ID_PREFIX}${workspaceId}:${userKey}`;
}

export function parseSCIMDemoUserExternalId(
	value: string,
): SCIMDemoUserIdentity | null {
	if (!value.startsWith(SCIM_DEMO_EXTERNAL_ID_PREFIX)) return null;
	const [workspaceId, userKey, ...extra] = value
		.slice(SCIM_DEMO_EXTERNAL_ID_PREFIX.length)
		.split(":");
	if (
		extra.length > 0 ||
		!workspaceId ||
		!userKey ||
		!isSCIMDemoWorkspaceId(workspaceId) ||
		!isSCIMDemoUserKey(userKey)
	) {
		return null;
	}
	return { workspaceId, userKey };
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

export function parseSCIMDemoUserEmail(
	value: string,
): SCIMDemoUserIdentity | null {
	const normalized = value.trim().toLowerCase();
	for (const user of SCIM_DEMO_DIRECTORY_USERS) {
		const prefix = `${user.emailLocalPart}+`;
		const suffix = `@${SCIM_DEMO_EMAIL_DOMAIN}`;
		if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix)) {
			continue;
		}
		const workspaceId = normalized.slice(prefix.length, -suffix.length);
		if (!isSCIMDemoWorkspaceId(workspaceId)) return null;
		return { workspaceId, userKey: user.key };
	}
	return null;
}

export function createSCIMDemoEmployeePortalPath(
	workspaceId: string,
	userKey: SCIMDemoUserKey,
) {
	if (!isSCIMDemoWorkspaceId(workspaceId)) {
		throw new Error("Invalid SCIM demo workspace identifier");
	}
	const search = new URLSearchParams({ workspace: workspaceId, user: userKey });
	return `/scim-demo/employee?${search.toString()}`;
}
