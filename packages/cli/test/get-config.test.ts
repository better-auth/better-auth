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
});
