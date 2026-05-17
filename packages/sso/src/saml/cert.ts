import { APIError } from "better-auth/api";

export interface CertSourceConfig {
	cert?: string | string[];
	idpMetadata?: {
		metadata?: string;
		cert?: string | string[];
	};
}

/**
 * Validate the cert sources on a SAML config:
 *
 * - Reject when an `idpMetadata.metadata` XML document is paired with an
 *   explicit `cert` or `idpMetadata.cert`. samlify reads signing certificates
 *   from the embedded `<KeyDescriptor>` elements and ignores `signingCert`, so
 *   the explicit values would silently never be used.
 * - Reject when neither metadata XML nor any explicit cert is provided. Without
 *   one of those, samlify cannot verify SAML responses.
 */
export function assertCertSources(config: CertSourceConfig): void {
	const hasMetadataXml = !!config.idpMetadata?.metadata;
	const hasTopLevelCert = config.cert !== undefined;
	const hasIdpCert = config.idpMetadata?.cert !== undefined;

	if (hasMetadataXml && (hasTopLevelCert || hasIdpCert)) {
		throw new APIError("BAD_REQUEST", {
			message:
				"idpMetadata.metadata embeds its own signing certificates; remove `cert` and `idpMetadata.cert` from samlConfig, or omit `idpMetadata.metadata` to declare rolling certs explicitly.",
		});
	}

	if (!hasMetadataXml && !hasTopLevelCert && !hasIdpCert) {
		throw new APIError("BAD_REQUEST", {
			message:
				"samlConfig requires either an IdP signing certificate (`cert` or `idpMetadata.cert`) or an `idpMetadata.metadata` XML document.",
		});
	}
}
