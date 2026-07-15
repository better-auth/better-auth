import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider } from "./types";

type SSOProtocol = "oidc" | "saml";

export interface PersistedSSOProviderInstance {
	type: "persisted";
	id: string;
	providerInstanceId: `sso:provider:${string}`;
}

export interface ConfiguredSSOProviderInstance {
	type: "configured";
	providerInstanceId: `sso:config:${string}`;
}

export type SSOProviderInstance =
	| PersistedSSOProviderInstance
	| ConfiguredSSOProviderInstance;

export type ResolvedSSOProvider<O extends SSOOptions = SSOOptions> =
	SSOProvider<O> & {
		instance: SSOProviderInstance;
	};

export interface SSOProviderReference {
	providerId: string;
	providerInstanceId: SSOProviderInstance["providerInstanceId"];
	authenticationConfigurationFingerprint: string;
}

type SSOProviderInstanceReferenceSource = Pick<
	ResolvedSSOProvider,
	| "domain"
	| "instance"
	| "issuer"
	| "oidcConfig"
	| "organizationId"
	| "providerId"
	| "samlConfig"
> & { domainVerified?: boolean };

/** Creates the immutable account namespace for a persisted SSO provider row. */
export function createPersistedSSOProviderInstance(
	id: string,
): PersistedSSOProviderInstance {
	return {
		type: "persisted",
		id,
		providerInstanceId: `sso:provider:${id}`,
	};
}

/** Creates the stable account namespace for a provider declared in configuration. */
export function createConfiguredSSOProviderInstance(
	providerId: string,
): ConfiguredSSOProviderInstance {
	return {
		type: "configured",
		providerInstanceId: `sso:config:${providerId}`,
	};
}

function serializeCanonicalConfiguration(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) {
		return `[${value
			.map((entry) =>
				entry === undefined ? "null" : serializeCanonicalConfiguration(entry),
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
						`${JSON.stringify(key)}:${serializeCanonicalConfiguration(entry)}`,
				)
				.join(",")}}`;
		}
		default:
			throw new TypeError(
				"SSO provider configuration must be JSON-serializable",
			);
	}
}

function getNonSecretOIDCConfiguration(
	configuration: OIDCConfig | undefined,
): Omit<OIDCConfig, "clientSecret"> | undefined {
	if (!configuration) return undefined;
	const nonSecretConfiguration = { ...configuration };
	nonSecretConfiguration.clientSecret = undefined;
	return nonSecretConfiguration;
}

function getNonSecretSAMLConfiguration(
	configuration: SAMLConfig | undefined,
): SAMLConfig | undefined {
	if (!configuration) return undefined;

	const idpMetadata = { ...configuration.idpMetadata };
	idpMetadata.privateKey = undefined;
	idpMetadata.privateKeyPass = undefined;
	idpMetadata.encPrivateKey = undefined;
	idpMetadata.encPrivateKeyPass = undefined;

	const spMetadata = configuration.spMetadata
		? { ...configuration.spMetadata }
		: undefined;
	if (spMetadata) {
		spMetadata.privateKey = undefined;
		spMetadata.privateKeyPass = undefined;
		spMetadata.encPrivateKey = undefined;
		spMetadata.encPrivateKeyPass = undefined;
	}

	const nonSecretConfiguration = {
		...configuration,
		idpMetadata,
		spMetadata,
	};
	nonSecretConfiguration.privateKey = undefined;
	return nonSecretConfiguration;
}

async function getAuthenticationConfigurationFingerprint(
	provider: SSOProviderInstanceReferenceSource,
	protocol: SSOProtocol,
): Promise<string> {
	const configuration = {
		domain: provider.domain,
		domainVerified: provider.domainVerified,
		issuer: provider.issuer,
		organizationId: provider.organizationId,
		protocol,
		protocolConfiguration:
			protocol === "oidc"
				? getNonSecretOIDCConfiguration(provider.oidcConfig)
				: getNonSecretSAMLConfiguration(provider.samlConfig),
	};
	const digest = await createHash("SHA-256").digest(
		serializeCanonicalConfiguration(configuration),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

/** Serializes the provider contract that an in-progress SSO flow must retain. */
export async function getSSOProviderReference(
	provider: SSOProviderInstanceReferenceSource,
	protocol: SSOProtocol,
): Promise<SSOProviderReference> {
	return {
		providerId: provider.providerId,
		providerInstanceId: provider.instance.providerInstanceId,
		authenticationConfigurationFingerprint:
			await getAuthenticationConfigurationFingerprint(provider, protocol),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSSOProviderInstanceId(
	value: unknown,
): value is SSOProviderReference["providerInstanceId"] {
	return (
		typeof value === "string" &&
		(value.startsWith("sso:provider:") || value.startsWith("sso:config:")) &&
		value.split(":", 3)[2] !== ""
	);
}

/** Parses a provider reference from server-owned authentication state. */
export function parseSSOProviderReference(
	value: unknown,
): SSOProviderReference | null {
	if (!isRecord(value)) return null;
	const providerId = value.providerId;
	const providerInstanceId = value.providerInstanceId;
	const authenticationConfigurationFingerprint =
		value.authenticationConfigurationFingerprint;
	if (
		typeof providerId !== "string" ||
		!isSSOProviderInstanceId(providerInstanceId) ||
		typeof authenticationConfigurationFingerprint !== "string" ||
		authenticationConfigurationFingerprint.length === 0
	) {
		return null;
	}
	return {
		providerId,
		providerInstanceId,
		authenticationConfigurationFingerprint,
	};
}

/** Checks that authentication state still targets the resolved provider instance. */
export async function isCurrentSSOProviderReference(
	provider: SSOProviderInstanceReferenceSource,
	reference: SSOProviderReference | null,
	protocol: SSOProtocol,
): Promise<boolean> {
	return (
		reference?.providerId === provider.providerId &&
		reference.providerInstanceId === provider.instance.providerInstanceId &&
		reference.authenticationConfigurationFingerprint ===
			(await getAuthenticationConfigurationFingerprint(provider, protocol))
	);
}

/**
 * Resolves the authority used to identify a subject across SSO accounts.
 * Persisted providers remain instance-scoped because their issuer and key
 * endpoints are mutable inputs. Only server-configured providers may share a
 * cryptographically verified OIDC authority.
 */
export function resolveSSOIdentityIssuer(
	provider: Pick<ResolvedSSOProvider, "instance">,
	protocol: "oidc" | "saml",
	verifiedAuthority?: string,
): string {
	if (
		protocol === "oidc" &&
		provider.instance.type === "configured" &&
		verifiedAuthority
	) {
		return verifiedAuthority;
	}
	return `${provider.instance.providerInstanceId}:${protocol}`;
}
