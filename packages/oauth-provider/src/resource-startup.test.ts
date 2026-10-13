import type { DBAdapter } from "@better-auth/core/db/adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";

const resource = "https://api.example.com/mcp";

type ResourceFault = (
	operation: "findOne" | "create",
	adapter: DBAdapter,
) => Promise<void> | void;

/**
 * Boots an instance whose `oauthResource` operations pass through `fault`
 * first, so a test can simulate the storage states a real deployment hits.
 */
async function bootWithResourceFault(fault: { current: ResourceFault | null }) {
	const database: Record<string, unknown[]> = {
		account: [],
		jwks: [],
		oauthAccessToken: [],
		oauthClient: [],
		oauthClientAssertion: [],
		oauthClientResource: [],
		oauthConsent: [],
		oauthRefreshToken: [],
		oauthResource: [],
		session: [],
		user: [],
		verification: [],
	};
	const log = vi.fn();
	const createMemoryAdapter = memoryAdapter(database);
	const instance = await getTestInstance({
		logger: { level: "debug", log },
		database: (options) => {
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
		},
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				resources: [resource],
				clientRegistrationDefaultResources: [resource],
			}),
		],
	});
	const register = () =>
		instance.auth.api.registerOAuthClient({
			body: { redirect_uris: ["https://app.example.com/callback"] },
		}) as Promise<{ resources?: string[] }>;
	const errorLogs = () =>
		log.mock.calls.filter(([level]) => level === "error").map(([, m]) => m);
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
			expect.stringContaining("could not seed `resources` at startup"),
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11294
	 */
	it("defers quietly while the resource model is missing and seeds after it exists", async () => {
		const fault = {
			current: (() => {
				throw new Error(
					'[# Drizzle Adapter]: The model "oauthResource" was not found in the schema object. Please pass the schema directly to the adapter options.',
				);
			}) as ResourceFault | null,
		};
		const { register, database, errorLogs } =
			await bootWithResourceFault(fault);

		expect(errorLogs()).toEqual([]);
		await expect(register()).rejects.toThrow("was not found in the schema");

		fault.current = null;
		await expect(register()).resolves.toMatchObject({
			resources: [resource],
		});
		expect(database.oauthResource).toHaveLength(1);
	});
});
