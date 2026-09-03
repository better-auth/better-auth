import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { OAuth2Server } from "oauth2-mock-server";

const [databasePath] = process.argv.slice(2);
const clientId = process.env.BETTER_AUTH_MIGRATION_CLIENT_ID;
const clientSecret = process.env.BETTER_AUTH_MIGRATION_CLIENT_SECRET;
const scimUserId = process.env.BETTER_AUTH_MIGRATION_SCIM_USER_ID;
if (!databasePath || !clientId || !clientSecret || !scimUserId) {
	throw new Error(
		"Usage: BETTER_AUTH_MIGRATION_CLIENT_ID=... BETTER_AUTH_MIGRATION_CLIENT_SECRET=... BETTER_AUTH_MIGRATION_SCIM_USER_ID=... node verify-guided-migration.mjs <database-path>",
	);
}

process.env.BETTER_AUTH_MIGRATION_DATABASE = databasePath;

const baseURL = "http://localhost:3000";
const callbackURL = "https://relying-party.example.com/callback";
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
		email: "directory-user@migration.example.com",
		email_verified: true,
		name: "Published 1.6 Directory User",
		sub: directorySubject,
	};
	response.statusCode = 200;
});
identityProvider.service.on("beforeTokenSigning", (token) => {
	token.payload.email = "directory-user@migration.example.com";
	token.payload.email_verified = true;
	token.payload.name = "Published 1.6 Directory User";
	token.payload.sub = directorySubject;
});
await identityProvider.start(0, "127.0.0.1");
process.env.BETTER_AUTH_MIGRATION_IDP_ISSUER = identityProvider.issuer.url;

const database = new DatabaseSync(databasePath);
try {
	const { auth } = await import("./guided-auth.mjs");
	const administratorSignIn = await auth.api.signInEmail({
		body: {
			email: "administrator@migration.example.com",
			password: "correct-horse-battery-staple",
		},
		returnHeaders: true,
	});
	const administratorCookie = responseCookies(administratorSignIn);
	if (!administratorCookie) {
		throw new Error(
			"Migrated credential sign-in did not create a session cookie",
		);
	}

	const codeVerifier = "guided-migration-code-verifier-which-is-long-enough";
	const codeChallenge = createHash("sha256")
		.update(codeVerifier)
		.digest("base64url");
	const authorizationURL = new URL(`${baseURL}/api/auth/oauth2/authorize`);
	authorizationURL.search = new URLSearchParams({
		client_id: clientId,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
		redirect_uri: callbackURL,
		response_type: "code",
		scope: "openid profile",
		state: "guided-migration-oauth-state",
	}).toString();
	const authorization = await auth.handler(
		new Request(authorizationURL, {
			headers: { cookie: administratorCookie },
			redirect: "manual",
		}),
	);
	const authorizationRedirect = new URL(
		requireLocation(authorization, "Migrated OAuth authorization"),
		baseURL,
	);
	const authorizationCode = authorizationRedirect.searchParams.get("code");
	if (!authorizationCode) {
		throw new Error(
			`Migrated OAuth consent was not reused: ${authorizationRedirect}`,
		);
	}
	const token = await requestJSON(auth, "/oauth2/token", {
		body: new URLSearchParams({
			code: authorizationCode,
			code_verifier: codeVerifier,
			grant_type: "authorization_code",
			redirect_uri: callbackURL,
		}),
		headers: {
			authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
			"content-type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	const reprovisionedUser = await auth.api.createSCIMUser({
		body: {
			externalId: "published-1-6-provisioned-user",
			name: { formatted: "Published 1.6 Provisioned User" },
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			userName: "provisioned-user@migration.example.com",
		},
		headers: { authorization: "Bearer guided-scim-token" },
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
		"Migrated OIDC identity provider",
	);
	const ssoCallback = await auth.handler(
		new Request(ssoCallbackURL, {
			headers: { cookie: ssoStateCookie },
			redirect: "manual",
		}),
	);
	if (ssoCallback.status < 300 || ssoCallback.status >= 400) {
		throw new Error(`Migrated SSO callback failed (${ssoCallback.status})`);
	}

	const accountRows = database
		.prepare(
			`SELECT issuer, accountId, providerId, userId
			 FROM account ORDER BY providerId, accountId`,
		)
		.all();
	const ssoAccounts = accountRows.filter(
		(account) => account.providerId === "workforce-sso",
	);
	if (
		ssoAccounts.length !== 1 ||
		ssoAccounts[0].issuer !== "local:oauth:workforce-sso" ||
		ssoAccounts[0].accountId !== directorySubject
	) {
		throw new Error(
			`Migrated SSO identity was not reused: ${JSON.stringify(ssoAccounts)}`,
		);
	}
	const reprovisioned = database
		.prepare(`SELECT "userId" FROM "scimUser" WHERE "id" = ?`)
		.get(reprovisionedUser.id);
	if (reprovisioned?.userId !== scimUserId) {
		throw new Error(
			`SCIM reprovisioning did not relink the original user: ${JSON.stringify(reprovisioned)}`,
		);
	}

	console.log(
		`GUIDED_MIGRATION_RESULT=${JSON.stringify({
			accountRows,
			credentialUserId: accountRows.find(
				(account) => account.providerId === "credential",
			)?.userId,
			oauthAccessToken: token.body.access_token,
			reprovisionedSCIMUserId: reprovisionedUser.id,
			scimUserId: reprovisioned.userId,
			ssoUserId: ssoAccounts[0].userId,
		})}`,
	);
} finally {
	database.close();
	await identityProvider.stop();
}
