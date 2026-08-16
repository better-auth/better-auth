import { existsSync } from "node:fs";
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

	it("should resolve path aliases from referenced tsconfig files", async () => {
		const authPath = path.join(tmpDir, "apps", "web", "server", "auth");
		const dbPath = path.join(tmpDir, "packages", "shared", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		// Create root tsconfig.json with references
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"references": [
					{ "path": "./apps/web" },
					{ "path": "./packages/shared" }
				]
			}`,
		);

		// Create web app tsconfig.json with aliases
		await fs.writeFile(
			path.join(tmpDir, "apps", "web", "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@web/*": ["./server/*"]
					}
				}
			}`,
		);

		// Create shared package tsconfig.json with aliases
		await fs.writeFile(
			path.join(tmpDir, "packages", "shared", "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@shared/*": ["./db/*"]
					}
				}
			}`,
		);

		// Create dummy auth.ts using both aliases
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "@shared/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		// Create dummy db.ts
		await fs.writeFile(
			path.join(dbPath, "db.ts"),
			`class PrismaClient {
				constructor() {}
			}
			
			export const db = new PrismaClient()`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "apps/web/server/auth/auth.ts",
		});

		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
			database: expect.objectContaining({
				// This proves the @shared/db alias was resolved correctly
			}),
		});
	});

	it("should handle missing referenced tsconfig files gracefully", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		await fs.mkdir(authPath, { recursive: true });

		// Create root tsconfig.json with reference to non-existent file
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@server/*": ["./server/*"]
					}
				},
				"references": [
					{ "path": "./non-existent" }
				]
			}`,
		);

		// Create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";

			 export const auth = betterAuth({
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
	});

	it("should handle circular references in tsconfig files", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const appPath = path.join(tmpDir, "app");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(appPath, { recursive: true });

		// Create root tsconfig.json that references app tsconfig
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@root/*": ["./server/*"]
					}
				},
				"references": [
					{ "path": "./app" }
				]
			}`,
		);

		// Create app tsconfig.json that references back to root
		await fs.writeFile(
			path.join(tmpDir, "app", "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@app/*": ["./src/*"]
					}
				},
				"references": [
					{ "path": ".." }
				]
			}`,
		);

		// Create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";

			 export const auth = betterAuth({
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
	});

	it("should resolve direct tsconfig file references", async () => {
		const authPath = path.join(tmpDir, "server", "auth");
		const sharedPath = path.join(tmpDir, "shared", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(sharedPath, { recursive: true });

		// Create root tsconfig.json with direct file references
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"references": [
					{ "path": "./tsconfig.app.json" },
					{ "path": "./tsconfig.shared.json" }
				]
			}`,
		);

		// Create tsconfig.app.json with app-specific aliases
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.app.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@app/*": ["./server/*"]
					}
				}
			}`,
		);

		// Create tsconfig.shared.json with shared aliases
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.shared.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@shared/*": ["./shared/*"]
					}
				}
			}`,
		);

		// Create dummy auth.ts using both aliases
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "@shared/db/db";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		// Create dummy db.ts
		await fs.writeFile(
			path.join(sharedPath, "db.ts"),
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

	it("should handle mixed directory and file references", async () => {
		const authPath = path.join(tmpDir, "apps", "web", "server", "auth");
		const utilsPath = path.join(tmpDir, "packages", "utils");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(utilsPath, { recursive: true });

		// Create root tsconfig.json with mixed references
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"references": [
					{ "path": "./apps/web" },
					{ "path": "./tsconfig.utils.json" }
				]
			}`,
		);

		// Create web app directory-based tsconfig
		await fs.writeFile(
			path.join(tmpDir, "apps", "web", "tsconfig.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@web/*": ["./server/*"]
					}
				}
			}`,
		);

		// Create utils file-based tsconfig
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.utils.json"),
			`{
				"compilerOptions": {
					"paths": {
						"@utils/*": ["./packages/utils/*"]
					}
				}
			}`,
		);

		// Create dummy auth.ts
		await fs.writeFile(
			path.join(authPath, "auth.ts"),
			`import {betterAuth} from "better-auth";

			 export const auth = betterAuth({
					emailAndPassword: {
						enabled: true,
					}
			 })`,
		);

		// Create dummy utils file
		await fs.writeFile(
			path.join(utilsPath, "index.ts"),
			`export const utils = {}`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "apps/web/server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});
	it("should resolve SvelteKit $lib/server imports correctly", async () => {
		const authPath = path.join(tmpDir, "src");
		const libServerPath = path.join(tmpDir, "src", "lib", "server");
		const svelteKitDir = path.join(tmpDir, ".svelte-kit");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(libServerPath, { recursive: true });
		await fs.mkdir(svelteKitDir, { recursive: true });

		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-sveltekit",
				devDependencies: {
					"@sveltejs/kit": "^2.0.0",
				},
			}),
		);

		// `$lib` resolves through the tsconfig `paths` that `svelte-kit sync`
		// generates, exactly as in a real project.
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
			path.join(tmpDir, "tsconfig.json"),
			`{ "extends": "./.svelte-kit/tsconfig.json" }`,
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

	it("should load configs importing cloudflare class and proxy exports", async () => {
		await fs.writeFile(
			path.join(tmpDir, "tsconfig.json"),
			`{
				"compilerOptions": {}
			}`,
		);

		await fs.writeFile(
			path.join(tmpDir, "auth.ts"),
			`import { betterAuth } from "better-auth";
			 import {
				 WorkerEntrypoint,
				 WorkflowEntrypoint,
				 env,
			 } from "cloudflare:workers";

			 class AuthService extends WorkerEntrypoint {}
			 class AuthWorkflow extends WorkflowEntrypoint {}

			 export const auth = betterAuth({
					appName:
						new AuthService({}, {}) instanceof WorkerEntrypoint &&
						new AuthWorkflow({}, {}) instanceof WorkflowEntrypoint
							? "ok"
							: "bad",
					emailAndPassword: {
						enabled: !!env.FLAG,
					},
			 });`,
		);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "auth.ts",
		});

		expect(config).toMatchObject({
			appName: "ok",
			emailAndPassword: { enabled: true },
		});
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

	/**
	 * The Convex integration guide's `auth.ts` template imports the schema
	 * file that `auth generate --output <path>` is responsible for creating
	 * (`import schema from "./schema"`). On a first run that file doesn't
	 * exist yet, so loading the config throws `Cannot find module './schema'`
	 * before generation ever gets a chance to run.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/10136
	 */
	it("should recover when the config imports its own not-yet-generated --output file", async () => {
		const authDir = path.join(tmpDir, "convex", "betterAuth");
		await fs.mkdir(authDir, { recursive: true });

		await fs.writeFile(
			path.join(authDir, "auth.ts"),
			`import schema from "./schema";

			 export const options = {
					appName: "ok",
					emailAndPassword: { enabled: true },
			 };

			 // referenced so the import isn't optimized away before evaluation
			 export const __schema = schema;`,
		);

		const outputPath = path.join(authDir, "schema.ts");
		expect(existsSync(outputPath)).toBe(false);

		const config = await getConfig({
			cwd: tmpDir,
			configPath: "convex/betterAuth/auth.ts",
			outputPath,
			shouldThrowOnError: true,
		});

		expect(config).toMatchObject({
			appName: "ok",
			emailAndPassword: { enabled: true },
		});

		// getConfig only needs to make the file resolvable; generateAction's
		// existing overwrite-confirmation flow takes over from here once the
		// real schema is generated.
		expect(existsSync(outputPath)).toBe(true);
		expect(await fs.readFile(outputPath, "utf-8")).toBe("");
	});

	it("should not silently stub an unrelated missing relative import", async () => {
		const authDir = path.join(tmpDir, "convex", "betterAuth");
		await fs.mkdir(authDir, { recursive: true });

		await fs.writeFile(
			path.join(authDir, "auth.ts"),
			`import unrelated from "./does-not-exist";

			 export const options = {
					appName: "ok",
					emailAndPassword: { enabled: true },
			 };

			 export const __unrelated = unrelated;`,
		);

		const outputPath = path.join(authDir, "schema.ts");

		await expect(
			getConfig({
				cwd: tmpDir,
				configPath: "convex/betterAuth/auth.ts",
				outputPath,
				shouldThrowOnError: true,
			}),
		).rejects.toThrow(/Cannot find module/);

		// Only the exact --output target may ever be auto-stubbed.
		expect(existsSync(outputPath)).toBe(false);
		expect(existsSync(path.join(authDir, "does-not-exist.ts"))).toBe(false);
	});

	it("should not stub a missing bare package import even if its specifier matches the output basename", async () => {
		const authDir = path.join(tmpDir, "convex", "betterAuth");
		await fs.mkdir(authDir, { recursive: true });

		await fs.writeFile(
			path.join(authDir, "auth.ts"),
			`import schema from "schema";

			 export const options = {
					appName: "ok",
					emailAndPassword: { enabled: true },
			 };

			 export const __schema = schema;`,
		);

		const outputPath = path.join(authDir, "schema.ts");

		await expect(
			getConfig({
				cwd: tmpDir,
				configPath: "convex/betterAuth/auth.ts",
				outputPath,
				shouldThrowOnError: true,
			}),
		).rejects.toThrow(/Cannot find (package|module)/);

		expect(existsSync(outputPath)).toBe(false);
	});

	/**
	 * `generate.ts` resolves `--output` via `path.resolve(cwd, options.output)`
	 * and passes the (possibly still-relative) result straight through as
	 * `outputPath`. `getConfig` must resolve a relative `outputPath` against
	 * that same `cwd` for its placeholder existence-check and write — not
	 * against `process.cwd()`, which can differ (e.g. `--cwd` points elsewhere
	 * than the directory the CLI process was launched from).
	 *
	 * @see https://github.com/better-auth/better-auth/pull/10302
	 */
	it("should resolve a relative outputPath against the getConfig cwd, not process.cwd()", async () => {
		const authDir = path.join(tmpDir, "convex", "betterAuth");
		await fs.mkdir(authDir, { recursive: true });

		await fs.writeFile(
			path.join(authDir, "auth.ts"),
			`import schema from "./schema";

			 export const options = {
					appName: "ok",
					emailAndPassword: { enabled: true },
			 };

			 // referenced so the import isn't optimized away before evaluation
			 export const __schema = schema;`,
		);

		const relativeOutputPath = path.join("convex", "betterAuth", "schema.ts");
		const expectedOutputPath = path.join(tmpDir, relativeOutputPath);

		// Simulates the process actually being launched from a directory other
		// than the `cwd` given to getConfig/generate — a real decoy directory
		// (not just a mocked `process.cwd()` getter) so a buggy implementation
		// that hands relative paths straight to `fs`/`path.resolve` is caught
		// exactly the way it would be in production.
		const realProcessCwd = process.cwd();
		const decoyCwd = await fs.mkdtemp(
			path.join(realProcessCwd, "getConfig_test-decoy-"),
		);
		const decoyOutputPath = path.join(decoyCwd, relativeOutputPath);

		process.chdir(decoyCwd);
		try {
			await expect(
				getConfig({
					cwd: tmpDir,
					configPath: "convex/betterAuth/auth.ts",
					outputPath: relativeOutputPath,
					shouldThrowOnError: true,
				}),
			).resolves.toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});

			// The placeholder — and therefore the resolvable schema import — must
			// land under the `cwd` getConfig/generate.ts actually use.
			expect(existsSync(expectedOutputPath)).toBe(true);
			// It must never land relative to process.cwd() instead.
			expect(existsSync(decoyOutputPath)).toBe(false);
		} finally {
			process.chdir(realProcessCwd);
			await fs.rm(decoyCwd, { recursive: true, force: true });
		}
	});

	/**
	 * If the retry after stubbing the placeholder fails for a genuinely
	 * unrelated reason (a different missing module), the empty placeholder
	 * `getConfig` created must not be left behind on disk.
	 *
	 * @see https://github.com/better-auth/better-auth/pull/10302
	 */
	it("should remove the placeholder file it created if the retry fails for an unrelated reason", async () => {
		const authDir = path.join(tmpDir, "convex", "betterAuth");
		await fs.mkdir(authDir, { recursive: true });

		await fs.writeFile(
			path.join(authDir, "auth.ts"),
			`import schema from "./schema";
			 import other from "./does-not-exist-either";

			 export const options = {
					appName: "ok",
					emailAndPassword: { enabled: true },
			 };

			 export const __schema = schema;
			 export const __other = other;`,
		);

		const outputPath = path.join(authDir, "schema.ts");
		expect(existsSync(outputPath)).toBe(false);

		await expect(
			getConfig({
				cwd: tmpDir,
				configPath: "convex/betterAuth/auth.ts",
				outputPath,
				shouldThrowOnError: true,
			}),
		).rejects.toThrow(/Cannot find module ['"]\.\/does-not-exist-either['"]/);

		// getConfig stubbed the placeholder to recover the "./schema" self
		// import, but the retry still failed for an unrelated missing module —
		// the placeholder it created must not be left behind.
		expect(existsSync(outputPath)).toBe(false);
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

describe("SvelteKit virtual modules and Vite asset imports (user-reported scenarios)", () => {
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

	const sveltekitPackageJson = JSON.stringify({
		name: "test-sveltekit",
		devDependencies: { "@sveltejs/kit": "^2.0.0" },
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	/**
	 * A config importing the truly-virtual `$app/environment` module (no file on
	 * disk; synthesized by the Vite plugin at runtime).
	 * @see https://github.com/better-auth/better-auth/issues/8933#issuecomment-4225087144
	 */
	tmpdirTest(
		"resolves $app/environment imports in a SvelteKit project",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { building, dev } from "$app/environment";
					import { getRequestEvent } from "$app/server";
					export const auth = betterAuth({
						appName: building || dev ? "build-or-dev" : "runtime",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "runtime",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * `$app/env` is SvelteKit's alias for `$app/environment` with the same
	 * `browser`/`building`/`dev`/`version` surface, so it must resolve identically.
	 * @see https://github.com/sveltejs/kit/pull/15934
	 */
	tmpdirTest(
		"resolves the $app/env alias surface",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { browser, building, dev, version } from "$app/env";
					export const auth = betterAuth({
						appName:
							browser === false &&
							building === false &&
							dev === false &&
							typeof version === "string"
								? "ok"
								: "bad",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * Locks the enumerated `$app/paths` and `$app/server` export surfaces against
	 * SvelteKit's real modules (e.g. `match`, added in 2.52, and `read`).
	 */
	tmpdirTest(
		"resolves the full $app/paths and $app/server export surface",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { resolve, asset, match } from "$app/paths";
					import { read, getRequestEvent } from "$app/server";
					export const auth = betterAuth({
						appName: [resolve, asset, match, read, getRequestEvent].every(
							(value) => typeof value === "function",
						)
							? "ok"
							: "bad",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * `$app/stores` exposes Svelte stores, including `updated.check()`, so a
	 * config touching them at load time must not crash.
	 */
	tmpdirTest(
		"resolves $app/stores with store-shaped exports",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { getStores, page, updated } from "$app/stores";
					export const auth = betterAuth({
						appName:
							typeof page.subscribe === "function" &&
							typeof updated.check === "function" &&
							typeof getStores === "function"
								? "ok"
								: "bad",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * A Vite `?inline` query import reached through a custom `kit.alias`. The
	 * alias resolves to a real file, but the `?inline` suffix means there is no
	 * literal file on disk for jiti to load.
	 * @see https://github.com/better-auth/better-auth/issues/8933#issuecomment-4225087144
	 */
	tmpdirTest(
		"resolves Vite ?inline query imports reached through a custom kit.alias",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"svelte.config.js": `export default { kit: { alias: { $src: "src" } } };`,
				"src/app.css": `body { color: red; }`,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import styles from "$src/app.css?inline";
					export const auth = betterAuth({
						appName: typeof styles,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "string",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * A Vite `?raw` query import of a relative asset.
	 * @see https://github.com/better-auth/better-auth/pull/9107#issuecomment-4226242067
	 */
	tmpdirTest(
		"resolves Vite ?raw query imports of a relative asset",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/email.html": `<p>hello</p>`,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import template from "./email.html?raw";
					export const auth = betterAuth({
						appName: typeof template,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "string",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * A plain asset import with no query (Vite treats known asset extensions as
	 * URL modules) and a side-effect-only stylesheet import.
	 * @see https://github.com/better-auth/better-auth/pull/9107#issuecomment-4226242067
	 */
	tmpdirTest(
		"resolves plain asset and side-effect stylesheet imports",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/logo.svg": `<svg></svg>`,
				"src/app.css": `body { color: red; }`,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import logoUrl from "../../logo.svg";
					import "../../app.css";
					export const auth = betterAuth({
						appName: typeof logoUrl,
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "string",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * `$env/dynamic/public` exposes only `PUBLIC_`-prefixed vars; `private`
	 * exposes the rest, mirroring SvelteKit. The stub reads `process.env` live.
	 * @see https://svelte.dev/docs/kit/$env-dynamic-public
	 */
	tmpdirTest(
		"filters $env/dynamic by public/private prefix",
		async ({ tmpdir, expect }) => {
			vi.stubEnv("PUBLIC_BA_ENV_TEST", "pub");
			vi.stubEnv("BA_ENV_TEST_SECRET", "secret");

			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { env as pub } from "$env/dynamic/public";
					import { env as priv } from "$env/dynamic/private";
					export const auth = betterAuth({
						appName:
							pub.PUBLIC_BA_ENV_TEST === "pub" &&
							pub.BA_ENV_TEST_SECRET === undefined &&
							priv.BA_ENV_TEST_SECRET === "secret" &&
							priv.PUBLIC_BA_ENV_TEST === undefined
								? "ok"
								: "bad",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * `$app/env/{private,public}` are the explicit-environment-variables form
	 * (opt-in via `experimental.explicitEnvironmentVariables`). Their exports are
	 * arbitrary names declared in `src/env.ts`, so the stub must resolve *any*
	 * imported name to its live `process.env` value rather than an enumerated set.
	 * @see https://svelte.dev/docs/kit/environment-variables#Explicit-environment-variables
	 */
	tmpdirTest(
		"resolves arbitrary $app/env/private and $app/env/public imports",
		async ({ tmpdir, expect }) => {
			vi.stubEnv("MY_SECRET_KEY", "secret");
			vi.stubEnv("MY_PUBLIC_KEY", "public");

			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import { MY_SECRET_KEY } from "$app/env/private";
					import { MY_PUBLIC_KEY } from "$app/env/public";
					export const auth = betterAuth({
						appName:
							MY_SECRET_KEY === "secret" && MY_PUBLIC_KEY === "public"
								? "ok"
								: "bad",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});
		},
	);

	/**
	 * Vite `?worker` resolves to a constructor and `.wasm?init` to an init
	 * function; both must load without a file on disk.
	 */
	tmpdirTest(
		"resolves Vite ?worker and .wasm?init imports",
		async ({ tmpdir, expect }) => {
			await writeTree(tmpdir, {
				"package.json": sveltekitPackageJson,
				"src/lib/server/worker.ts": `export {};`,
				"src/lib/server/auth.ts": `
					import { betterAuth } from "better-auth";
					import MyWorker from "./worker.ts?worker";
					import initWasm from "./module.wasm?init";
					export const auth = betterAuth({
						appName:
							typeof MyWorker === "function" && typeof initWasm === "function"
								? "ok"
								: "bad",
						emailAndPassword: { enabled: true },
					});
				`,
			});

			const config = await getConfig({
				cwd: tmpdir,
				configPath: "src/lib/server/auth.ts",
				shouldThrowOnError: true,
			});

			expect(config).toMatchObject({
				appName: "ok",
				emailAndPassword: { enabled: true },
			});
		},
	);
});
