import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { getConfig } from "../src/utils/get-config";

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

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		await expect(() =>
			getConfig({ cwd: tmpDir, configPath: "server/auth/auth.ts" }),
		).rejects.toThrowError();

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Couldn't read your auth config."),
			expect.objectContaining({
				code: "MODULE_NOT_FOUND",
			}),
		);
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

	it("should resolve SvelteKit $lib/server imports correctly", async () => {
		const authPath = path.join(tmpDir, "src");
		const libServerPath = path.join(tmpDir, "src", "lib", "server");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(libServerPath, { recursive: true });

		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-sveltekit",
				devDependencies: {
					"@sveltejs/kit": "^2.0.0",
				},
			}),
		);

		await fs.writeFile(
			path.join(libServerPath, "database.ts"),
			`export const db = {
				// Mock database client
				connect: () => console.log('Connected to database')
			};`,
		);

		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import { betterAuth } from "better-auth";
			 import { db } from "$lib/server/database";

			 export const auth = betterAuth({
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "src/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
		});
	});

	it("should resolve export default auth", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		await fs.mkdir(authPath, { recursive: true });

		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import { betterAuth } from "better-auth";

			 const auth = betterAuth({
					emailAndPassword: {
						enabled: true,
					},
					socialProviders: {
						github: {
							clientId: "test-id",
							clientSecret: "test-secret"
						}
					}
			 });
			 
			 export default auth;`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
			socialProviders: {
				github: {
					clientId: "test-id",
					clientSecret: "test-secret",
				},
			},
		});
	});

	it("should resolve export default auth with named export", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		await fs.mkdir(authPath, { recursive: true });

		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import { betterAuth } from "better-auth";

			 const auth = betterAuth({
					emailAndPassword: {
						enabled: true,
					},
					socialProviders: {
						github: {
							clientId: "test-id",
							clientSecret: "test-secret"
						}
					}
			 });
			 
			 export { auth };

			 export default auth;`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
			socialProviders: {
				github: {
					clientId: "test-id",
					clientSecret: "test-secret",
				},
			},
		});
	});

	it("should resolve export default with inline betterAuth call", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		await fs.mkdir(authPath, { recursive: true });

		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import { betterAuth } from "better-auth";

			 export default betterAuth({
					emailAndPassword: {
						enabled: true,
					},
					trustedOrigins: ["http://localhost:3000"]
			 });`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
			trustedOrigins: ["http://localhost:3000"],
		});
	});
	it("should load configs importing cloudflare workers", async () => {
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"compilerOptions": {}
			}`,
		);

		await fs.writeFile(
			path.join(tmpDir, "auth.ts"),
			`import { betterAuth } from "better-auth";
			 import { env } from "cloudflare:workers";

			 export const auth = betterAuth({
					emailAndPassword: {
						enabled: !!env.FLAG,
					},
			 });`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config?.emailAndPassword?.enabled).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/6373
	 */
	it("should resolve path aliases from extended tsconfig", async () => {
		const authPath = path.join(tmpDir, "src", "auth");
		const dbPath = path.join(tmpDir, "src", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		// Create base tsconfig with path aliases
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.base.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@src/*": ["./src/*"]
					}
				}
			}`,
		);

		// Create tsconfig.json that extends base
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"extends": "./tsconfig.base.json"
			}`,
		);

		// Create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			export const db = new PrismaClient()`,
		);

		// Create auth.ts using the alias from extended config
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";
			 import {db} from "@src/db/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "src/auth/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/6373
	 */
	it("should resolve path aliases from chained extends", async () => {
		const authPath = path.join(tmpDir, "src", "auth");
		const dbPath = path.join(tmpDir, "src", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		// Create grandparent tsconfig with path aliases
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.root.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@server/*": ["./src/*"]
					}
				}
			}`,
		);

		// Create parent tsconfig that extends grandparent
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.base.json"),
			`{
				"extends": "./tsconfig.root.json"
			}`,
		);

		// Create tsconfig.json that extends parent
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"extends": "./tsconfig.base.json"
			}`,
		);

		// Create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			export const db = new PrismaClient()`,
		);

		// Create auth.ts using the alias from grandparent
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

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "src/auth/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8933
	 */
	it("should resolve extended tsconfig paths relative to the extended file's directory", async () => {
		// Simulates SvelteKit structure: root tsconfig.json extends
		// .svelte-kit/tsconfig.json whose paths use "../src/lib" (relative
		// to the .svelte-kit directory, not the project root).
		//
		// With the bug, `$lib` is resolved relative to the root tsconfig's
		// directory (projectRoot), producing `<parent>/src/lib`. To catch the
		// regression reliably, place a poisoned module at that wrong path
		// that throws on import — the test only passes if the CORRECT path
		// (`projectRoot/src/lib`) is used.
		const projectRoot = path.join(tmpDir, "app");
		const authPath = path.join(projectRoot, "src");
		const correctLibServer = path.join(projectRoot, "src", "lib", "server");
		const wrongLibServer = path.join(tmpDir, "src", "lib", "server");
		const svelteKitDir = path.join(projectRoot, ".svelte-kit");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(correctLibServer, { recursive: true });
		await fs.mkdir(wrongLibServer, { recursive: true });
		await fs.mkdir(svelteKitDir, { recursive: true });

		await fs.writeFile(
			path.join(svelteKitDir, "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"$lib": ["../src/lib"],
						"$lib/*": ["../src/lib/*"]
					}
				}
			}`,
		);

		await fs.writeFile(
			path.join(projectRoot, "tsconfig.json"),
			`{
				"extends": "./.svelte-kit/tsconfig.json"
			}`,
		);

		await fs.writeFile(
			path.join(correctLibServer, "database.ts"),
			`export const db = "correct-db";`,
		);

		// Poisoned module at the wrong location: throws on import.
		await fs.writeFile(
			path.join(wrongLibServer, "database.ts"),
			`throw new Error("wrong path resolved: $lib should not point here");`,
		);

		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import { betterAuth } from "better-auth";
			 import { db } from "$lib/server/database";

			 export const auth = betterAuth({
					emailAndPassword: {
						enabled: true,
					},
					appName: db,
			 })`,
		);

		const config = await getConfig({
			cwd: projectRoot,
			configPath: "src/auth.ts",
			shouldThrowOnError: true,
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
			appName: "correct-db",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/6373
	 */
	it("should let child paths override parent paths from extends", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const dbPath = path.join(tmpDir, "server", "db");
		const oldDbPath = path.join(tmpDir, "old", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });
		await fs.mkdir(oldDbPath, { recursive: true });

		// Create parent tsconfig with path aliases pointing to old location
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.base.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@server/*": ["./old/*"]
					}
				}
			}`,
		);

		// Create child tsconfig that overrides the alias
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"extends": "./tsconfig.base.json",
				"compilerOptions": {
					"paths": {
						"@server/*": ["./server/*"]
					}
				}
			}`,
		);

		// Create dummy db.ts in the correct (overridden) location
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			export const db = new PrismaClient()`,
		);

		// Create auth.ts
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

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
		});
	});
});

/**
 * Regression suite for user-reported `compilerOptions.paths` scenarios. Tests
 * use the `tmpdirTest` fixture for isolation and `shouldThrowOnError: true`
 * so resolution failures surface as real assertion failures. Poisoned modules
 * placed at wrong paths catch silently-incorrect rewrites.
 */
describe("tsconfig paths resolution (user-reported scenarios)", () => {
	async function writeTree(
		root: string,
		files: Record<string, string>,
	): Promise<void> {
		for (const [relPath, content] of Object.entries(files)) {
			const abs = path.join(root, relPath);
			await fs.mkdir(path.dirname(abs), { recursive: true });
			await fs.writeFile(abs, content);
		}
	}

	/**
	 * SvelteKit extending `.svelte-kit/tsconfig.json`, with both default and
	 * namespace imports against `$lib`.
	 * @see https://github.com/better-auth/better-auth/issues/8933
	 */
	tmpdirTest(
		"resolves $lib imports in an extends setup with default and namespace forms",
		async ({ tmpdir, expect }) => {
			const projectRoot = path.join(tmpdir, "my-app");
			await writeTree(tmpdir, {
				// Poisoned modules one level above the project root.
				"src/lib/server/db.ts": `throw new Error("wrong path: $lib resolved to tmpdir parent");`,
				"src/lib/server/db/schema.ts": `throw new Error("wrong path: $lib/server/db/schema resolved to tmpdir parent");`,

				"my-app/.svelte-kit/tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"$lib": ["../src/lib"],
							"$lib/*": ["../src/lib/*"]
						}
					}
				}`,
				"my-app/tsconfig.json": `{
					"extends": "./.svelte-kit/tsconfig.json"
				}`,
				"my-app/src/lib/server/db.ts": `export const db = "my-app-db";`,
				"my-app/src/lib/server/db/schema.ts": `export const usersTable = "my-app-users";`,
				"my-app/src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { db } from "$lib/server/db";
					import * as schema from "$lib/server/db/schema";
					const [version] = Object.values(schema);
					export const auth = betterAuth({
						appName: db + ":" + version,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: projectRoot,
				configPath: "src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "my-app-db:my-app-users",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * SvelteKit nested in a monorepo subdirectory with no tsconfig at the
	 * repo root.
	 * @see https://github.com/better-auth/better-auth/issues/8933#issuecomment-4189080622
	 */
	tmpdirTest(
		"resolves $lib imports when SvelteKit lives in a monorepo subdirectory",
		async ({ tmpdir, expect }) => {
			const websiteRoot = path.join(tmpdir, "mc-id", "website");
			await writeTree(tmpdir, {
				"mc-id/src/lib/server/email-service.ts": `throw new Error("wrong path: $lib resolved to monorepo root");`,

				"mc-id/website/.svelte-kit/tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"$lib": ["../src/lib"],
							"$lib/*": ["../src/lib/*"]
						}
					}
				}`,
				"mc-id/website/tsconfig.json": `{
					"extends": "./.svelte-kit/tsconfig.json"
				}`,
				"mc-id/website/src/lib/server/email-service.ts": `export const service = "website-email-service";`,
				"mc-id/website/src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { service } from "$lib/server/email-service";
					export const auth = betterAuth({
						appName: service,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: websiteRoot,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "website-email-service",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * Alias key with a trailing `*` mapped to a substitution template with a
	 * mid-path `*`, resolving across multiple sibling packages.
	 * @see https://github.com/better-auth/better-auth/pull/9020
	 */
	tmpdirTest(
		"resolves mid-path wildcard substitutions across multiple sibling packages",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"@web/*": ["./libs/web/*/src/index.ts"]
						}
					}
				}`,
				"libs/web/ui-kit/src/index.ts": `export const name = "ui-kit";`,
				"libs/web/data-sdk/src/index.ts": `export const name = "data-sdk";`,
				"libs/web/auth-sdk/src/index.ts": `export const name = "auth-sdk";`,
				// Sibling without src/index.ts — must not resolve to a candidate.
				"libs/web/legacy/README.md": `not a package`,
				"apps/web/src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { name as uiKit } from "@web/ui-kit";
					import { name as dataSdk } from "@web/data-sdk";
					import { name as authSdk } from "@web/auth-sdk";
					export const auth = betterAuth({
						appName: [uiKit, dataSdk, authSdk].join(","),
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "apps/web/src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ui-kit,data-sdk,auth-sdk",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * `*` must capture strings containing `/` (TypeScript canonical behavior).
	 * @see https://github.com/microsoft/TypeScript/blob/main/src/compiler/moduleNameResolver.ts
	 */
	tmpdirTest(
		"captures multi-segment star when the import specifier spans `/`",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"@scope/*": ["./packages/*/src/index.ts"]
						}
					}
				}`,
				"packages/feature/nested/src/index.ts": `export const name = "nested-feature";`,
				"src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { name } from "@scope/feature/nested";
					export const auth = betterAuth({
						appName: name,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "nested-feature",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * When multiple substitutions exist and all resolve, the first declared
	 * one wins. Both candidate files exist so ordering is the only signal.
	 */
	tmpdirTest(
		"picks the first substitution candidate in declaration order when multiple exist",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"@db": [
								"./primary/db.ts",
								"./secondary/db.ts"
							]
						}
					}
				}`,
				"primary/db.ts": `export const db = "primary";`,
				"secondary/db.ts": `export const db = "secondary";`,
				"src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { db } from "@db";
					export const auth = betterAuth({
						appName: db,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "primary",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/** Falls through to the next substitution when the first does not exist. */
	tmpdirTest(
		"falls through to the next substitution when the first does not exist on disk",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"@db": [
								"./missing/primary/db.ts",
								"./fallback/secondary/db.ts"
							]
						}
					}
				}`,
				"fallback/secondary/db.ts": `export const db = "secondary-fallback";`,
				"src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { db } from "@db";
					export const auth = betterAuth({
						appName: db,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "secondary-fallback",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * Covers static `import`, `export * from`, and dynamic `import()` across
	 * the same mid-path wildcard alias.
	 */
	tmpdirTest(
		"rewrites aliased specifiers across import, re-export, and dynamic import AST nodes",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"@pkg/*": ["./packages/*/src/index.ts"]
						}
					}
				}`,
				"packages/primary/src/index.ts": `export const primary = "primary-value";`,
				"packages/secondary/src/index.ts": `export const secondary = "secondary-value";`,
				"packages/barrel/src/index.ts": `export * from "@pkg/primary";`,
				"src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { primary } from "@pkg/barrel";
					const mod = await import("@pkg/secondary");
					export const auth = betterAuth({
						appName: primary + "/" + mod.secondary,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "primary-value/secondary-value",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/** Source files with modern ESM/CJS/TS extensions must all be resolvable. */
	tmpdirTest.for([
		{ ext: ".ts", body: `export const value = "ts";` },
		{ ext: ".tsx", body: `export const value = "tsx";` },
		{ ext: ".mts", body: `export const value = "mts";` },
		{ ext: ".cts", body: `export const value = "cts";` },
		{ ext: ".js", body: `export const value = "js";` },
		{ ext: ".jsx", body: `export const value = "jsx";` },
		{ ext: ".mjs", body: `export const value = "mjs";` },
		{ ext: ".cjs", body: `module.exports = { value: "cjs" };` },
	])(
		"resolves aliased files ending in $ext",
		async ({ ext, body }, { tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"tsconfig.json": `{
					"compilerOptions": {
						"paths": {
							"@lib": ["./src/lib"]
						}
					}
				}`,
				[`src/lib${ext}`]: body,
				"src/auth.ts": `
					import { betterAuth } from "better-auth";
					import { value } from "@lib";
					export const auth = betterAuth({
						appName: value,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: ext.slice(1),
				emailAndPassword: { enabled: true },
			});
		},
	);
});
