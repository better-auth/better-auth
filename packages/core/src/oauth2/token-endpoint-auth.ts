import { encodeBasicCredentials } from "./basic-credentials";
import type {
	ClientAssertionGetter,
	ClientAssertionGrantType,
} from "./client-assertion";
import { resolveClientAssertionParams } from "./client-assertion";
import { getPrimaryClientId } from "./utils";

export type TokenEndpointAuth =
	| {
			method: "none";
	  }
	| {
			method: "client_secret_basic";
	  }
	| {
			method: "client_secret_post";
	  }
	| {
			method: "private_key_jwt";
			getClientAssertion: ClientAssertionGetter;
	  };

export type TokenEndpointAuthMethod = TokenEndpointAuth["method"];

export type TokenEndpointSecretAuthentication = "basic" | "post";

export interface TokenEndpointClientOptions {
	clientId?: string | string[] | undefined;
	clientSecret?: string | undefined;
}

export interface ApplyTokenEndpointAuthInput {
	body: URLSearchParams;
	headers: Record<string, string>;
	options: TokenEndpointClientOptions;
	tokenEndpoint: string;
	grantType: ClientAssertionGrantType;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	authentication?: TokenEndpointSecretAuthentication | undefined;
}

function getDefaultTokenEndpointAuth(
	options: TokenEndpointClientOptions,
	authentication?: TokenEndpointSecretAuthentication,
): TokenEndpointAuth {
	if (authentication === "basic") {
		return { method: "client_secret_basic" };
	}
	if (options.clientSecret) {
		return { method: "client_secret_post" };
	}
	return { method: "none" };
}

function assertNoClientSecret(
	method: "none" | "private_key_jwt",
	options: TokenEndpointClientOptions,
	body: URLSearchParams,
) {
	if (options.clientSecret || body.has("client_secret")) {
		throw new Error(
			`${method} token endpoint authentication cannot be combined with clientSecret`,
		);
	}
}

function setClientId(body: URLSearchParams, clientId: string | undefined) {
	if (clientId) {
		body.set("client_id", clientId);
	}
}

function assertClientSecretConfigured(
	method: "client_secret_basic" | "client_secret_post",
	options: TokenEndpointClientOptions,
): asserts options is TokenEndpointClientOptions & { clientSecret: string } {
	if (!options.clientSecret) {
		throw new Error(
			`${method} token endpoint authentication requires clientSecret`,
		);
	}
}

function assertClientIdConfigured(
	method: TokenEndpointAuthMethod,
	clientId: string | undefined,
): asserts clientId is string {
	if (!clientId) {
		throw new Error(
			`${method} token endpoint authentication requires clientId`,
		);
	}
}

function setClientSecretPostAuth({
	body,
	options,
	clientId,
	requireClientSecret,
}: {
	body: URLSearchParams;
	options: TokenEndpointClientOptions;
	clientId: string | undefined;
	requireClientSecret?: boolean | undefined;
}) {
	if (requireClientSecret) {
		assertClientSecretConfigured("client_secret_post", options);
	}
	if (options.clientSecret) {
		assertClientIdConfigured("client_secret_post", clientId);
		setClientId(body, clientId);
		body.set("client_secret", options.clientSecret);
	}
}

function setClientSecretBasicAuth({
	headers,
	options,
	clientId,
	body,
}: {
	headers: Record<string, string>;
	options: TokenEndpointClientOptions;
	clientId: string | undefined;
	body: URLSearchParams;
}) {
	if (body.has("client_secret")) {
		throw new Error(
			"client_secret_basic token endpoint authentication cannot be combined with client_secret body parameters",
		);
	}
	assertClientSecretConfigured("client_secret_basic", options);
	assertClientIdConfigured("client_secret_basic", clientId);
	headers.authorization = encodeBasicCredentials(
		clientId,
		options.clientSecret,
	);
}

function assertCompleteManualClientAssertion(body: URLSearchParams) {
	if (body.has("client_assertion") !== body.has("client_assertion_type")) {
		throw new Error(
			"client_assertion and client_assertion_type must both be provided",
		);
	}
}

export async function applyTokenEndpointAuth({
	body,
	headers,
	options,
	tokenEndpoint,
	grantType,
	tokenEndpointAuth,
	authentication,
}: ApplyTokenEndpointAuthInput) {
	assertCompleteManualClientAssertion(body);

	const clientId = getPrimaryClientId(options.clientId);
	if (body.has("client_assertion")) {
		if (tokenEndpointAuth) {
			throw new Error(
				"client_assertion body parameters cannot be combined with tokenEndpointAuth",
			);
		}
		assertNoClientSecret("private_key_jwt", options, body);
		setClientId(body, clientId);
		return;
	}

	const auth =
		tokenEndpointAuth ?? getDefaultTokenEndpointAuth(options, authentication);

	if (auth.method === "private_key_jwt") {
		assertNoClientSecret(auth.method, options, body);
		assertClientIdConfigured(auth.method, clientId);
		if (!tokenEndpoint) {
			throw new Error(
				"private_key_jwt token endpoint authentication requires tokenEndpoint",
			);
		}
		const assertionParams = await resolveClientAssertionParams({
			getClientAssertion: auth.getClientAssertion,
			context: {
				clientId,
				tokenEndpoint,
				grantType,
			},
		});
		setClientId(body, clientId);
		for (const [key, value] of Object.entries(assertionParams)) {
			body.set(key, value);
		}
		return;
	}

	if (auth.method === "none") {
		assertNoClientSecret(auth.method, options, body);
		if (grantType === "client_credentials") {
			throw new Error(
				"none token endpoint authentication cannot be used with client_credentials grant",
			);
		}
		assertClientIdConfigured(auth.method, clientId);
		setClientId(body, clientId);
		return;
	}

	if (auth.method === "client_secret_basic") {
		setClientSecretBasicAuth({ headers, options, clientId, body });
		return;
	}

	setClientSecretPostAuth({
		body,
		options,
		clientId,
		requireClientSecret: tokenEndpointAuth?.method === "client_secret_post",
	});
}
