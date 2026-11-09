import type { DBAdapter } from "@better-auth/core/db/adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, OAuthResourceInput, Scope } from "./types";

const resource = "https://api.example.com/mcp";

type ResourceFault = (
	operation: "findOne" | "create",
	adapter: DBAdapter,
) => Promise<void> | void;

type Row = Record<string, unknown>;

const createDatabase = () => ({
	account: [] as Row[],
	jwks: [] as Row[],
	oauthAccessToken: [] as Row[],
	oauthClient: [] as Row[],
	oauthClientAssertion: [] as Row[],
	oauthClientResource: [] as Row[],
	oauthConsent: [] as Row[],
	oauthRefreshToken: [] as Row[],
	oauthResource: [] as Row[],
	session: [] as Row[],
	user: [] as Row[],
	verification: [] as Row[],
});

/**
 * Boots an instance whose `oauthResource` operations pass through `fault`
 * first, so a test can simulate the storage states a real deployment hits.
 * Pass `shared` to give several instances the same adapter object.
 */
async function bootWithResourceFault(
	fault: { current: ResourceFault | null },
	{
		resources = [resource],
		resourceSeedMode,
		shared,
	}: {
		resources?: Array<string | OAuthResourceInput>;
		resourceSeedMode?: OAuthOptions<Scope[]>["resourceSeedMode"];
		shared?: {
			database: ReturnType<typeof createDatabase>;
			adapter?: DBAdapter;
		};
	} = {},
) {
	const database = shared?.database ?? createDatabase();
	const log = vi.fn();
	const createMemoryAdapter = memoryAdapter(database);
	const createAdapter = (
		options: Parameters<typeof createMemoryAdapter>[0],
	) => {
		const adapter = createMemoryAdapter(options);
		const intercept =
			<Operation extends "findOne" | "create">(operation: Operation) =>
			async (args: Parameters<DBAdapter[Operation]>[0]) => {
				if (args.model === "oauthResource") {
					await fault.current?.(operation, adapter);
				}
				return (adapter[operation] as (a: typeof args) => unknown)(args);
			};
		return {
			...adapter,
			findOne: intercept("findOne"),
			create: intercept("create"),
		} as typeof adapter;
	};
	const firstResource = resources[0];
	const instance = await getTestInstance({
		logger: { level: "debug", log },
		database: (options) => {
			if (!shared) return createAdapter(options);
			shared.adapter ??= createAdapter(options);
			return shared.adapter;
		},
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				resources,
				resourceSeedMode,
				clientRegistrationDefaultResources: [
					typeof firstResource === "string"
						? firstResource
						: firstResource!.identifier,
				],
			}),
		],
	});
	const register = () =>
		instance.auth.api.registerOAuthClient({
			body: { redirect_uris: ["https://app.example.com/callback"] },
		}) as Promise<{ resources?: string[] }>;
	const errorLogs = () => log.mock.calls.filter(([level]) => level === "error");
	return { ...instance, database, register, errorLogs };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11538
 */
