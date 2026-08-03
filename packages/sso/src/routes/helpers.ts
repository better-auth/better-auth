import type { DBAdapter } from "@better-auth/core/db/adapter";
import { APIError } from "better-auth/api";
import { resolveSigningCerts } from "../saml";
import { parseSAMLServiceProviderMetadata } from "../saml/response-binding";
import { saml } from "../samlify";
import type { SAMLConfig, SSOOptions, SSOProvider } from "../types";
import { normalizePem, safeJsonParse } from "../utils";

/**
 * Same as `normalizePem`, but applied across the resolved list of IdP signing
 * certificates so multi-cert rotation configs survive the line-trim step.
 */
function normalizePemList(certs: string[] | undefined): string[] | undefined {
	if (!certs) return certs;
	return certs.map((pem) => normalizePem(pem) ?? pem);
}

export async function findSAMLProvider(
	providerId: string,
	options: SSOOptions | undefined,
	adapter: Pick<DBAdapter, "findOne">,
): Promise<SSOProvider<SSOOptions> | null> {
	if (options?.defaultSSO?.length) {
		const match = options.defaultSSO.find((p) => p.providerId === providerId);
		if (match) {
			return {
				...match,
				userId: "default",
				issuer: match.samlConfig?.issuer || "",
				...(options.domainVerification?.enabled
					? { domainVerified: true }
					: {}),
			} as SSOProvider<SSOOptions>;
		}
	}

	const res = await adapter.findOne<SSOProvider<SSOOptions>>({
		model: "ssoProvider",
		where: [{ field: "providerId", value: providerId }],
	});

	if (!res) return null;

	return {
		...res,
		samlConfig: res.samlConfig
			? safeJsonParse<SAMLConfig>(res.samlConfig as unknown as string) ||
				undefined
			: undefined,
	};
}

export function createSP(
	config: SAMLConfig,
	baseURL: string,
	providerId: string,
	opts?: {
		clockSkew?: number;
		relayState?: string;
		sloOptions?: {
			wantLogoutRequestSigned?: boolean;
			wantLogoutResponseSigned?: boolean;
		};
	},
) {
	const spData = config.spMetadata;
	const sloLocation = `${baseURL}/sso/saml2/sp/slo/${providerId}`;
	const acsUrl = `${baseURL}/sso/saml2/sp/acs/${providerId}`;

	// When no SP metadata XML is provided, generate it so samlify can read
	// authnRequestsSigned and other flags that only work via metadata.
	let metadata = spData?.metadata;
	assertSAMLServiceProviderMetadataPolicy(config);
	if (!metadata) {
		metadata =
			saml
				.SPMetadata({
					entityID: spData?.entityID || config.issuer,
					assertionConsumerService: [
						{
							Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
							Location: acsUrl,
						},
					],
					singleLogoutService: opts?.sloOptions
						? [
								{
									Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
									Location: sloLocation,
								},
								{
									Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
									Location: sloLocation,
								},
							]
						: undefined,
					wantAssertionsSigned: config.wantAssertionsSigned || false,
					authnRequestsSigned: config.authnRequestsSigned || false,
					nameIDFormat: config.identifierFormat
						? [config.identifierFormat]
						: undefined,
				})
				.getMetadata() || "";
	}

	const provider = saml.ServiceProvider({
		metadata,
		allowCreate: true,
		wantLogoutRequestSigned: opts?.sloOptions?.wantLogoutRequestSigned ?? false,
		wantLogoutResponseSigned:
			opts?.sloOptions?.wantLogoutResponseSigned ?? false,
		privateKey: normalizePem(spData?.privateKey || config.privateKey),
		privateKeyPass: spData?.privateKeyPass,
		isAssertionEncrypted: spData?.isAssertionEncrypted || false,
		encPrivateKey: normalizePem(spData?.encPrivateKey),
		encPrivateKeyPass: spData?.encPrivateKeyPass,
		relayState: opts?.relayState,
		clockDrifts:
			opts?.clockSkew && opts?.clockSkew !== 0
				? [-opts.clockSkew, opts.clockSkew]
				: undefined,
	});
	return provider;
}

/**
 * Ensures custom SP metadata cannot weaken the configured assertion-signing
 * policy. This is safe to call before persisting a provider configuration.
 */
export function assertSAMLServiceProviderMetadataPolicy(
	config: SAMLConfig,
): void {
	const policy = deriveSAMLServiceProviderPolicy(config);
	if (config.wantAssertionsSigned !== true || policy.wantAssertionsSigned) {
		return;
	}

	throw new APIError("BAD_REQUEST", {
		code: "SAML_SP_METADATA_ASSERTION_SIGNATURE_MISMATCH",
		message: "SAML service provider metadata must require signed assertions",
	});
}

export interface SAMLServiceProviderPolicy {
	/** Effective assertion-signing requirement advertised by SP metadata. */
	wantAssertionsSigned: boolean;
}

