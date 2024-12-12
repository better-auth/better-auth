import { join } from "node:path";
import { rm } from "node:fs/promises";

import { afterAll, beforeAll, describe } from "vitest";
import { MikroORM } from "@mikro-orm/better-sqlite";

import { runAdapterTest } from "../../test";

import * as entities from "./entities";

import { mikroOrmAdapter } from "../mikro-orm-adapter";

const dbPath = join(__dirname, "test.sqlite");

const orm = MikroORM.initSync({
	dbName: dbPath,
	entities: Object.values(entities),
	ensureDatabase: true,
	allowGlobalContext: true,
});

beforeAll(async () => {
	await orm.connect();
	await orm.getSchemaGenerator().createSchema();
});

afterAll(async () => {
	await orm.close();
	await rm(dbPath);
});

describe("adapter test", async () => {
	const adapter = mikroOrmAdapter(orm);

	await runAdapterTest({
		getAdapter: async (opts = {}) => adapter(opts),
	});
});
