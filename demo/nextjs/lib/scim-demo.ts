import { scim } from "@better-auth/scim";
import type { BetterAuthPlugin } from "better-auth";
import { SCIM_DEMO_ROLE } from "./scim-demo-catalog.ts";

export const SCIM_DEMO_CONNECTION_ID = "demo-directory";
export const SCIM_DEMO_PROVISIONING_DOMAIN_ID = "scim-demo";
export const SCIM_DEMO_EXTERNAL_ID_PREFIX = "scim-demo:";

export { SCIM_DEMO_ROLE };

const disabledSCIMDemoPlugin = {
	id: "scim-demo-disabled",
} satisfies BetterAuthPlugin;

interface SCIMDemoUserRow {
	id: string;
	scimDemoActive?: boolean | null;
	scimDemoRole?: string | null;
}

export function getSCIMDemoToken() {
	const token = process.env.SCIM_DEMO_TOKEN;
	if (!token) {
		throw new Error("SCIM_DEMO_TOKEN is not configured");
	}
	return token;
}

export function isSCIMDemoEnabled() {
	return (
		process.env.SCIM_DEMO_ENABLED === "true" &&
		Boolean(process.env.SCIM_DEMO_TOKEN) &&
		Boolean(process.env.BETTER_AUTH_URL)
	);
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

	return scim({
		connections: [
			{
				id: SCIM_DEMO_CONNECTION_ID,
				provisioningDomainId: SCIM_DEMO_PROVISIONING_DOMAIN_ID,
				credentials: [{ type: "bearer", token: getSCIMDemoToken() }],
			},
		],
		identity: {
			async reconcileUser({ userId, active }, { database }) {
				const user = await database.update<SCIMDemoUserRow>({
					model: "user",
					where: [{ field: "id", value: userId }],
					update: { scimDemoActive: active },
				});
				if (!user) {
					throw new Error("The provisioned application user is missing");
				}
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
