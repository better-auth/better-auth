import type { DBAdapter } from "@better-auth/core/db/adapter";
import { saml } from "../samlify";
import type { SAMLConfig, SSOOptions, SSOProvider } from "../types";
import { safeJsonParse } from "../utils";

/**
 * Normalizes a PEM string by trimming leading/trailing whitespace from each
 * line. Native `crypto.createPrivateKey` (used by samlify 2.12+) rejects PEM
 * blocks with leading whitespace, which is common when keys are stored in
 * indented config files, environment variables, or JSON.
 */
function normalizePem(pem: string | undefined): string | undefined {
	if (!pem) return pem;
	return pem
		.split("\n")
		.map((line) => line.trim())
		.join("\n");
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
					wantMessageSigned: config.wantAssertionsSigned || false,
					authnRequestsSigned: config.authnRequestsSigned || false,
					nameIDFormat: config.identifierFormat
						? [config.identifierFormat]
						: undefined,
				})
				.getMetadata() || "";
	}

	return saml.ServiceProvider({
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
		signingCert: normalizePem(idpData?.cert || config.cert),
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
