import type { JWK_RSA_Private, JWK_RSA_Public } from "jose";
import {
	base64url,
	calculateJwkThumbprint,
	exportJWK,
	generateKeyPair,
	importJWK,
	importPKCS8,
	SignJWT,
} from "jose";
import { getSCIMDemoBaseURL } from "./scim-demo.ts";
import type { SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import {
	isSCIMDemoUserKey,
	SCIM_DEMO_DIRECTORY_USERS,
} from "./scim-demo-catalog.ts";
import {
	createSCIMDemoUserEmail,
	createSCIMDemoUserExternalId,
	isSCIMDemoWorkspaceId,
	parseSCIMDemoUserEmail,
} from "./scim-demo-identity.ts";

export const SCIM_DEMO_SSO_PROVIDER_ID = "scim-demo-sso";
export const SCIM_DEMO_SSO_PROVIDER_INSTANCE_ID = `sso:config:${SCIM_DEMO_SSO_PROVIDER_ID}`;
export const SCIM_DEMO_OIDC_CLIENT_ID = "scim-demo-client";
export const SCIM_DEMO_OIDC_ISSUER_PATH = "/api/scim-demo/idp";
export const SCIM_DEMO_OIDC_AUTHORIZATION_PATH = `${SCIM_DEMO_OIDC_ISSUER_PATH}/authorize`;
export const SCIM_DEMO_OIDC_TOKEN_PATH = `${SCIM_DEMO_OIDC_ISSUER_PATH}/token`;
export const SCIM_DEMO_OIDC_JWKS_PATH = `${SCIM_DEMO_OIDC_ISSUER_PATH}/jwks`;
export const SCIM_DEMO_OIDC_AUTHORIZATION_PAGE_PATH =
	"/scim-demo/idp/authorize";

const SCIM_DEMO_OIDC_CODE_PREFIX = "scim-demo:oidc:code:";
const SCIM_DEMO_OIDC_CODE_TTL_MS = 2 * 60 * 1_000;
const SCIM_DEMO_OIDC_TOKEN_TTL_SECONDS = 5 * 60;
const PKCE_VALUE_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export interface SCIMDemoOIDCAuthorizationRequest {
	clientId: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
	loginHint: string;
	nonce: string | null;
	redirectURI: string;
	responseType: "code";
	scope: string;
	state: string;
}

export interface SCIMDemoOIDCAuthorizationUser {
	displayName: string;
	email: string;
	userKey: SCIMDemoUserKey;
	workspaceId: string;
}

export type SCIMDemoOIDCAuthorizationView =
	| {
			request: SCIMDemoOIDCAuthorizationRequest;
			loginHintUser: SCIMDemoOIDCAuthorizationUser;
			status: "ready";
	  }
	| {
			message: string;
			status: "invalid";
	  };

export type SCIMDemoOIDCSearchParams =
	| URLSearchParams
	| Readonly<Record<string, string | string[] | undefined>>;

export interface SCIMDemoOIDCVerificationStore {
	consumeVerificationValue(
		identifier: string,
	): Promise<{ value: string } | null>;
	createVerificationValue(input: {
		expiresAt: Date;
		identifier: string;
		value: string;
	}): Promise<unknown>;
}

export interface SCIMDemoOIDCTokenResponse {
	access_token: string;
	expires_in: number;
	id_token: string;
	scope: string;
	token_type: "Bearer";
}

interface SCIMDemoOIDCAuthorizationCode {
	clientId: string;
	codeChallenge: string;
	email: string;
	name: string;
	nonce: string | null;
	redirectURI: string;
	scope: string;
	subject: string;
}

type SCIMDemoOIDCError = Error & {
	code: string;
	status: number;
};

interface SCIMDemoOIDCSigningKeys {
	privateKey: CryptoKey;
	publicJWK: JWK_RSA_Public;
}

const oidcRuntime = globalThis as typeof globalThis & {
	__betterAuthSCIMDemoOIDCSigningKeys?: Promise<SCIMDemoOIDCSigningKeys>;
};

function createOIDCError(message: string, code: string, status = 400) {
	return Object.assign(new Error(message), {
		code,
		status,
	}) satisfies SCIMDemoOIDCError;
}

export function getSCIMDemoOIDCError(error: unknown) {
	if (
		error instanceof Error &&
		"code" in error &&
		typeof error.code === "string" &&
		"status" in error &&
		typeof error.status === "number"
	) {
		return { code: error.code, message: error.message, status: error.status };
	}
	return {
		code: "server_error",
		message: "The demo identity provider could not complete the request",
		status: 500,
	};
}

function readSearchParam(input: SCIMDemoOIDCSearchParams, name: string) {
	if (input instanceof URLSearchParams) return input.get(name);
	const value = input[name];
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getDirectoryUser(userKey: SCIMDemoUserKey) {
	const user = SCIM_DEMO_DIRECTORY_USERS.find((entry) => entry.key === userKey);
	if (!user) throw createOIDCError("Directory user not found", "access_denied");
	return user;
}

function parseAuthorizationRequest(
	searchParams: SCIMDemoOIDCSearchParams,
): SCIMDemoOIDCAuthorizationRequest {
	const responseType = readSearchParam(searchParams, "response_type");
	const clientId = readSearchParam(searchParams, "client_id");
	const redirectURI = readSearchParam(searchParams, "redirect_uri");
	const scope = readSearchParam(searchParams, "scope")?.trim();
	const state = readSearchParam(searchParams, "state");
	const codeChallenge = readSearchParam(searchParams, "code_challenge");
	const codeChallengeMethod = readSearchParam(
		searchParams,
		"code_challenge_method",
	);
	const nonce = readSearchParam(searchParams, "nonce");
	const loginHint = readSearchParam(searchParams, "login_hint");

	if (responseType !== "code") {
		throw createOIDCError(
			"Only the authorization code flow is supported",
			"unsupported_response_type",
		);
	}
	if (clientId !== SCIM_DEMO_OIDC_CLIENT_ID) {
		throw createOIDCError("Unknown OAuth client", "unauthorized_client");
	}
	if (redirectURI !== getSCIMDemoOIDCRedirectURI()) {
		throw createOIDCError("Invalid OAuth redirect URI", "invalid_request");
	}
	if (!scope || !scope.split(/\s+/).includes("openid")) {
		throw createOIDCError("The openid scope is required", "invalid_scope");
	}
	if (!state || state.length > 2_048) {
		throw createOIDCError("A valid OAuth state is required", "invalid_request");
	}
	if (nonce && nonce.length > 2_048) {
		throw createOIDCError("The OAuth nonce is too long", "invalid_request");
	}
	if (!codeChallenge || !PKCE_VALUE_PATTERN.test(codeChallenge)) {
		throw createOIDCError(
			"A valid PKCE challenge is required",
			"invalid_request",
		);
	}
	if (codeChallengeMethod !== "S256") {
		throw createOIDCError("PKCE S256 is required", "invalid_request");
	}
	if (!loginHint || !parseSCIMDemoUserEmail(loginHint)) {
		throw createOIDCError(
			"Choose a provisioned demo employee before continuing",
			"login_required",
		);
	}
	return {
		clientId,
		codeChallenge,
		codeChallengeMethod,
		loginHint,
		nonce: nonce || null,
		redirectURI,
		responseType,
		scope,
		state,
	};
}

export function getSCIMDemoOIDCAuthorizationView(
	searchParams: SCIMDemoOIDCSearchParams,
): SCIMDemoOIDCAuthorizationView {
	try {
		const request = parseAuthorizationRequest(searchParams);
		const identity = parseSCIMDemoUserEmail(request.loginHint);
		if (!identity) {
			return { status: "invalid", message: "Invalid demo employee identity" };
		}
		const user = getDirectoryUser(identity.userKey);
		return {
			status: "ready",
			request,
			loginHintUser: {
				displayName: user.displayName,
				email: createSCIMDemoUserEmail(identity.workspaceId, identity.userKey),
				userKey: identity.userKey,
				workspaceId: identity.workspaceId,
			},
		};
	} catch (error) {
		return { status: "invalid", message: getSCIMDemoOIDCError(error).message };
	}
}

export function getSCIMDemoOIDCAuthorizationPageURL(
	request: SCIMDemoOIDCAuthorizationRequest,
) {
	const url = new URL(
		SCIM_DEMO_OIDC_AUTHORIZATION_PAGE_PATH,
		getSCIMDemoBaseURL(),
	);
	for (const [name, value] of Object.entries(
		getSCIMDemoOIDCAuthorizationFormFields(request),
	)) {
		if (value) url.searchParams.set(name, value);
	}
	return url;
}

export function getSCIMDemoOIDCAuthorizationFormFields(
	request: SCIMDemoOIDCAuthorizationRequest,
) {
	return {
		client_id: request.clientId,
		redirect_uri: request.redirectURI,
		response_type: request.responseType,
		scope: request.scope,
		state: request.state,
		code_challenge: request.codeChallenge,
		code_challenge_method: request.codeChallengeMethod,
		nonce: request.nonce ?? "",
		login_hint: request.loginHint,
	} as const;
}

export function getSCIMDemoOIDCIssuer() {
	return `${getSCIMDemoBaseURL()}${SCIM_DEMO_OIDC_ISSUER_PATH}`;
}

export function getSCIMDemoOIDCRedirectURI() {
	return `${getSCIMDemoBaseURL()}/api/auth/sso/callback/${SCIM_DEMO_SSO_PROVIDER_ID}`;
}

export function getSCIMDemoOIDCClientSecret() {
	const value = process.env.SCIM_DEMO_OIDC_CLIENT_SECRET;
	if (!value) {
		throw new Error(
			"SCIM_DEMO_OIDC_CLIENT_SECRET is required when the SCIM demo is enabled",
		);
	}
	return value;
}

export function getSCIMDemoOIDCProvider() {
	const issuer = getSCIMDemoOIDCIssuer();
	return {
		domain: "acme.example",
		providerId: SCIM_DEMO_SSO_PROVIDER_ID,
		oidcConfig: {
			issuer,
			clientId: SCIM_DEMO_OIDC_CLIENT_ID,
			clientSecret: getSCIMDemoOIDCClientSecret(),
			discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
			pkce: true,
			scopes: ["openid", "email", "profile"],
			tokenEndpointAuthentication: "client_secret_post" as const,
		},
	};
}

export function getSCIMDemoOIDCDiscoveryDocument() {
	const issuer = getSCIMDemoOIDCIssuer();
	return {
		issuer,
		authorization_endpoint: `${getSCIMDemoBaseURL()}${SCIM_DEMO_OIDC_AUTHORIZATION_PATH}`,
		token_endpoint: `${getSCIMDemoBaseURL()}${SCIM_DEMO_OIDC_TOKEN_PATH}`,
		jwks_uri: `${getSCIMDemoBaseURL()}${SCIM_DEMO_OIDC_JWKS_PATH}`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code"],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256"],
		scopes_supported: ["openid", "email", "profile"],
		token_endpoint_auth_methods_supported: ["client_secret_post"],
		code_challenge_methods_supported: ["S256"],
		claims_supported: ["sub", "email", "email_verified", "name", "nonce"],
	};
}

function isRSAPrivateJWK(value: unknown): value is JWK_RSA_Private {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const key = value as Record<string, unknown>;
	return (
		key.kty === "RSA" &&
		["d", "dp", "dq", "e", "n", "p", "q", "qi"].every(
			(parameter) => typeof key[parameter] === "string",
		)
	);
}

async function createSigningKeys(privateJWK: JWK_RSA_Private) {
	const importedKey = await importJWK(
		{
			...privateJWK,
			alg: "RS256",
			key_ops: ["sign"],
			use: "sig",
		},
		"RS256",
	);
	if (importedKey instanceof Uint8Array) {
		throw new Error("The SCIM demo OIDC signing key must be asymmetric");
	}
	const publicKey = {
		alg: "RS256",
		e: privateJWK.e,
		kty: "RSA",
		n: privateJWK.n,
		use: "sig",
	} satisfies JWK_RSA_Public;
	return {
		privateKey: importedKey,
		publicJWK: {
			...publicKey,
			kid: await calculateJwkThumbprint(publicKey),
		},
	} satisfies SCIMDemoOIDCSigningKeys;
}

async function importConfiguredSigningKeys(value: string) {
	try {
		if (value.startsWith("{")) {
			const parsed: unknown = JSON.parse(value);
			if (!isRSAPrivateJWK(parsed)) throw new Error("Invalid RSA private JWK");
			return createSigningKeys(parsed);
		}

		const privateKey = await importPKCS8(
			value.replaceAll("\\n", "\n"),
			"RS256",
			{
				extractable: true,
			},
		);
		const privateJWK = await exportJWK(privateKey);
		if (!isRSAPrivateJWK(privateJWK))
			throw new Error("Invalid RSA private key");
		return createSigningKeys(privateJWK);
	} catch {
		throw new Error(
			"SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY must contain an RSA private JWK or PKCS#8 PEM key for RS256",
		);
	}
}

function isLoopbackOIDCIssuer() {
	const hostname = new URL(getSCIMDemoOIDCIssuer()).hostname;
	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
	);
}

