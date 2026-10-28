import type { DBAdapter } from "@better-auth/core/db/adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import { getResource } from "./resources";
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
	let resourceOperations = 0;
	const createAdapter = (
		options: Parameters<typeof createMemoryAdapter>[0],
	) => {
		const adapter = createMemoryAdapter(options);
		const intercept =
			<Operation extends keyof DBAdapter>(operation: Operation) =>
			async (args: unknown) => {
				const model = (args as { model?: string })?.model;
				if (model === "oauthResource") {
					resourceOperations++;
					if (operation === "findOne" || operation === "create") {
						await fault.current?.(operation, adapter);
					}
				}
				return (adapter[operation] as (a: unknown) => unknown)(args);
			};
		return {
			...adapter,
			findOne: intercept("findOne"),
			create: intercept("create"),
			findMany: intercept("findMany"),
			update: intercept("update"),
			delete: intercept("delete"),
			deleteMany: intercept("deleteMany"),
		} as typeof adapter;
	};
	const firstResource = resources[0];
	const opts = {
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
	};
	const instance = await getTestInstance({
		logger: { level: "debug", log },
		database: (options) => {
			if (!shared) return createAdapter(options);
			shared.adapter ??= createAdapter(options);
			return shared.adapter;
		},
		plugins: [jwt(), oauthProvider(opts)],
	});
	const register = () =>
		instance.auth.api.registerOAuthClient({
			body: { redirect_uris: ["https://app.example.com/callback"] },
		}) as Promise<{ resources?: string[] }>;
	const errorLogs = () => log.mock.calls.filter(([level]) => level === "error");
	return {
		...instance,
		opts,
		database,
		register,
		errorLogs,
		getResourceOperations: () => resourceOperations,
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
describe("zero init DB access & lazy resource row creation", () => {
	it("performs ZERO database queries on oauthResource during init", async () => {
		const fault = { current: null };
		const { database, getResourceOperations } = await bootWithResourceFault(
			fault,
			{
				resources: [
					resource,
					{
						identifier: "https://api.example.com/second",
						accessTokenTtl: 300,
					},
				],
			},
		);

		// ZERO database queries were made to oauthResource table during initialization
		expect(getResourceOperations()).toBe(0);
		// oauthResource table is completely empty on boot
		expect(database.oauthResource).toHaveLength(0);
	});

	it("lazily creates oauthResource row on client registration", async () => {
		const fault = { current: null };
		const { database, register } = await bootWithResourceFault(fault);

		expect(database.oauthResource).toHaveLength(0);
		const registered = await register();
		expect(registered).toMatchObject({
			resources: [resource],
		});
		// Database row was lazily created during client registration
		expect(database.oauthResource).toHaveLength(1);
		expect(database.oauthResource[0]?.identifier).toBe(resource);
		expect(database.oauthClientResource).toHaveLength(1);
	});

	it("keeps instance usable when storage fails and lazily creates once recovered", async () => {
		const fault = {
			current: (() => {
				throw new TypeError("fetch failed");
			}) as ResourceFault | null,
		};
		const { auth, signInWithTestUser, register, database, errorLogs } =
			await bootWithResourceFault(fault);

		// Init succeeded with zero errors despite storage fault because init touches no DB
		expect(errorLogs()).toEqual([]);
		const { headers } = await signInWithTestUser();
		await expect(auth.api.getSession({ headers })).resolves.toMatchObject({
			user: { email: "test@test.com" },
		});
		expect(database.oauthResource).toHaveLength(0);

		// Registration fails because storage is broken
		await expect(register()).rejects.toThrow("fetch failed");

		// Storage recovers; registration succeeds and creates row
		fault.current = null;
		await expect(register()).resolves.toMatchObject({
			resources: [resource],
		});
		expect(database.oauthResource).toHaveLength(1);
	});

	it("handles concurrent unique collision during lazy row creation", async () => {
		const fault = {
			current: (async (operation, adapter) => {
				if (operation !== "create") return;
				fault.current = null;
				// Another process created the row first
				await adapter.create({
					model: "oauthResource",
					data: {
						identifier: resource,
						name: resource,
						disabled: false,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
				throw new Error('Failed query: insert into "oauth_resource" ...', {
					cause: Object.assign(new Error("duplicate key value"), {
						code: "23505",
					}),
				});
			}) as ResourceFault | null,
		};
		const { register, database } = await bootWithResourceFault(fault);

		await expect(register()).resolves.toMatchObject({
			resources: [resource],
		});
		expect(database.oauthResource).toHaveLength(1);
	});

	it("applies insertOnly, merge, and overwrite modes on lookup", async () => {
		const id = "https://api.example.com/modes";
		const fault = { current: null };

		// 1. insertOnly: DB row exists, DB row values are preserved
		const instInsertOnly = await bootWithResourceFault(fault, {
			resources: [
				{ identifier: id, name: "Configured Name", accessTokenTtl: 300 },
			],
			resourceSeedMode: "insertOnly",
		});
		instInsertOnly.database.oauthResource.push({
			id: "row-1",
			identifier: id,
			name: "Admin DB Name",
			accessTokenTtl: 600,
			disabled: false,
			createdAt: new Date(1000),
			updatedAt: new Date(1000),
		});
		const resInsertOnly = await getResource(
			{ context: await instInsertOnly.auth.$context } as never,
			instInsertOnly.opts,
			id,
		);
		expect(resInsertOnly?.name).toBe("Admin DB Name");
		expect(resInsertOnly?.accessTokenTtl).toBe(600);

		// 2. merge: configured fields override DB row fields
		const instMerge = await bootWithResourceFault(fault, {
			resources: [{ identifier: id, accessTokenTtl: 120 }],
			resourceSeedMode: "merge",
		});
		instMerge.database.oauthResource.push({
			id: "row-2",
			identifier: id,
			name: "Admin DB Name",
			accessTokenTtl: 600,
			disabled: false,
			createdAt: new Date(1000),
			updatedAt: new Date(1000),
		});
		const resMerge = await getResource(
			{ context: await instMerge.auth.$context } as never,
			instMerge.opts,
			id,
		);
		expect(resMerge?.name).toBe("Admin DB Name"); // preserved
		expect(resMerge?.accessTokenTtl).toBe(120); // overridden

		// 3. overwrite: configured completely replaces DB row, preserving id & createdAt
		const instOverwrite = await bootWithResourceFault(fault, {
			resources: [{ identifier: id, accessTokenTtl: 120 }],
			resourceSeedMode: "overwrite",
		});
		instOverwrite.database.oauthResource.push({
			id: "row-3",
			identifier: id,
			name: "Admin DB Name",
			accessTokenTtl: 600,
			disabled: false,
			createdAt: new Date(1000),
			updatedAt: new Date(1000),
		});
		const resOverwrite = await getResource(
			{ context: await instOverwrite.auth.$context } as never,
			instOverwrite.opts,
			id,
		);
		expect(resOverwrite?.id).toBe("row-3"); // preserved
		expect(resOverwrite?.createdAt).toEqual(new Date(1000)); // preserved
		expect(resOverwrite?.name).toBe(id); // defaultName because input omitted name
		expect(resOverwrite?.accessTokenTtl).toBe(120);
	});
});
