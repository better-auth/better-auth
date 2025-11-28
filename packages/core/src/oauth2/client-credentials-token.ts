import { base64Url } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import type { JWK } from "jose";
import { importJWK, importPKCS8, SignJWT } from "jose";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";

export async function createClientCredentialsTokenRequest({
	options,
	scope,
	authentication = "post",
	resource,
	tokenEndpoint,
}: {
	options: ProviderOptions & { clientSecret: string };
	scope?: string | undefined;
	authentication?: ("basic" | "post" | "pk") | undefined;
	resource?: (string | string[]) | undefined;
	tokenEndpoint?: string | undefined;
}) {
	const body = new URLSearchParams();
	const headers: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};

	body.set("grant_type", "client_credentials");
	scope && body.set("scope", scope);
	if (resource) {
		if (typeof resource === "string") {
			body.append("resource", resource);
		} else {
			for (const _resource of resource) {
				body.append("resource", _resource);
			}
		}
	}
	if (authentication === "basic") {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		const encodedCredentials = base64Url.encode(
			`${primaryClientId}:${options.clientSecret}`,
		);
		headers["authorization"] = `Basic ${encodedCredentials}`;
	} else if (authentication === "post") {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
		body.set("client_secret", options.clientSecret);
	} else {
		const {
			clientPrivateKey,
			clientPrivateKeyId,
			clientPrivateKeyAlg = "RS256",
			clientPrivateKeyType = "jwk",
		} = options;

		let privateKey: CryptoKey | Uint8Array;
		let keyId: string | undefined = clientPrivateKeyId;
		switch (clientPrivateKeyType) {
			case "jwk": {
				const jwk: JWK = JSON.parse(clientPrivateKey || "{}");
				keyId ??= jwk.kid;
				privateKey = await importJWK(jwk, clientPrivateKeyAlg);
				break;
			}
			case "pkcs8": {
				privateKey = await importPKCS8(
					clientPrivateKey || "",
					clientPrivateKeyAlg,
				);
				break;
			}
			default:
				throw new Error("Unsupported client private key type");
		}

		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;

		const clientAssertion = await new SignJWT()
			.setProtectedHeader({ alg: clientPrivateKeyAlg, kid: keyId })
			.setIssuer(primaryClientId)
			.setSubject(primaryClientId)
			.setAudience(tokenEndpoint ?? "")
			.setIssuedAt()
			.setExpirationTime("5m")
			.setJti(crypto.randomUUID())
			.sign(privateKey);

		body.set("client_id", primaryClientId);
		body.set(
			"client_assertion_type",
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		body.set("client_assertion", clientAssertion);
	}

	return {
		body,
		headers,
	};
}

export async function clientCredentialsToken({
	options,
	tokenEndpoint,
	scope,
	authentication,
	resource,
}: {
	options: ProviderOptions & { clientSecret: string };
	tokenEndpoint: string;
	scope: string;
	authentication?: ("basic" | "post" | "pk") | undefined;
	resource?: (string | string[]) | undefined;
}): Promise<OAuth2Tokens> {
	const { body, headers } = await createClientCredentialsTokenRequest({
		options,
		scope,
		authentication,
		resource,
		tokenEndpoint,
	});

	const { data, error } = await betterFetch<{
		access_token: string;
		expires_in?: number | undefined;
		token_type?: string | undefined;
		scope?: string | undefined;
	}>(tokenEndpoint, {
		method: "POST",
		body,
		headers,
	});
	if (error) {
		throw error;
	}
	const tokens: OAuth2Tokens = {
		accessToken: data.access_token,
		tokenType: data.token_type,
		scopes: data.scope?.split(" "),
	};

	if (data.expires_in) {
		const now = new Date();
		tokens.accessTokenExpiresAt = new Date(
			now.getTime() + data.expires_in * 1000,
		);
	}

	return tokens;
}