async function loadSigningKeys() {
	const configuredKey = process.env.SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY?.trim();
	if (configuredKey) return importConfiguredSigningKeys(configuredKey);
	if (!isLoopbackOIDCIssuer()) {
		throw new Error(
			"SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY is required when the SCIM demo issuer is not loopback",
		);
	}

	const generatedKeys = await generateKeyPair("RS256", { extractable: true });
	const privateJWK = await exportJWK(generatedKeys.privateKey);
	if (!isRSAPrivateJWK(privateJWK)) {
		throw new Error("The SCIM demo could not generate an RSA signing key");
	}
	return createSigningKeys(privateJWK);
}

async function getSigningKeys() {
	if (!oidcRuntime.__betterAuthSCIMDemoOIDCSigningKeys) {
		oidcRuntime.__betterAuthSCIMDemoOIDCSigningKeys = loadSigningKeys();
	}
	return oidcRuntime.__betterAuthSCIMDemoOIDCSigningKeys;
}

export async function getSCIMDemoOIDCJWKS() {
	const { publicJWK } = await getSigningKeys();
	return {
		keys: [publicJWK],
	};
}

export async function issueSCIMDemoOIDCAuthorizationCode(
	store: Pick<SCIMDemoOIDCVerificationStore, "createVerificationValue">,
	searchParams: SCIMDemoOIDCSearchParams,
	selection: { userKey: string; workspaceId: string },
) {
	const request = parseAuthorizationRequest(searchParams);
	if (
		!isSCIMDemoUserKey(selection.userKey) ||
		!isSCIMDemoWorkspaceId(selection.workspaceId)
	) {
		throw createOIDCError("Invalid demo employee selection", "access_denied");
	}
	const hintedIdentity = parseSCIMDemoUserEmail(request.loginHint);
	if (!hintedIdentity || hintedIdentity.workspaceId !== selection.workspaceId) {
		throw createOIDCError(
			"The selected employee does not belong to this demo workspace",
			"access_denied",
		);
	}
	const user = getDirectoryUser(selection.userKey);
	const authorizationCode = crypto.randomUUID();
	const record: SCIMDemoOIDCAuthorizationCode = {
		clientId: request.clientId,
		codeChallenge: request.codeChallenge,
		email: createSCIMDemoUserEmail(selection.workspaceId, selection.userKey),
		name: user.displayName,
		nonce: request.nonce,
		redirectURI: request.redirectURI,
		scope: request.scope,
		subject: createSCIMDemoUserExternalId(
			selection.workspaceId,
			selection.userKey,
		),
	};
	await store.createVerificationValue({
		identifier: `${SCIM_DEMO_OIDC_CODE_PREFIX}${authorizationCode}`,
		value: JSON.stringify(record),
		expiresAt: new Date(Date.now() + SCIM_DEMO_OIDC_CODE_TTL_MS),
	});
	const callback = new URL(request.redirectURI);
	callback.searchParams.set("code", authorizationCode);
	callback.searchParams.set("state", request.state);
	return callback;
}

