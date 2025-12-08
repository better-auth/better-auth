import { type BetterAuthPlugin } from "better-auth";
import { XMLValidator } from "fast-xml-parser";
import * as saml from "samlify";
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

type SSOEndpoints = {
	spMetadata: ReturnType<typeof spMetadata>;
	registerSSOProvider: ReturnType<typeof registerSSOProvider>;
	signInSSO: ReturnType<typeof signInSSO>;
	callbackSSO: ReturnType<typeof callbackSSO>;
	callbackSSOSAML: ReturnType<typeof callbackSSOSAML>;
	acsEndpoint: ReturnType<typeof acsEndpoint>;
};

export function sso<O extends SSOOptions>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints;
};

export function sso<O extends SSOOptions>(options?: O | undefined): any {
	return {
		id: "sso",
		endpoints: {
			spMetadata: spMetadata(),
			registerSSOProvider: registerSSOProvider(options),
			signInSSO: signInSSO(options),
			callbackSSO: callbackSSO(options),
			callbackSSOSAML: callbackSSOSAML(options),
			acsEndpoint: acsEndpoint(options),
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
				},
			},
		},
	} satisfies BetterAuthPlugin;
}