describe("resource seeding at startup", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10887
	 */
	it("keeps the instance usable when storage fails during startup and seeds once it recovers", async () => {
		const fault = {
			current: (() => {
				throw new TypeError("fetch failed");
			}) as ResourceFault | null,
		};
		const { auth, signInWithTestUser, register, database, errorLogs } =
			await bootWithResourceFault(fault);

		const { headers } = await signInWithTestUser();
		await expect(auth.api.getSession({ headers })).resolves.toMatchObject({
			user: { email: "test@test.com" },
		});
		expect(errorLogs()).toEqual([
			[
				"error",
				expect.stringContaining("could not seed `resources` at startup"),
				expect.objectContaining({ message: "fetch failed" }),
			],
		]);
		await expect(register()).rejects.toThrow("fetch failed");

		fault.current = null;
		await expect(register()).resolves.toMatchObject({
			resources: [resource],
		});
		expect(database.oauthResource).toHaveLength(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11034
	 */
	it("treats a row inserted by a concurrent instance as already seeded", async () => {
		const fault = {
			current: (async (operation, adapter) => {
				if (operation !== "create") return;
				fault.current = null;
				// Another instance wins the insert; the driver error is wrapped the
				// way Drizzle wraps it, with the SQLSTATE only on `cause`.
				await adapter.create({
					model: "oauthResource",
					data: { identifier: resource, name: resource, disabled: false },
				});
				throw new Error('Failed query: insert into "oauth_resource" ...', {
					cause: Object.assign(new Error("duplicate key value"), {
						code: "23505",
					}),
				});
			}) as ResourceFault | null,
		};
		const { register, database, errorLogs } =
			await bootWithResourceFault(fault);

		expect(errorLogs()).toEqual([]);
		expect(database.oauthResource).toHaveLength(1);
		await expect(register()).resolves.toMatchObject({
			resources: [resource],
		});
	});

	it("applies merge mode to a row a concurrent instance inserted", async () => {
		const fault = {
			current: (async (operation, adapter) => {
				if (operation !== "create") return;
				fault.current = null;
				await adapter.create({
					model: "oauthResource",
					data: { identifier: resource, name: resource, disabled: false },
				});
				throw new Error("duplicate key value");
			}) as ResourceFault | null,
		};
		const { database } = await bootWithResourceFault(fault, {
			resources: [{ identifier: resource, accessTokenTtl: 300 }],
			resourceSeedMode: "merge",
		});

		expect(database.oauthResource).toEqual([
			expect.objectContaining({ identifier: resource, accessTokenTtl: 300 }),
		]);
	});

	it("reports the insert error when the row cannot be re-read", async () => {
		let creates = 0;
		const fault = {
			current: ((operation) => {
				if (operation === "create") {
					creates++;
					throw new Error("value too long for column");
				}
				if (creates > 0) throw new Error("connection lost");
			}) as ResourceFault | null,
		};
		const { errorLogs } = await bootWithResourceFault(fault);

		expect(errorLogs()).toEqual([
			[
				"error",
				expect.any(String),
				expect.objectContaining({ message: "value too long for column" }),
			],
		]);
	});

	it("seeds each instance's resources when instances share an adapter", async () => {
		const shared = { database: createDatabase() };
		const fault = { current: null };
		await bootWithResourceFault(fault, {
			resources: ["https://api.example.com/first"],
			shared,
		});
		// The test harness signs up the same user on every boot.
		for (const model of ["user", "account", "session"] as const) {
			shared.database[model].length = 0;
		}
		await bootWithResourceFault(fault, {
			resources: ["https://api.example.com/second"],
			shared,
		});

		expect(
			shared.database.oauthResource.map((row) => row.identifier).sort(),
		).toEqual([
			"https://api.example.com/first",
			"https://api.example.com/second",
		]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11294
	 */
	it.each([
		[
			"Drizzle missing model",
			new Error(
				'[# Drizzle Adapter]: The model "oauthResource" was not found in the schema object. Please pass the schema directly to the adapter options.',
			),
		],
		[
			"Drizzle-wrapped missing relation",
			new Error('Failed query: select "id" from "oauth_resource" ...', {
				cause: new Error('relation "oauth_resource" does not exist'),
			}),
		],
		[
			"Prisma missing model",
			new Error(
				"Model oauthResource does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'",
			),
		],
	])(
		"defers quietly on a %s error and seeds once the table exists",
		async (_, error) => {
			const fault = {
				current: (() => {
					throw error;
				}) as ResourceFault | null,
			};
			const { register, database, errorLogs } =
				await bootWithResourceFault(fault);

			expect(errorLogs()).toEqual([]);
			await expect(register()).rejects.toThrow(error.message);

			fault.current = null;
			await expect(register()).resolves.toMatchObject({
				resources: [resource],
			});
			expect(database.oauthResource).toHaveLength(1);
		},
	);
});
