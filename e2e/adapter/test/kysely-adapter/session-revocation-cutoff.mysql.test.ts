import type { BetterAuthOptions } from "@better-auth/core";
import type { SecondaryStorage } from "@better-auth/core/db";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { createPool } from "mysql2/promise";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// Its own database, so suites that recreate `better_auth` cannot drop it mid-run.
const DATABASE = "better_auth_session_cutoff";
const ROOT_URI = "mysql://root:root_password@localhost:3307/";
const admin = createPool({
	uri: ROOT_URI,
});
const mysqlDB = createPool({
	uri: `${ROOT_URI}${DATABASE}`,
	timezone: "Z",
});

const tables = {
	user: "cutoff_user",
	session: "cutoff_session",
	account: "cutoff_account",
	verification: "cutoff_verification",
};

beforeAll(async () => {
	await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
	await admin.query(`CREATE DATABASE \`${DATABASE}\``);
});

afterAll(async () => {
	await mysqlDB.end();
	await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
	await admin.end();
});

function createMemoryStorage(store: Map<string, string>): SecondaryStorage {
	return {
		get: (key) => store.get(key) ?? null,
		set: (key, value) => {
			store.set(key, value);
		},
		delete: (key) => {
			store.delete(key);
		},
		getAndDelete: (key) => {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment: (key) => {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
	};
}

const sessionCookie = (headers: Headers) =>
	headers.get("set-cookie")!.split(";")[0]!;

async function setup(createdAtType: string) {
	const store = new Map<string, string>();
	const options = {
		database: mysqlDB,
		secondaryStorage: createMemoryStorage(store),
		emailAndPassword: {
			enabled: true,
		},
		session: {
			modelName: tables.session,
			storeSessionInDatabase: true,
		},
		user: {
			modelName: tables.user,
		},
		account: {
			modelName: tables.account,
		},
		verification: {
			modelName: tables.verification,
		},
	} satisfies BetterAuthOptions;
	for (const table of Object.values(tables).reverse()) {
		await mysqlDB.query(`DROP TABLE IF EXISTS \`${table}\``);
	}
	await (await getMigrations(options)).runMigrations();
	await mysqlDB.query(
		`ALTER TABLE \`${tables.session}\` MODIFY \`createdAt\` ${createdAtType} NOT NULL`,
	);
	const auth = betterAuth(options);
	const email = `cutoff-${createdAtType.replace(/\W/g, "")}@test.com`;
	const password = "password-123456";
	await auth.api.signUpEmail({
		body: {
			email,
			password,
			name: "Cutoff",
		},
	});
	const signIn = async () => {
		const { headers } = await auth.api.signInEmail({
			body: {
				email,
				password,
			},
			returnHeaders: true,
		});
		return new Headers({ cookie: sessionCookie(headers) });
	};
	const getSession = (headers: Headers) => auth.api.getSession({ headers });
	return { auth, store, password, signIn, getSession };
}

/**
 * Bulk revocation records a millisecond cutoff and compares it with the
 * session's `createdAt`. Legacy MySQL columns without fractional seconds round
 * that value, so both sides of the cutoff are checked on each column type. The
 * clock is pinned so each case lands on a known fraction of a second.
 *
 * @see https://dev.mysql.com/doc/refman/8.4/en/fractional-seconds.html
 */
describe.for(["DATETIME(0)", "DATETIME(3)"])(
	"bulk revocation cutoff on a MySQL %s session.createdAt column",
	(createdAtType) => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("revokes an unindexed session created shortly before the revocation", async () => {
			const { auth, store, signIn, getSession } = await setup(createdAtType);
			const owner = await signIn();
			// Created at .600, which a second-precision column rounds up to 01.000.
			vi.setSystemTime(new Date("2026-01-01T00:00:00.600Z"));
			const unindexed = await signIn();
			const session = await getSession(unindexed);
			const userId = session!.user.id;
			const indexKey = `active-sessions-${userId}`;
			store.set(
				indexKey,
				JSON.stringify(
					(JSON.parse(store.get(indexKey)!) as { token: string }[]).filter(
						(entry) => entry.token !== session!.session.token,
					),
				),
			);
			vi.setSystemTime(new Date("2026-01-01T00:00:00.850Z"));

			await auth.api.revokeSessions({ headers: owner });

			expect(await getSession(unindexed)).toBeNull();
		});

		it("control: keeps the replacement session from changePassword", async () => {
			const { auth, password, signIn, getSession } = await setup(createdAtType);
			const owner = await signIn();
			// Revoked and replaced at 01.200, which a second-precision column rounds down to 01.000.
			vi.setSystemTime(new Date("2026-01-01T00:00:01.200Z"));

			const { headers } = await auth.api.changePassword({
				body: {
					currentPassword: password,
					newPassword: "password-654321",
					revokeOtherSessions: true,
				},
				headers: owner,
				returnHeaders: true,
			});

			const replacement = new Headers({ cookie: sessionCookie(headers) });
			expect(await getSession(replacement)).not.toBeNull();
		});

		it("control: keeps the replacement session after secondary storage loses it", async () => {
			const { auth, store, password, signIn, getSession } =
				await setup(createdAtType);
			const owner = await signIn();
			vi.setSystemTime(new Date("2026-01-01T00:00:01.200Z"));

			const { headers } = await auth.api.changePassword({
				body: {
					currentPassword: password,
					newPassword: "password-654321",
					revokeOtherSessions: true,
				},
				headers: owner,
				returnHeaders: true,
			});
			const replacement = new Headers({ cookie: sessionCookie(headers) });
			const { session } = (await getSession(replacement))!;
			store.delete(session.token);

			expect(await getSession(replacement)).not.toBeNull();
		});
	},
);
