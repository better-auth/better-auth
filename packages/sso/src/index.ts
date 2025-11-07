import { type BetterAuthPlugin } from "better-auth";
import { XMLValidator } from "fast-xml-parser";
import * as saml from "samlify";
import {
	submitDomainVerification,
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
import type { SSOOptions } from "./types";

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

type DomainVerificationEndpoints<O extends SSOOptions> = {
	submitDomainVerification: ReturnType<typeof submitDomainVerification<O>>;
	verifyDomain: ReturnType<typeof verifyDomain<O>>;
};

type SSOEndpoints<O extends SSOOptions> = {
	spMetadata: ReturnType<typeof spMetadata<O>>;
	registerSSOProvider: ReturnType<typeof registerSSOProvider<O>>;
	signInSSO: ReturnType<typeof signInSSO<O>>;
	callbackSSO: ReturnType<typeof callbackSSO<O>>;
	callbackSSOSAML: ReturnType<typeof callbackSSOSAML<O>>;
	acsEndpoint: ReturnType<typeof acsEndpoint<O>>;
};

export function sso<
	O extends SSOOptions & {
		domainVerification?: { enabled: true };
	},
>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O> & DomainVerificationEndpoints<O>;
	schema: any;
	options: O;
};
export function sso<O extends SSOOptions>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O>;
	schema: any;
	options: O;
};

export function sso<O extends SSOOptions>(options?: O | undefined): any {
	let endpoints = {
		spMetadata: spMetadata(options as O),
		registerSSOProvider: registerSSOProvider(options as O),
		signInSSO: signInSSO(options as O),
		callbackSSO: callbackSSO(options as O),
		callbackSSOSAML: callbackSSOSAML(options as O),
		acsEndpoint: acsEndpoint(options as O),
	};

	if (options?.domainVerification?.enabled) {
		const domainVerificationEndpoints = {
			submitDomainVerification: submitDomainVerification(options as O),
			verifyDomain: verifyDomain(options as O),
		};

		endpoints = {
			...endpoints,
			...domainVerificationEndpoints,
		};
	}

	return {
		id: "sso",
		endpoints: {
			...(endpoints as SSOEndpoints<O>),
		},
		schema: {
			ssoProvider: {
				fields: {
					issuer: {
						type: "string",
						required: true,
					},
					oidcConfig: {
						type: "string",
						required: false,
					},
					samlConfig: {
						type: "string",
						required: false,
					},
					userId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
					},
					providerId: {
						type: "string",
						required: true,
						unique: true,
					},
					organizationId: {
						type: "string",
						required: false,
					},
					domain: {
						type: "string",
						required: true,
					},
					...(options?.domainVerification?.enabled
						? { domainVerified: { type: "boolean", required: false } }
						: {}),
				},
			},
		},
		options: options as O,
	} satisfies BetterAuthPlugin;
}
