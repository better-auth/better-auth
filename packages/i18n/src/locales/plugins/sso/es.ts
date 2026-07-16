import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const esSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED:
		"El Cierre de Sesión Único (SLO) no está habilitado",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse no válida",
	INVALID_LOGOUT_REQUEST: "LogoutRequest no válida",
	LOGOUT_FAILED_AT_IDP: "Error al cerrar sesión en el IdP",
	IDP_SLO_NOT_SUPPORTED:
		"El IdP no admite el Servicio de Cierre de Sesión Único",
	SAML_PROVIDER_NOT_FOUND: "Proveedor SAML no encontrado",
	CERT_SOURCE_MISSING:
		"samlConfig requiere un certificado de firma (cert o idpMetadata.cert) o un documento XML idpMetadata.metadata.",
};
