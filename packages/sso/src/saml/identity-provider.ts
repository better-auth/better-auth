/**
 * SAML entity factories and signing-cert helpers.
 *
 * This module owns the rules for turning a stored `SAMLConfig` into samlify's
 * `IdentityProvider` and `ServiceProvider`. Every route that needs either entity
 * should call `createIdP` or `createSP` instead of reaching for samlify directly,
 * so cert precedence, option handling, and entity construction stay in one place.
 */
import { APIError } from "better-auth/api";
import * as saml from "samlify";
import type { SAMLConfig } from "../types";
import { SAML_ERROR_CODES } from "./error-codes";

/**
 * The signing certificates Better Auth trusts for this provider, normalized to
 * a list. Returns `undefined` when the certs live inside the IdP metadata XML
 * document (samlify reads them from there directly).
 */
export function resolveSigningCerts(config: SAMLConfig): string[] | undefined {
	const cert = config.idpMetadata?.cert;
	if (cert === undefined) return undefined;
	return Array.isArray(cert) ? cert : [cert];
}

/**
 * Reject SAML configs samlify silently mishandles:
 *
 * - `idpMetadata.metadata` XML supplied alongside `idpMetadata.cert`. samlify
 *   reads signing certs from the embedded `<KeyDescriptor>` and ignores the
 *   `signingCert` argument, so the explicit value would never be used.
 * - No cert source at all. samlify has nothing to verify responses against.
 */
export function validateCertSources(
	config: Pick<SAMLConfig, "idpMetadata">,
): void {
	const hasMetadataXml = !!config.idpMetadata?.metadata;
	const hasIdpCert = config.idpMetadata?.cert !== undefined;

	if (hasMetadataXml && hasIdpCert) {
		throw APIError.from("BAD_REQUEST", SAML_ERROR_CODES.CERT_SOURCE_CONFLICT);
	}

	if (!hasMetadataXml && !hasIdpCert) {
		throw APIError.from("BAD_REQUEST", SAML_ERROR_CODES.CERT_SOURCE_MISSING);
	}
}

/**
 * Build a samlify `IdentityProvider` from a `SAMLConfig`. When metadata XML is
 * supplied, samlify derives everything from it. Otherwise the entity is
 * assembled from `idpMetadata` fields plus the signing certs from
 * `resolveSigningCerts`.
 */
export function createIdP(config: SAMLConfig) {
	const idpData = config.idpMetadata;
	if (idpData?.metadata) {
		return saml.IdentityProvider({
			metadata: idpData.metadata,
			privateKey: idpData.privateKey,
			privateKeyPass: idpData.privateKeyPass,
			isAssertionEncrypted: idpData.isAssertionEncrypted ?? false,
			encPrivateKey: idpData.encPrivateKey,
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
		signingCert: resolveSigningCerts(config),
		wantAuthnRequestsSigned: config.authnRequestsSigned ?? false,
		isAssertionEncrypted: idpData?.isAssertionEncrypted ?? false,
		encPrivateKey: idpData?.encPrivateKey,
		encPrivateKeyPass: idpData?.encPrivateKeyPass,
	});
}

interface SLOOptions {
	wantLogoutRequestSigned?: boolean;
	wantLogoutResponseSigned?: boolean;
}

/**
 * Build a samlify `ServiceProvider` from a `SAMLConfig`. `baseURL` and
 * `providerId` are needed when the config does not supply an explicit callback
 * or SLO URL.
 */
export function createSP(
	config: SAMLConfig,
	baseURL: string,
	providerId: string,
	sloOptions?: SLOOptions,
) {
	const spData = config.spMetadata;
	const sloLocation = `${baseURL}/sso/saml2/sp/slo/${providerId}`;
	return saml.ServiceProvider({
		metadata: spData?.metadata,
		entityID: spData?.entityID || config.issuer,
		assertionConsumerService: spData?.metadata
			? undefined
			: [
					{
						Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
						Location:
							config.callbackUrl || `${baseURL}/sso/saml2/sp/acs/${providerId}`,
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
		privateKey: spData?.privateKey || config.privateKey,
		privateKeyPass: spData?.privateKeyPass,
		isAssertionEncrypted: spData?.isAssertionEncrypted ?? false,
		encPrivateKey: spData?.encPrivateKey,
		encPrivateKeyPass: spData?.encPrivateKeyPass,
		wantMessageSigned: config.wantAssertionsSigned ?? false,
		wantLogoutRequestSigned: sloOptions?.wantLogoutRequestSigned ?? false,
		wantLogoutResponseSigned: sloOptions?.wantLogoutResponseSigned ?? false,
		authnRequestsSigned: config.authnRequestsSigned ?? false,
		nameIDFormat: config.identifierFormat
			? [config.identifierFormat]
			: undefined,
		allowCreate: true,
	});
}
