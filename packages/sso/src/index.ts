import type { BetterAuthPlugin } from "better-auth";
import { XMLValidator } from "fast-xml-parser";
import * as saml from "samlify";
import {
	requestDomainVerification,
	verifyDomain,
} from "./routes/domain-verification";
import {
	acsEndpoint,
	callbackSSO,
	callbackSSOSAML,
	registerSSOProvider,
	signInSSO,
	spMetadata,
} from "./routes/sso";
import type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider } from "./types";

export type { SAMLConfig, OIDCConfig, SSOOptions, SSOProvider };

const fastValidator = {
	async validate(xml: string) {
		const isValid = XMLValidator.validate(xml, {
			allowBooleanAttributes: true,
		});
		if (isValid === true) return "SUCCESS_VALIDATE_XML";
		throw "ERR_INVALID_XML";
	},
};

saml.setSchemaValidator(fastValidator);

type DomainVerificationEndpoints = {
	requestDomainVerification: ReturnType<typeof requestDomainVerification>;
	verifyDomain: ReturnType<typeof verifyDomain>;
};

type SSOEndpoints<O extends SSOOptions> = {
	spMetadata: ReturnType<typeof spMetadata>;
	registerSSOProvider: ReturnType<typeof registerSSOProvider<O>>;
	signInSSO: ReturnType<typeof signInSSO>;
	callbackSSO: ReturnType<typeof callbackSSO>;
	callbackSSOSAML: ReturnType<typeof callbackSSOSAML>;
	acsEndpoint: ReturnType<typeof acsEndpoint>;
};

export type SSOPlugin<O extends SSOOptions> = {
	id: "sso";
	endpoints: SSOEndpoints<O> &
		(O extends { domainVerification: { enabled: true } }
			? DomainVerificationEndpoints
			: {});
};

export function sso<
	O extends SSOOptions & {
		domainVerification?: { enabled: true };
	},
>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O> & DomainVerificationEndpoints;
	schema: any;
	options: O;
};
export function sso<O extends SSOOptions>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O>;
};

export function sso<O extends SSOOptions>(options?: O | undefined): any {
	let endpoints = {
		spMetadata: spMetadata(),
		registerSSOProvider: registerSSOProvider(options as O),
		signInSSO: signInSSO(options as O),
		callbackSSO: callbackSSO(options as O),
		callbackSSOSAML: callbackSSOSAML(options as O),
		acsEndpoint: acsEndpoint(options as O),
	};

	if (options?.domainVerification?.enabled) {
		const domainVerificationEndpoints = {
			requestDomainVerification: requestDomainVerification(options as O),
			verifyDomain: verifyDomain(options as O),
		};

		endpoints = {
			...endpoints,
			...domainVerificationEndpoints,
		};
	}

	return {
		id: "sso",
		endpoints,
		schema: {
			ssoProvider: {
				modelName: options?.modelName ?? "ssoProvider",
				fields: {
					issuer: {
						type: "string",
						required: true,
						fieldName: options?.fields?.issuer ?? "issuer",
					},
					oidcConfig: {
						type: "string",
						required: false,
						fieldName: options?.fields?.oidcConfig ?? "oidcConfig",
					},
					samlConfig: {
						type: "string",
						required: false,
						fieldName: options?.fields?.samlConfig ?? "samlConfig",
					},
					userId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						fieldName: options?.fields?.userId ?? "userId",
					},
					providerId: {
						type: "string",
						required: true,
						unique: true,
						fieldName: options?.fields?.providerId ?? "providerId",
					},
					organizationId: {
						type: "string",
						required: false,
						fieldName: options?.fields?.organizationId ?? "organizationId",
					},
					domain: {
						type: "string",
						required: true,
						fieldName: options?.fields?.domain ?? "domain",
					},
					...(options?.domainVerification?.enabled
						? { domainVerified: { type: "boolean", required: false } }
						: {}),
				},
			},
		},
	} satisfies BetterAuthPlugin;
}
