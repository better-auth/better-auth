/**
 * IdP signing-certificate rules for SAML configs. Centralized so the runtime
 * verification path (`createIdP`), the sanitizer (`getSSOProvider` and
 * friends), and the registration validator agree on precedence and the
 * "exactly one cert source" contract.
 */
import { APIError } from "better-auth/api";
import type { SAMLConfig } from "../types";
import { SAML_ERROR_CODES } from "./error-codes";

/**
 * Returns the IdP signing certificates Better Auth trusts for this provider
 * as a list. `idpMetadata.cert` wins when both are set; the top-level `cert`
 * is the fallback. Returns `undefined` when neither is set (the certs come
 * from `idpMetadata.metadata` XML instead).
 */
export function resolveSigningCerts(
	config: Pick<SAMLConfig, "cert" | "idpMetadata">,
): string[] | undefined {
	const cert = config.idpMetadata?.cert ?? config.cert;
	if (cert === undefined) return undefined;
	return Array.isArray(cert) ? cert : [cert];
}

/**
 * Reject SAML configs with no signing-cert source. samlify needs either an
 * `idpMetadata.metadata` XML document (which embeds the certs) or an explicit
 * PEM under `cert` or `idpMetadata.cert`; without one of those it has nothing
 * to verify responses against.
 */
export function validateCertSources(
	config: Pick<SAMLConfig, "cert" | "idpMetadata">,
): void {
	const hasMetadataXml = !!config.idpMetadata?.metadata;
	const hasExplicitCert =
		config.idpMetadata?.cert !== undefined || config.cert !== undefined;

	if (!hasMetadataXml && !hasExplicitCert) {
		throw APIError.from("BAD_REQUEST", SAML_ERROR_CODES.CERT_SOURCE_MISSING);
	}
}
