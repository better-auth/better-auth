import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { oidcProvider } from "better-auth/plugins";
import { OAuth2Server } from "oauth2-mock-server";

const databasePath = process.argv[2];
if (!databasePath) {
	throw new Error("Usage: node seed.mjs <database-path>");
}

const baseURL = "http://localhost:3000";
const callbackURL = "https://relying-party.example.com/callback";
const emailDomain = "migration.example.com";
const identityProvider = new OAuth2Server();
const directorySubject = "published-1-6-directory-subject";

function responseCookies(response) {
	return response.headers
		.getSetCookie()
		.map((value) =>
			value.slice(0, value.indexOf(";") < 0 ? undefined : value.indexOf(";")),
		)
		.join("; ");
}

function requireLocation(response, context) {
	const location = response.headers.get("location");
	if (!location) throw new Error(`${context} did not return a Location header`);
	return location;
}

async function requestJSON(auth, path, init) {
	const response = await auth.handler(
		new Request(`${baseURL}/api/auth${path}`, init),
	);
	const body = await response.json();
	if (!response.ok) {
		throw new Error(
			`${path} failed (${response.status}): ${JSON.stringify(body)}`,
		);
	}
	return { body, response };
}

await identityProvider.issuer.keys.generate("RS256");
identityProvider.service.on("beforeUserinfo", (response) => {
	response.body = {
		email: `directory-user@${emailDomain}`,
		email_verified: true,
		name: "Published 1.6 Directory User",
		sub: directorySubject,
	};
	response.statusCode = 200;
});
identityProvider.service.on("beforeTokenSigning", (token) => {
	token.payload.email = `directory-user@${emailDomain}`;
	token.payload.email_verified = true;
	token.payload.name = "Published 1.6 Directory User";
	token.payload.sub = directorySubject;
});
await identityProvider.start(0, "127.0.0.1");

