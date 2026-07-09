import type { DBAdapter } from "@better-auth/core/db/adapter";
import { APIError } from "better-auth/api";
import { findNode, xmlParser } from "../saml/parser";
import { saml } from "../samlify";
import type { SAMLConfig, SSOOptions, SSOProvider } from "../types";
import { normalizePem, safeJsonParse } from "../utils";

/**
 * Resolve the SP entityID the same way ServiceProvider construction does:
 * explicit spMetadata.entityID → entityID inside spMetadata.metadata → issuer.
 */
export function resolveSPEntityID(config: SAMLConfig): string {
	if (config.spMetadata?.entityID) {
		return config.spMetadata.entityID;
	}
	const fromMetadata = extractEntityIdFromMetadata(config.spMetadata?.metadata);
	if (fromMetadata) {
		return fromMetadata;
	}
	return config.issuer;
}

function extractEntityIdFromMetadata(
	metadata: string | undefined,
): string | null {
	if (!metadata) return null;
	try {
		const parsed = xmlParser.parse(metadata);
		const descriptor = findNode(parsed, "EntityDescriptor") as
			| Record<string, unknown>
			| Array<Record<string, unknown>>
			| null;
		const node = Array.isArray(descriptor) ? descriptor[0] : descriptor;
		const entityId = node?.["@_entityID"];
		return typeof entityId === "string" && entityId.length > 0
			? entityId
			: null;
	} catch {
		return null;
	}
}

/** Configured IdP SSO endpoints (entryPoint + singleSignOnService locations). */
export function getConfiguredIdPSSOLocations(config: SAMLConfig): string[] {
	const locations = new Set<string>();
	if (config.entryPoint) {
		locations.add(config.entryPoint);
	}
	for (const service of config.idpMetadata?.singleSignOnService ?? []) {
		if (typeof service.Location === "string" && service.Location.length > 0) {
			locations.add(service.Location);
		}
	}
	if (config.idpMetadata?.metadata) {
		try {
			const parsed = xmlParser.parse(config.idpMetadata.metadata);
			const collect = (node: unknown) => {
				if (!node || typeof node !== "object") return;
				if (Array.isArray(node)) {
					for (const item of node) collect(item);
					return;
				}
				const record = node as Record<string, unknown>;
				if ("SingleSignOnService" in record) {
					const sso = record.SingleSignOnService;
					const list = Array.isArray(sso) ? sso : [sso];
					for (const entry of list) {
						if (
							entry &&
							typeof entry === "object" &&
							typeof (entry as Record<string, unknown>)["@_Location"] ===
								"string"
						) {
							locations.add(
								(entry as Record<string, unknown>)["@_Location"] as string,
							);
						}
					}
				}
				for (const value of Object.values(record)) {
					if (value && typeof value === "object") collect(value);
				}
			};
			collect(parsed);
		} catch {
			// ignore malformed metadata; entryPoint still applies
		}
	}
	return [...locations];
}

/**
 * Ensure an executor-supplied AuthnRequest redirect URL targets a configured
 * IdP SSO endpoint (absolute http(s); query string allowed for Redirect binding).
 */
export function assertAllowedIdPSSORedirectURL(
	redirectUrl: string,
	config: SAMLConfig,
): void {
	let target: URL;
	try {
		target = new URL(redirectUrl);
	} catch {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML request",
			code: "SAML_REDIRECT_URL_INVALID",
		});
	}
	if (target.protocol !== "http:" && target.protocol !== "https:") {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML request",
			code: "SAML_REDIRECT_URL_INVALID",
		});
	}
	// Fragment must never appear on IdP redirect (open-redirect / leakage surface).
	// Check raw input too: URL.hash is empty for a bare trailing "#".
	if (target.hash || redirectUrl.includes("#")) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML request",
			code: "SAML_REDIRECT_URL_INVALID",
		});
	}

	const allowed = getConfiguredIdPSSOLocations(config);
	if (allowed.length === 0) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML request",
			code: "SAML_IDP_SSO_NOT_CONFIGURED",
		});
	}

	// Exact origin + pathname only (query OK for Redirect binding).
	// Avoid startsWith — /sso would incorrectly allow /sso-evil.
	const matches = allowed.some((location) => {
		try {
			const base = new URL(location);
			return target.origin === base.origin && target.pathname === base.pathname;
		} catch {
			return false;
		}
	});

	if (!matches) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML request",
			code: "SAML_REDIRECT_URL_NOT_ALLOWED",
		});
	}
}

export async function findSAMLProvider(
	providerId: string,
	options: SSOOptions | undefined,
	adapter: DBAdapter,
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
	// TODO: derive ACS URL exclusively from baseURL + providerId.
	// callbackUrl doubles as both ACS and post-auth redirect, which breaks
	// when it points to an app destination (e.g., /dashboard).
	const acsUrl =
		config.callbackUrl || `${baseURL}/sso/saml2/sp/acs/${providerId}`;

	return saml.ServiceProvider({
		entityID: resolveSPEntityID(config),
		assertionConsumerService: spData?.metadata
			? undefined
			: [
					{
						Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
						Location: acsUrl,
					},
				],
		singleLogoutService: [
			{
				Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
				Location: sloLocation,
			},
			{
				Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
				Location: sloLocation,
			},
		],
		wantMessageSigned: config.wantAssertionsSigned || false,
		wantLogoutRequestSigned: opts?.sloOptions?.wantLogoutRequestSigned ?? false,
		wantLogoutResponseSigned:
			opts?.sloOptions?.wantLogoutResponseSigned ?? false,
		metadata: spData?.metadata,
		privateKey: normalizePem(spData?.privateKey || config.privateKey),
		privateKeyPass: spData?.privateKeyPass,
		isAssertionEncrypted: spData?.isAssertionEncrypted || false,
		encPrivateKey: normalizePem(spData?.encPrivateKey),
		encPrivateKeyPass: spData?.encPrivateKeyPass,
		nameIDFormat: config.identifierFormat
			? [config.identifierFormat]
			: undefined,
		relayState: opts?.relayState,
		clockDrifts:
			opts?.clockSkew && opts?.clockSkew !== 0
				? [-opts.clockSkew, opts.clockSkew]
				: undefined,
	});
}

export function createIdP(config: SAMLConfig) {
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
		entityID: idpData?.entityID || config.issuer,
		singleSignOnService: idpData?.singleSignOnService || [
			{
				Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
				Location: config.entryPoint,
			},
		],
		singleLogoutService: idpData?.singleLogoutService,
		signingCert: idpData?.cert || config.cert,
		wantAuthnRequestsSigned: config.authnRequestsSigned || false,
		isAssertionEncrypted: idpData?.isAssertionEncrypted || false,
		encPrivateKey: normalizePem(idpData?.encPrivateKey),
		encPrivateKeyPass: idpData?.encPrivateKeyPass,
	});
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