function isAuthorizationCode(
	value: unknown,
): value is SCIMDemoOIDCAuthorizationCode {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.clientId === "string" &&
		typeof record.codeChallenge === "string" &&
		typeof record.email === "string" &&
		typeof record.name === "string" &&
		(record.nonce === null || typeof record.nonce === "string") &&
		typeof record.redirectURI === "string" &&
		typeof record.scope === "string" &&
		typeof record.subject === "string"
	);
}

function parseAuthorizationCode(value: string) {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw createOIDCError("Invalid authorization code", "invalid_grant");
	}
	if (!isAuthorizationCode(parsed)) {
		throw createOIDCError("Invalid authorization code", "invalid_grant");
	}
	return parsed;
}

function secretsMatch(left: string, right: string) {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	let difference = leftBytes.length ^ rightBytes.length;
	const length = Math.max(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return difference === 0;
}

export async function exchangeSCIMDemoOIDCAuthorizationCode(
	store: Pick<SCIMDemoOIDCVerificationStore, "consumeVerificationValue">,
	form: URLSearchParams,
): Promise<SCIMDemoOIDCTokenResponse> {
	if (form.get("grant_type") !== "authorization_code") {
		throw createOIDCError(
			"Only the authorization_code grant is supported",
			"unsupported_grant_type",
		);
	}
	if (form.get("client_id") !== SCIM_DEMO_OIDC_CLIENT_ID) {
		throw createOIDCError("Invalid OAuth client", "invalid_client", 401);
	}
	const clientSecret = form.get("client_secret");
	if (
		!clientSecret ||
		!secretsMatch(clientSecret, getSCIMDemoOIDCClientSecret())
	) {
		throw createOIDCError("Invalid OAuth client", "invalid_client", 401);
	}
	const code = form.get("code");
	const redirectURI = form.get("redirect_uri");
	const codeVerifier = form.get("code_verifier");
	if (!code || !redirectURI || !codeVerifier) {
		throw createOIDCError(
			"Authorization code, redirect URI, and PKCE verifier are required",
			"invalid_request",
		);
	}
	if (!PKCE_VALUE_PATTERN.test(codeVerifier)) {
		throw createOIDCError("Invalid PKCE verifier", "invalid_grant");
	}

	const verification = await store.consumeVerificationValue(
		`${SCIM_DEMO_OIDC_CODE_PREFIX}${code}`,
	);
	if (!verification) {
		throw createOIDCError(
			"Authorization code is invalid, expired, or already used",
			"invalid_grant",
		);
	}
	const record = parseAuthorizationCode(verification.value);
	if (
		record.clientId !== SCIM_DEMO_OIDC_CLIENT_ID ||
		record.redirectURI !== redirectURI ||
		redirectURI !== getSCIMDemoOIDCRedirectURI()
	) {
		throw createOIDCError(
			"Authorization code binding is invalid",
			"invalid_grant",
		);
	}
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(codeVerifier),
	);
	if (
		!secretsMatch(
			base64url.encode(new Uint8Array(digest)),
			record.codeChallenge,
		)
	) {
		throw createOIDCError("PKCE verification failed", "invalid_grant");
	}

	const { privateKey, publicJWK } = await getSigningKeys();
	const idToken = await new SignJWT({
		email: record.email,
		email_verified: true,
		name: record.name,
		...(record.nonce ? { nonce: record.nonce } : {}),
	})
		.setProtectedHeader({ alg: "RS256", kid: publicJWK.kid })
		.setIssuer(getSCIMDemoOIDCIssuer())
		.setAudience(SCIM_DEMO_OIDC_CLIENT_ID)
		.setSubject(record.subject)
		.setIssuedAt()
		.setExpirationTime(`${SCIM_DEMO_OIDC_TOKEN_TTL_SECONDS}s`)
		.sign(privateKey);
	return {
		access_token: crypto.randomUUID(),
		expires_in: SCIM_DEMO_OIDC_TOKEN_TTL_SECONDS,
		id_token: idToken,
		scope: record.scope,
		token_type: "Bearer",
	};
}
