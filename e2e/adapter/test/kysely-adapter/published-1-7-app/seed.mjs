import { DatabaseSync } from "node:sqlite";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const [databasePath, identityProviderIssuer] = process.argv.slice(2);
if (!databasePath || !identityProviderIssuer) {
	throw new Error(
		"Usage: node seed.mjs <database-path> <identity-provider-issuer>",
	);
}

const baseURL = "http://localhost:3000";
const directorySubject = "published-1-7-directory-subject";

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

const database = new DatabaseSync(databasePath);
try {
	const auth = betterAuth({
		baseURL,
		database,
		emailAndPassword: { enabled: true },
		plugins: [
			sso({
				defaultSSO: [
					{
						domain: "migration.example.com",
						oidcConfig: {
							clientId: "published-1-7-sso-client",
							clientSecret: "published-1-7-sso-secret",
							discoveryEndpoint: `${identityProviderIssuer}/.well-known/openid-configuration`,
							issuer: identityProviderIssuer,
							pkce: false,
						},
						providerId: "workforce-sso",
					},
				],
			}),
		],
		trustedOrigins: [identityProviderIssuer],
	});
	await (await getMigrations(auth.options)).runMigrations();

	const administrator = await auth.api.signUpEmail({
		body: {
			email: "administrator@migration.example.com",
			name: "Published 1.7 Administrator",
			password: "correct-horse-battery-staple",
		},
	});
	const ssoStart = await requestJSON(auth, "/sign-in/sso", {
		body: JSON.stringify({
			callbackURL: `${baseURL}/employee`,
			providerId: "workforce-sso",
		}),
		headers: { "content-type": "application/json", origin: baseURL },
		method: "POST",
	});
	const identityProviderAuthorization = await fetch(ssoStart.body.url, {
		redirect: "manual",
	});
	const ssoCallback = await auth.handler(
		new Request(
			requireLocation(
				identityProviderAuthorization,
				"Published 1.7 OIDC identity provider",
			),
			{
				headers: { cookie: responseCookies(ssoStart.response) },
				redirect: "manual",
			},
		),
	);
	if (ssoCallback.status < 300 || ssoCallback.status >= 400) {
		throw new Error(
			`Published 1.7 SSO callback failed (${ssoCallback.status})`,
		);
	}

	const accounts = database
		.prepare(
			`SELECT issuer, accountId, providerId, userId
			 FROM account ORDER BY providerId, accountId`,
		)
		.all();
	console.log(
		`PUBLISHED_1_7_FIXTURE_RESULT=${JSON.stringify({
			accounts,
			administratorUserId: administrator.user.id,
			directorySubject,
		})}`,
	);
} finally {
	database.close();
}
