import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { betterAuth } from "../auth/full";
import { getMigrations } from "./get-migration";

const USER_TABLE = `create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);`;

const SESSION_TABLE = `create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);`;

const VERIFICATION_TABLE = `create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);`;

/** The account table as every v1 release outside 1.7.0 through 1.7.2 declares it. */
const ACCOUNT_TABLE = `create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);`;

/** The account table as 1.7.0 through 1.7.2 declared it, with a required issuer. */
const ACCOUNT_TABLE_WITH_ISSUER = `create table "account" ("id" text not null primary key, "issuer" text not null, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create unique index "account_issuer_accountId_uidx" on "account" ("issuer", "accountId");`;

function createDatabase(accountTable: string) {
	const database = new DatabaseSync(":memory:");
	database.exec(
		[USER_TABLE, SESSION_TABLE, accountTable, VERIFICATION_TABLE].join("\n"),
	);
	return database;
}

function createAuth(database: DatabaseSync) {
	return betterAuth({
		baseURL: "http://localhost:3000",
		secret: "better-auth-secret-that-is-long-enough-for-validation-test",
		database,
		emailAndPassword: { enabled: true },
	});
}

/** Signs a user up, links a social account, then reads it back by its key. */
async function signUpAndLinkSocialAccount(
	auth: ReturnType<typeof createAuth>,
	email: string,
) {
	const signUp = await auth.api.signUpEmail({
		body: { email, password: "correct-horse-battery-staple", name: "Employee" },
	});
	const { internalAdapter } = await auth.$context;
	const linked = await internalAdapter.createAccount({
		providerId: "google",
		accountId: "google-subject",
		userId: signUp.user.id,
	});
	const found = await internalAdapter.findAccountByKey({
		providerId: "google",
		accountId: "google-subject",
	});
	return { signUp, linked, found };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11146
 */
describe("account table compatibility across v1 releases", () => {
	it("asks for no migration and links accounts without the issuer column", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE);
		onTestFinished(() => database.close());
		const auth = createAuth(database);

		const { toBeCreated, toBeAdded } = await getMigrations(auth.options);
		expect(toBeCreated).toEqual([]);
		expect(toBeAdded).toEqual([]);

		const { signUp, linked, found } = await signUpAndLinkSocialAccount(
			auth,
			"without-issuer-column@example.com",
		);
		expect(signUp.user.email).toBe("without-issuer-column@example.com");
		expect(found?.id).toBe(linked.id);
	});

	it("keeps accounts written by 1.7 readable through their provider key", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		const timestamp = new Date().toISOString();
		database.exec(
			`insert into "user" values ('u1', 'Employee', 'written-by-1-7@example.com', 0, null, '${timestamp}', '${timestamp}');
			 insert into "account" values ('a1', 'https://idp.example.com', 'google-subject', 'google', 'u1', null, null, null, null, null, null, null, '${timestamp}', '${timestamp}');`,
		);
		const auth = createAuth(database);

		const { internalAdapter } = await auth.$context;
		const found = await internalAdapter.findAccountByKey({
			providerId: "google",
			accountId: "google-subject",
		});
		expect(found?.id).toBe("a1");
		expect(found?.userId).toBe("u1");
	});

	it("names the leftover issuer column instead of surfacing the driver error", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		const auth = createAuth(database);

		// Migrations never drop a column, so the CLI cannot resolve this state.
		const { toBeCreated, toBeAdded } = await getMigrations(auth.options);
		expect(toBeCreated).toEqual([]);
		expect(toBeAdded).toEqual([]);

		await expect(
			signUpAndLinkSocialAccount(auth, "with-issuer-column@example.com"),
		).rejects.toThrow(/account_issuer_accountId_uidx/);
	});
});
