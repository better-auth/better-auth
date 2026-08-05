import type { SCIMScope } from "@better-auth/scim";
import { scim } from "@better-auth/scim";
import type { BetterAuthPlugin } from "better-auth";
import { SCIM_DEMO_ROLE } from "./scim-demo-catalog.ts";
import {
	isSCIMDemoOIDCConfigured,
	SCIM_DEMO_EXTERNAL_ID_PREFIX,
} from "./scim-demo-identity.ts";

export { SCIM_DEMO_ROLE };

const disabledSCIMDemoPlugin = {
	id: "scim-demo-disabled",
} satisfies BetterAuthPlugin;

interface SCIMDemoUserRow {
	id: string;
	scimDemoRole?: string | null;
}

export const SCIM_DEMO_SCOPES = [
	"scim.users.read",
	"scim.users.write",
	"scim.groups.read",
	"scim.groups.write",
] as const satisfies readonly SCIMScope[];

export function getSCIMDemoProvisioningDomainId(
	organizationId: string,
): string {
	const provisioningDomainId = `scim-demo-org:${organizationId}`;
	if (provisioningDomainId.length > 255) {
		throw new Error(
			"The organization identifier is too long for a SCIM provisioning domain",
		);
	}
	return provisioningDomainId;
}

export function isSCIMDemoEnabled() {
	return (
		process.env.SCIM_DEMO_ENABLED === "true" &&
		Boolean(process.env.SCIM_DEMO_CREDENTIAL_PEPPER) &&
		Boolean(process.env.BETTER_AUTH_URL)
	);
}

export function isSCIMDemoEmployeePortalEnabled() {
	return isSCIMDemoEnabled() && isSCIMDemoOIDCConfigured();
}

export function getSCIMDemoBaseURL() {
	const value = process.env.BETTER_AUTH_URL;
	if (!value) {
		throw new Error("BETTER_AUTH_URL is required for the SCIM demo");
	}

	const url = new URL(value);
	const isLoopback =
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname === "[::1]";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new Error(
			"BETTER_AUTH_URL must use HTTPS unless the SCIM demo runs on loopback",
		);
	}
	return url.origin;
}

export function createSCIMDemoPlugin() {
	if (!isSCIMDemoEnabled()) return disabledSCIMDemoPlugin;
	getSCIMDemoBaseURL();
	const credentialHashSecret = process.env.SCIM_DEMO_CREDENTIAL_PEPPER;
	if (!credentialHashSecret || credentialHashSecret.length < 32) {
		throw new Error(
			"SCIM_DEMO_CREDENTIAL_PEPPER must contain at least 32 characters",
		);
	}

	return scim({
		connections: [],
		managedConnections: { credentialHashSecret },
		compatibility: {
			microsoftEntra: {
				acceptLegacyGroupSchema: true,
			},
		},
		projection: {
			roles: {
				map: ({ source }) =>
					source.externalId?.startsWith(SCIM_DEMO_EXTERNAL_ID_PREFIX) &&
					source.externalId.endsWith("-finance-admins")
						? [SCIM_DEMO_ROLE]
						: [],
				exists: ({ role }) => role === SCIM_DEMO_ROLE,
			},
			async reconcileUser({ userId, grants }, { database }) {
				const user = await database.update<SCIMDemoUserRow>({
					model: "user",
					where: [{ field: "id", value: userId }],
					update: {
						scimDemoRole:
							grants.find((grant) => grant.role === SCIM_DEMO_ROLE)?.role ??
							null,
					},
				});
				if (!user) {
					throw new Error("The provisioned application user is missing");
				}
			},
		},
	});
}
