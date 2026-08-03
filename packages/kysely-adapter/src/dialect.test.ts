import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import type {
	DatabaseIntrospector,
	Dialect,
	DialectAdapter,
	Driver,
	Kysely as KyselyInstance,
	QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import { createKyselyAdapter } from "./dialect";

class StubDriver implements Driver {
	async init(): Promise<void> {}
	async acquireConnection(): Promise<never> {
		throw new Error("not implemented");
	}
	async beginTransaction(): Promise<void> {}
	async commitTransaction(): Promise<void> {}
	async rollbackTransaction(): Promise<void> {}
	async releaseConnection(): Promise<void> {}
	async destroy(): Promise<void> {}
}

class UnknownDialect implements Dialect {
	createDriver(): Driver {
		return new StubDriver();
	}
	createQueryCompiler(): QueryCompiler {
		return {} as QueryCompiler;
	}
	createAdapter(): DialectAdapter {
		return {} as DialectAdapter;
	}
	createIntrospector(): DatabaseIntrospector {
		return {} as DatabaseIntrospector;
	}
}

function fakeD1Database() {
	return {
		batch: () => Promise.resolve([]),
		exec: () => Promise.resolve({}),
		prepare: () => ({}),
	} as unknown as D1Database;
}

describe("createKyselyAdapter transaction detection", () => {
	it("reports native transaction support for a raw node:sqlite database", async () => {
		const sqlite = new DatabaseSync(":memory:");
		const { transaction, databaseType } = await createKyselyAdapter({
			database: sqlite,
		});
		expect(transaction).toBe(true);
		expect(databaseType).toBe("sqlite");
	});

	it("does not report native transaction support for a Cloudflare D1 database", async () => {
		const { transaction, databaseType } = await createKyselyAdapter({
			database: fakeD1Database(),
		});
		expect(transaction).toBe(false);
		expect(databaseType).toBe("sqlite");
	});

	it("leaves transaction support unspecified for a caller-supplied dialect of unknown capability", async () => {
		const { transaction, databaseType } = await createKyselyAdapter({
			database: new UnknownDialect(),
		});
		expect(transaction).toBeUndefined();
		expect(databaseType).toBeNull();
	});

	it("still honors an explicit transaction: false override on a { db } config", async () => {
		const fakeKysely = {} as unknown as KyselyInstance<any>;
		const { transaction } = await createKyselyAdapter({
			database: {
				db: fakeKysely,
				type: "sqlite",
				transaction: false,
			},
		});
		expect(transaction).toBe(false);
	});
});
