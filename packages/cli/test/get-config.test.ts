import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { test } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, getDrizzleConfigSchema } from "../src/utils/get-config";

interface TmpDirFixture {
	tmpdir: string;
}

async function createTempDir() {
	const tmpdir = path.join(process.cwd(), "test", "getConfig_test-");
	return await fs.mkdtemp(tmpdir);
}

export const tmpdirTest = test.extend<TmpDirFixture>({
	tmpdir: async ({}, use) => {
		const directory = await createTempDir();

		await use(directory);

		await fs.rm(directory, { recursive: true });
	},
});

let tmpDir = ".";

describe("getConfig", async () => {
	beforeEach(async () => {
		const tmp = path.join(process.cwd(), "getConfig_test-");
		tmpDir = await fs.mkdtemp(tmp);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it("should resolve resolver type alias", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const dbPath = path.join(tmpDir, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
              "compilerOptions": {
                /* Path Aliases */
                "baseUrl": ".",
                "paths": {
                  "@server/*": ["./server/*"]
                }
              }
					}`,
		);

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "@server/db/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		//create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	it("should resolve direct alias", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const dbPath = path.join(tmpDir, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
              "compilerOptions": {
                /* Path Aliases */
                "baseUrl": ".",
                "paths": {
                  "prismaDbClient": ["./server/db/db"]
                }
              }
					}`,
		);

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "prismaDbClient";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		//create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	it("should resolve resolver type alias with relative path", async () => {
		const authPath = path.join(tmpDir, "test", "server", "auth");
		const dbPath = path.join(tmpDir, "test", "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
              "compilerOptions": {
                /* Path Aliases */
                "baseUrl": "./test",
                "paths": {
                  "@server/*": ["./server/*"]
                }
              }
					}`,
		);

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "@server/db/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		//create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "test/server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	it("should resolve direct alias with relative path", async () => {
		const authPath = path.join(tmpDir, "test", "server", "auth");
		const dbPath = path.join(tmpDir, "test", "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
              "compilerOptions": {
                /* Path Aliases */
                "baseUrl": "./test",
                "paths": {
                  "prismaDbClient": ["./server/db/db"]
                }
              }
					}`,
		);

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "prismaDbClient";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		//create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "test/server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	it("should resolve with relative import", async () => {
		const authPath = path.join(tmpDir, "test", "server", "auth");
		const dbPath = path.join(tmpDir, "test", "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
              "compilerOptions": {
                /* Path Aliases */
                "baseUrl": "./test",
                "paths": {
                  "prismaDbClient": ["./server/db/db"]
                }
              }
					}`,
		);

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "../db/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		//create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "test/server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	it("should error with invalid alias", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const dbPath = path.join(tmpDir, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
              "compilerOptions": {
                /* Path Aliases */
                "baseUrl": ".",
                "paths": {
                  "@server/*": ["./PathIsInvalid/*"]
                }
              }
					}`,
		);

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "@server/db/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		//create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		await expect(() =>
			getConfig({ cwd: tmpDir, configPath: "server/auth/auth.ts" }),
		).rejects.toThrowError();
	});

	it("should resolve js config", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const dbPath = path.join(tmpDir, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.js"),
			`import  { betterAuth } from "better-auth";

			 export const auth = betterAuth({
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);
		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.js",
		});
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
		});
	});
});

describe("getDrizzleConfigSchema", () => {
	let tmpDir: string;
	beforeEach(async () => {
		const tmp = path.join(process.cwd(), "getDrizzleConfigSchema_test-");
		tmpDir = await fs.mkdtemp(tmp);
		console.log("Created tmpDir", tmpDir);
	});
	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it("returns undefined if no drizzle config exists", async () => {
		const result = await getDrizzleConfigSchema(tmpDir);
		expect(result).toBeUndefined();
	});

	it("returns schema string from drizzle.config.ts", async () => {
		const configPath = path.join(tmpDir, "drizzle.config.ts");
		await fs.writeFile(
			configPath,
			`export default { schema: './src/auth-schema.ts' }`,
		);
		const result = await getDrizzleConfigSchema(tmpDir);
		expect(result).toBe("./src/auth-schema.ts");
	});

	it("returns schema string from drizzle.config.mjs", async () => {
		const configPath = path.join(tmpDir, "drizzle.config.mjs");
		await fs.writeFile(
			configPath,
			`export default { schema: './src/auth-schema.js' }`,
		);
		const result = await getDrizzleConfigSchema(tmpDir);
		expect(result).toBe("./src/auth-schema.js");
	});

	it("returns schema string from drizzle.config.js", async () => {
		const configPath = path.join(tmpDir, "drizzle.config.js");
		await fs.writeFile(
			configPath,
			`module.exports = { schema: './src/auth-schema.js' }`,
		);
		const result = await getDrizzleConfigSchema(tmpDir);
		expect(result).toBe("./src/auth-schema.js");
	});

	it("returns first schema if schema is an array", async () => {
		const configPath = path.join(tmpDir, "drizzle.config.ts");
		await fs.writeFile(
			configPath,
			`export default { schema: ['./src/one.ts', './src/two.ts'] }`,
		);
		const result = await getDrizzleConfigSchema(tmpDir);
		expect(Array.isArray(result) ? result[0] : result).toBe("./src/one.ts");
	});
});
