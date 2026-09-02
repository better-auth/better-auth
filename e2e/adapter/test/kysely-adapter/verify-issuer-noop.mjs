import { DatabaseSync } from "node:sqlite";

const [databasePath, identityProviderIssuer] = process.argv.slice(2);
if (!databasePath || !identityProviderIssuer) {
	throw new Error(
		"Usage: node verify-issuer-noop.mjs <database-path> <identity-provider-issuer>",
	);
}

process.env.BETTER_AUTH_MIGRATION_DATABASE = databasePath;
process.env.BETTER_AUTH_MIGRATION_IDP_ISSUER = identityProviderIssuer;

const baseURL = "http://localhost:3000";

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
	const { auth } = await import("./issuer-auth.mjs");
	const credentialSignIn = await auth.api.signInEmail({
		body: {
			email: "administrator@migration.example.com",
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
				"Current OIDC identity provider",
			),
			{
				headers: { cookie: responseCookies(ssoStart.response) },
				redirect: "manual",
			},
		),
	);
	if (ssoCallback.status < 300 || ssoCallback.status >= 400) {
		throw new Error(`Current SSO callback failed (${ssoCallback.status})`);
	}

	const accounts = database
		.prepare(
			`SELECT issuer, accountId, providerId, userId
			 FROM account ORDER BY providerId, accountId`,
		)
		.all();
	console.log(
		`ISSUER_NOOP_RESULT=${JSON.stringify({
			accounts,
			credentialUserId: credentialSignIn.user.id,
		})}`,
	);
} finally {
	database.close();
}