const database = new DatabaseSync(databasePath);
try {
	const issuer = identityProvider.issuer.url;
	if (!issuer) throw new Error("The mock identity provider has no issuer URL");
	const auth = betterAuth({
		baseURL,
		database,
		emailAndPassword: { enabled: true },
		plugins: [
			oidcProvider({
				allowDynamicClientRegistration: true,
				consentPage: "/consent",
				loginPage: "/login",
				storeClientSecret: "plain",
			}),
			sso({
				defaultSSO: [
					{
						domain: emailDomain,
						oidcConfig: {
							clientId: "published-1-6-sso-client",
							clientSecret: "published-1-6-sso-secret",
							discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
							issuer,
							pkce: false,
						},
						providerId: "workforce-sso",
					},
				],
			}),
			scim(),
		],
		trustedOrigins: [issuer],
	});
	await (await getMigrations(auth.options)).runMigrations();

	const administrator = await auth.api.signUpEmail({
		body: {
			email: `administrator@${emailDomain}`,
			name: "Published 1.6 Administrator",
			password: "correct-horse-battery-staple",
		},
	});
	const administratorSignIn = await auth.api.signInEmail({
		body: {
			email: `administrator@${emailDomain}`,
			password: "correct-horse-battery-staple",
		},
		returnHeaders: true,
	});
	const administratorCookie = responseCookies(administratorSignIn);
	if (!administratorCookie)
		throw new Error("Published 1.6 did not create a session cookie");

	const registeredClient = await auth.api.registerOAuthApplication({
		body: {
			client_name: "Published 1.6 migration client",
			grant_types: ["authorization_code", "refresh_token"],
			redirect_uris: [callbackURL],
			response_types: ["code"],
			token_endpoint_auth_method: "client_secret_basic",
		},
	});
	if (!registeredClient.client_secret) {
		throw new Error("Published 1.6 did not return a client secret");
	}

	const codeVerifier = "published-1-6-code-verifier-which-is-long-enough";
	const codeChallenge = createHash("sha256")
		.update(codeVerifier)
		.digest("base64url");
	const authorizationURL = new URL(`${baseURL}/api/auth/oauth2/authorize`);
	authorizationURL.search = new URLSearchParams({
		client_id: registeredClient.client_id,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
		redirect_uri: callbackURL,
		response_type: "code",
		scope: "openid profile",
		state: "published-1-6-oauth-state",
	}).toString();
	const authorization = await auth.handler(
		new Request(authorizationURL, {
			headers: { cookie: administratorCookie },
			redirect: "manual",
		}),
	);
	const consentURL = new URL(
		requireLocation(authorization, "OAuth authorization"),
		baseURL,
	);
	const consentCode = consentURL.searchParams.get("consent_code");
	if (!consentCode)
		throw new Error(
			`OAuth authorization did not request consent: ${consentURL}`,
		);
	const consent = await auth.api.oAuthConsent({
		body: { accept: true, consent_code: consentCode },
		headers: { cookie: administratorCookie },
	});
	const authorizationCode = new URL(consent.redirectURI).searchParams.get(
		"code",
	);
	if (!authorizationCode)
		throw new Error("OAuth consent did not return an authorization code");
	const token = await requestJSON(auth, "/oauth2/token", {
		body: new URLSearchParams({
			code: authorizationCode,
			code_verifier: codeVerifier,
			grant_type: "authorization_code",
			redirect_uri: callbackURL,
		}),
		headers: {
			authorization: `Basic ${btoa(`${registeredClient.client_id}:${registeredClient.client_secret}`)}`,
			"content-type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	const generatedSCIMToken = await auth.api.generateSCIMToken({
		body: { providerId: "workforce-scim" },
		headers: { cookie: administratorCookie },
	});
	const provisionedUser = await auth.api.createSCIMUser({
		body: {
			name: { formatted: "Published 1.6 Provisioned User" },
			userName: `provisioned-user@${emailDomain}`,
		},
		headers: { authorization: `Bearer ${generatedSCIMToken.scimToken}` },
	});

	const ssoStart = await requestJSON(auth, "/sign-in/sso", {
		body: JSON.stringify({
			callbackURL: `${baseURL}/employee`,
			providerId: "workforce-sso",
		}),
		headers: {
			"content-type": "application/json",
			origin: baseURL,
		},
		method: "POST",
	});
	const ssoStateCookie = responseCookies(ssoStart.response);
	const identityProviderAuthorization = await fetch(ssoStart.body.url, {
		redirect: "manual",
	});
	const ssoCallbackURL = requireLocation(
		identityProviderAuthorization,
		"OIDC identity provider",
	);
	const ssoCallback = await auth.handler(
		new Request(ssoCallbackURL, {
			headers: { cookie: ssoStateCookie },
			redirect: "manual",
		}),
	);
	if (ssoCallback.status < 300 || ssoCallback.status >= 400) {
		throw new Error(
			`Published 1.6 SSO callback failed (${ssoCallback.status})`,
		);
	}

	const accounts = database
		.prepare(
			`SELECT id, accountId, providerId, userId
			 FROM account ORDER BY providerId, accountId`,
		)
		.all();
	const tableCounts = Object.fromEntries(
		[
			"account",
			"oauthAccessToken",
			"oauthApplication",
			"oauthConsent",
			"scimProvider",
			"session",
			"ssoProvider",
			"user",
		].map((table) => [
			table,
			database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count,
		]),
	);
	console.log(
		`PUBLISHED_FIXTURE_RESULT=${JSON.stringify({
			accounts,
			administratorUserId: administrator.user.id,
			clientId: registeredClient.client_id,
			clientSecret: registeredClient.client_secret,
			directorySubject,
			identityProviderIssuer: issuer,
			oauthAccessToken: token.body.access_token,
			provisionedUserId: provisionedUser.id,
			scimAccountId: accounts.find(
				(account) => account.providerId === "workforce-scim",
			)?.id,
			tableCounts,
		})}`,
	);
} finally {
	database.close();
	await identityProvider.stop();
}