export function assertSAMLMetadataSize(
	metadata: string | undefined,
	kind: "IdP" | "SP",
	maxMetadataSize: number,
): void {
	if (metadata && new TextEncoder().encode(metadata).length > maxMetadataSize) {
		throw new APIError("BAD_REQUEST", {
			message: `${kind} metadata exceeds maximum allowed size (${maxMetadataSize} bytes)`,
		});
	}
}

/**
 * Parses custom SP metadata and returns its effective verification policy.
 *
 * Configurations without custom metadata use the code-defined policy directly.
 * Invalid or unusable custom metadata throws an API error with the
 * `SAML_INVALID_SP_METADATA` code.
 */
export function deriveSAMLServiceProviderPolicy(
	config: Pick<SAMLConfig, "spMetadata" | "wantAssertionsSigned">,
): SAMLServiceProviderPolicy {
	const metadata = config.spMetadata?.metadata;
	if (!metadata) {
		return { wantAssertionsSigned: config.wantAssertionsSigned === true };
	}
	try {
		const parsedMetadata = parseSAMLServiceProviderMetadata(metadata);
		if (!parsedMetadata.postAssertionConsumerServiceUrls.length) {
			throw new Error("Unusable SAML service provider metadata");
		}
		return {
			wantAssertionsSigned: parsedMetadata.wantAssertionsSigned,
		};
	} catch {
		throw new APIError("BAD_REQUEST", {
			code: "SAML_INVALID_SP_METADATA",
			message: "Invalid SAML service provider metadata",
		});
	}
}

export function assertSAMLIdentityProviderAuthority<
	Config extends {
		idpMetadata?:
			| {
					metadata?: string | undefined;
					entityID?: string | undefined;
			  }
			| undefined;
	},
>(
	config: Config,
): asserts config is Config & {
	idpMetadata: NonNullable<Config["idpMetadata"]> &
		(
			| { metadata: string; entityID?: string | undefined }
			| { metadata?: undefined; entityID: string }
		);
} {
	if (config.idpMetadata?.metadata || config.idpMetadata?.entityID) {
		return;
	}

	throw new APIError("BAD_REQUEST", {
		message:
			"SAML manual IdP configuration requires idpMetadata.entityID; issuer identifies the service provider and cannot identify the IdP",
	});
}

export function createIdP(config: SAMLConfig) {
	assertSAMLIdentityProviderAuthority(config);
	const idpData = config.idpMetadata;
	if (idpData?.metadata) {
		return saml.IdentityProvider({
			metadata: idpData.metadata,
			privateKey: normalizePem(idpData.privateKey),
			privateKeyPass: idpData.privateKeyPass,
			isAssertionEncrypted: idpData.isAssertionEncrypted,
			encPrivateKey: normalizePem(idpData.encPrivateKey),
			encPrivateKeyPass: idpData.encPrivateKeyPass,
		});
	}
	return saml.IdentityProvider({
		entityID: idpData.entityID,
		singleSignOnService: idpData.singleSignOnService || [
			{
				Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
				Location: config.entryPoint,
			},
		],
		singleLogoutService: idpData.singleLogoutService,
		signingCert: normalizePemList(resolveSigningCerts(config)),
		wantAuthnRequestsSigned: config.authnRequestsSigned || false,
		isAssertionEncrypted: idpData.isAssertionEncrypted || false,
		encPrivateKey: normalizePem(idpData.encPrivateKey),
		encPrivateKeyPass: idpData.encPrivateKeyPass,
	});
}

/**
 * Derive the verified SAML identity-provider entity ID using the same metadata
 * parsing and manual-configuration validation as SAML authentication.
 */
export function deriveSAMLIdentityProviderEntityID(config: SAMLConfig): string {
	return createIdP(config).entityMeta.getEntityID();
}

function escapeHtml(str: string | undefined | null): string {
	if (!str) return "";
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function isSAMLPostBindingLocation(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return url.protocol === "http:" || url.protocol === "https:";
}

export function createSAMLPostForm(
	action: string,
	samlParam: string,
	samlValue: string,
	relayState?: string,
): Response {
	// `action` is an IdP-supplied endpoint (e.g. the SLO Location); only emit
	// http(s) URLs into the auto-submitting form.
	if (!isSAMLPostBindingLocation(action)) {
		throw new APIError("BAD_REQUEST", {
			message:
				"SAML POST binding location must be an absolute http or https URL",
		});
	}
	const safeAction = escapeHtml(action);
	const safeSamlParam = escapeHtml(samlParam);
	const safeSamlValue = escapeHtml(samlValue);
	const safeRelayState = relayState ? escapeHtml(relayState) : undefined;

	const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit();"><form method="POST" action="${safeAction}"><input type="hidden" name="${safeSamlParam}" value="${safeSamlValue}" />${safeRelayState ? `<input type="hidden" name="RelayState" value="${safeRelayState}" />` : ""}<noscript><input type="submit" value="Continue" /></noscript></form></body></html>`;
	return new Response(html, { headers: { "Content-Type": "text/html" } });
}
