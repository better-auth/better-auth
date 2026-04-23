import type { DBAdapter } from "@better-auth/core/db/adapter";
import { saml } from "../samlify.js";
import type { SAMLConfig, SSOOptions, SSOProvider } from "../types.js";
import { safeJsonParse } from "../utils.js";

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
		entityID: spData?.entityID || config.issuer,
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
		privateKey: spData?.privateKey || config.privateKey,
		privateKeyPass: spData?.privateKeyPass,
		isAssertionEncrypted: spData?.isAssertionEncrypted || false,
		encPrivateKey: spData?.encPrivateKey,
		encPrivateKeyPass: spData?.encPrivateKeyPass,
		nameIDFormat: config.identifierFormat
			? [config.identifierFormat]
			: undefined,
		relayState: opts?.relayState,
	});
}

export function createIdP(config: SAMLConfig) {
	const idpData = config.idpMetadata;
	if (idpData?.metadata) {
		return saml.IdentityProvider({
			metadata: idpData.metadata,
			privateKey: idpData.privateKey,
			privateKeyPass: idpData.privateKeyPass,
			isAssertionEncrypted: idpData.isAssertionEncrypted,
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
		signingCert: idpData?.cert || config.cert,
		wantAuthnRequestsSigned: config.authnRequestsSigned || false,
		isAssertionEncrypted: idpData?.isAssertionEncrypted || false,
		encPrivateKey: idpData?.encPrivateKey,
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

export function createSAMLPostForm(
	action: string,
	samlParam: string,
	samlValue: string,
	relayState?: string,
): Response {
	const safeAction = escapeHtml(action);
	const safeSamlParam = escapeHtml(samlParam);
	const safeSamlValue = escapeHtml(samlValue);
	const safeRelayState = relayState ? escapeHtml(relayState) : undefined;

	const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit();"><form method="POST" action="${safeAction}"><input type="hidden" name="${safeSamlParam}" value="${safeSamlValue}" />${safeRelayState ? `<input type="hidden" name="RelayState" value="${safeRelayState}" />` : ""}<noscript><input type="submit" value="Continue" /></noscript></form></body></html>`;
	return new Response(html, { headers: { "Content-Type": "text/html" } });
}
