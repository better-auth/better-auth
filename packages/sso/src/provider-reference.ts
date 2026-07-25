import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { OIDCConfig, SSOOptions, SSOProvider } from "./types";

export const SSO_PROVIDER_STATE_KEY = "ssoProviderReference";

type ReferencedProvider = SSOProvider<SSOOptions> & { id?: string | undefined };

export interface SSOProviderReference {
	providerId: string;
	source: { type: "configured" } | { type: "persisted"; recordId: string };
	authenticationConfigurationFingerprint: string;
}

function serializeCanonical(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) {
		return `[${value
			.map((entry) =>
				entry === undefined ? "null" : serializeCanonical(entry),
			)
			.join(",")}]`;
	}
	switch (typeof value) {
		case "boolean":
		case "number":
		case "string":
			return JSON.stringify(value);
		case "object": {
			const entries = Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
			return `{${entries
				.map(
					([key, entry]) =>
						`${JSON.stringify(key)}:${serializeCanonical(entry)}`,
				)
				.join(",")}}`;
		}
		default:
			throw new TypeError(
				"SSO provider configuration must be JSON-serializable",
			);
	}
}

function withoutOIDCSecret(
	configuration: OIDCConfig | undefined,
): Omit<OIDCConfig, "clientSecret"> | undefined {
	if (!configuration) return undefined;
	const result = { ...configuration };
	result.clientSecret = undefined;
	return result;
}

function getProviderSource(provider: ReferencedProvider) {
	return typeof provider.id === "string" && provider.id.length > 0
		? ({ type: "persisted", recordId: provider.id } as const)
		: ({ type: "configured" } as const);
}

async function computeProviderAuthenticationFingerprint(
	provider: ReferencedProvider,
): Promise<string> {
	const digest = await createHash("SHA-256").digest(
		serializeCanonical({
			domain: provider.domain,
			domainVerified:
				"domainVerified" in provider ? provider.domainVerified : undefined,
			issuer: provider.issuer,
			organizationId: provider.organizationId,
			oidcConfig: withoutOIDCSecret(provider.oidcConfig),
		}),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

export async function computeSSOProviderReference(
	provider: ReferencedProvider,
): Promise<SSOProviderReference> {
	return {
		providerId: provider.providerId,
		source: getProviderSource(provider),
		authenticationConfigurationFingerprint:
			await computeProviderAuthenticationFingerprint(provider),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSSOProviderReference(
	value: unknown,
): SSOProviderReference | null {
	if (!isRecord(value) || !isRecord(value.source)) return null;
	const providerId = value.providerId;
	const authenticationConfigurationFingerprint =
		value.authenticationConfigurationFingerprint;
	const source = value.source;
	if (
		typeof providerId !== "string" ||
		providerId.length === 0 ||
		typeof authenticationConfigurationFingerprint !== "string" ||
		authenticationConfigurationFingerprint.length === 0
	) {
		return null;
	}
	if (source.type === "configured") {
		return {
			providerId,
			source: { type: "configured" },
			authenticationConfigurationFingerprint,
		};
	}
	if (
		source.type === "persisted" &&
		typeof source.recordId === "string" &&
		source.recordId.length > 0
	) {
		return {
			providerId,
			source: { type: "persisted", recordId: source.recordId },
			authenticationConfigurationFingerprint,
		};
	}
	return null;
}

export async function isCurrentSSOProviderReference(
	provider: ReferencedProvider,
	reference: SSOProviderReference | null,
): Promise<boolean> {
	if (!reference || reference.providerId !== provider.providerId) return false;
	const source = getProviderSource(provider);
	if (source.type !== reference.source.type) return false;
	if (
		source.type === "persisted" &&
		(reference.source.type !== "persisted" ||
			source.recordId !== reference.source.recordId)
	) {
		return false;
	}
	return (
		reference.authenticationConfigurationFingerprint ===
		(await computeProviderAuthenticationFingerprint(provider))
	);
}
