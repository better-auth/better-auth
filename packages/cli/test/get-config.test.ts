import fs from "node:fs/promises";
import path from "node:path";
import { vol } from "memfs";
import { describe, expect, vi } from "vitest";
import { testWithTmpDir } from "./test-utils";

vi.mock("node:fs", () => ({
	...vol,
	default: vol,
}));
vi.mock("node:fs/promises", () => ({
	...vol.promises,
	default: vol.promises,
}));

import { getConfig } from "../src/utils/get-config";

describe("getConfig", async () => {
	testWithTmpDir("should resolve resolver type alias", async ({ tmp }) => {
		const authPath = path.join(tmp, "server", "auth");
		const dbPath = path.join(tmp, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmp, "tsconfig.json"),
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
			cwd: tmp,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	testWithTmpDir("should resolve direct alias", async ({ tmp }) => {
		const authPath = path.join(tmp, "server", "auth");
		const dbPath = path.join(tmp, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmp, "tsconfig.json"),
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
			cwd: tmp,
			configPath: "server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	testWithTmpDir(
		"should resolve resolver type alias with relative path",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "test", "server", "auth");
			const dbPath = path.join(tmp, "test", "server", "db");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(dbPath, { recursive: true });

			//create dummy tsconfig.json
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
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
				cwd: tmp,
				configPath: "test/server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
		},
	);

	testWithTmpDir(
		"should resolve direct alias with relative path",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "test", "server", "auth");
			const dbPath = path.join(tmp, "test", "server", "db");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(dbPath, { recursive: true });

			//create dummy tsconfig.json
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
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
				cwd: tmp,
				configPath: "test/server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
		},
	);

	testWithTmpDir("should resolve with relative import", async ({ tmp }) => {
		const authPath = path.join(tmp, "test", "server", "auth");
		const dbPath = path.join(tmp, "test", "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmp, "tsconfig.json"),
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
			cwd: tmp,
			configPath: "test/server/auth/auth.ts",
		});

		expect(config).not.toBe(null);
	});

	testWithTmpDir("should error with invalid alias", async ({ tmp }) => {
		const authPath = path.join(tmp, "server", "auth");
		const dbPath = path.join(tmp, "server", "db");
		await fs.mkdir(authPath, { recursive: true });
		await fs.mkdir(dbPath, { recursive: true });

		//create dummy tsconfig.json
		await fs.writeFile(
			path.join(tmp, "tsconfig.json"),
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
			getConfig({ cwd: tmp, configPath: "server/auth/auth.ts" }),
		).rejects.toThrowError();

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Couldn't read your auth config."),
			expect.objectContaining({
				code: "MODULE_NOT_FOUND",
			}),
		);
	});

	testWithTmpDir("should resolve js config", async ({ tmp }) => {
		const authPath = path.join(tmp, "server", "auth");
		const dbPath = path.join(tmp, "server", "db");
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
			cwd: tmp,
			configPath: "server/auth/auth.js",
		});
		expect(config).toMatchObject({
			emailAndPassword: { enabled: true },
		});
	});

	testWithTmpDir(
		"should resolve path aliases from referenced tsconfig files",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "apps", "web", "server", "auth");
			const dbPath = path.join(tmp, "packages", "shared", "db");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(dbPath, { recursive: true });

			// Create root tsconfig.json with references
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
				`{
				"references": [
					{ "path": "./apps/web" },
					{ "path": "./packages/shared" }
				]
			}`,
			);

			// Create web app tsconfig.json with aliases
			await fs.writeFile(
				path.join(tmp, "apps", "web", "tsconfig.json"),
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
				path.join(tmp, "packages", "shared", "tsconfig.json"),
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
				cwd: tmp,
				configPath: "apps/web/server/auth/auth.ts",
			});

			expect(config).toMatchObject({
				emailAndPassword: { enabled: true },
				database: expect.objectContaining({
					// This proves the @shared/db alias was resolved correctly
				}),
			});
		},
	);

	testWithTmpDir(
		"should handle missing referenced tsconfig files gracefully",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "server", "auth");
			await fs.mkdir(authPath, { recursive: true });

			// Create root tsconfig.json with reference to non-existent file
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
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
				cwd: tmp,
				configPath: "server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
		},
	);

	testWithTmpDir(
		"should handle circular references in tsconfig files",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "server", "auth");
			const appPath = path.join(tmp, "app");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(appPath, { recursive: true });

			// Create root tsconfig.json that references app tsconfig
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
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
				path.join(tmp, "app", "tsconfig.json"),
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
				cwd: tmp,
				configPath: "server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
		},
	);

	testWithTmpDir(
		"should resolve direct tsconfig file references",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "server", "auth");
			const sharedPath = path.join(tmp, "shared", "db");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(sharedPath, { recursive: true });

			// Create root tsconfig.json with direct file references
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
				`{
				"references": [
					{ "path": "./tsconfig.app.json" },
					{ "path": "./tsconfig.shared.json" }
				]
			}`,
			);

			// Create tsconfig.app.json with app-specific aliases
			await fs.writeFile(
				path.join(tmp, "tsconfig.app.json"),
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
				path.join(tmp, "tsconfig.shared.json"),
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
				cwd: tmp,
				configPath: "server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
		},
	);

	testWithTmpDir(
		"should handle mixed directory and file references",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "apps", "web", "server", "auth");
			const utilsPath = path.join(tmp, "packages", "utils");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(utilsPath, { recursive: true });

			// Create root tsconfig.json with mixed references
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
				`{
				"references": [
					{ "path": "./apps/web" },
					{ "path": "./tsconfig.utils.json" }
				]
			}`,
			);

			// Create web app directory-based tsconfig
			await fs.writeFile(
				path.join(tmp, "apps", "web", "tsconfig.json"),
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
				path.join(tmp, "tsconfig.utils.json"),
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
				cwd: tmp,
				configPath: "apps/web/server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
		},
	);
	testWithTmpDir(
		"should resolve SvelteKit $lib/server imports correctly",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "src");
			const libServerPath = path.join(tmp, "src", "lib", "server");
			await fs.mkdir(authPath, { recursive: true });
			await fs.mkdir(libServerPath, { recursive: true });

			await fs.writeFile(
				path.join(tmp, "package.json"),
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
				cwd: tmp,
				configPath: "src/auth.ts",
			});

			expect(config).not.toBe(null);
			expect(config).toMatchObject({
				emailAndPassword: { enabled: true },
			});
		},
	);

	testWithTmpDir("should resolve export default auth", async ({ tmp }) => {
		const authPath = path.join(tmp, "server", "auth");
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
			cwd: tmp,
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

	testWithTmpDir(
		"should resolve export default auth with named export",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "server", "auth");
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
				cwd: tmp,
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
		},
	);

	testWithTmpDir(
		"should resolve export default with inline betterAuth call",
		async ({ tmp }) => {
			const authPath = path.join(tmp, "server", "auth");
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
				cwd: tmp,
				configPath: "server/auth/auth.ts",
			});

			expect(config).not.toBe(null);
			expect(config).toMatchObject({
				emailAndPassword: { enabled: true },
				trustedOrigins: ["http://localhost:3000"],
			});
		},
	);
	testWithTmpDir(
		"should load configs importing cloudflare workers",
		async ({ tmp }) => {
			await fs.writeFile(
				path.join(tmp, "tsconfig.json"),
				`{
				"compilerOptions": {}
			}`,
			);

			await fs.writeFile(
				path.join(tmp, "auth.ts"),
				`import { betterAuth } from "better-auth";
			 import { env } from "cloudflare:workers";

			 export const auth = betterAuth({
					emailAndPassword: {
						enabled: !!env.FLAG,
					},
			 });`,
			);

			const config = await getConfig({
				cwd: tmp,
				configPath: "auth.ts",
			});

			expect(config).not.toBe(null);
			expect(config?.emailAndPassword?.enabled).toBe(true);
		},
	);
});
