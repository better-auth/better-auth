import type { AuthContext } from "@better-auth/core";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import { seedResourcesOnce } from "./resources";
import type { OAuthOptions, OAuthResource, Scope } from "./types";

const resource = "https://api.example.com/mcp";
const connectionError = new Error(
	"Connection terminated due to connection timeout",
);
type SeedOperation = "findOne" | "create" | "update";

async function boot(
	options: {
		operation?: SeedOperation;
		failure?: Error | null;
		mode?: OAuthOptions<Scope[]>["resourceSeedMode"];
		existing?: boolean;
	} = {},
) {
	const store = {
		user: [],
		session: [],
		account: [],
		verification: [],
		jwks: [],
		oauthClient: [],
		oauthClientResource: [],
		oauthResource: [] as Partial<OAuthResource>[],
	};
	if (options.existing) {
		store.oauthResource.push({
			id: "existing-resource",
			identifier: resource,
			name: "Database name",
			accessTokenTtl: 900,
			disabled: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	}
	const state = {
		failure: options.failure === undefined ? connectionError : options.failure,
		reads: 0,
	};
	const log = vi.fn();
	const providerOptions = {
		loginPage: "/login",
		consentPage: "/consent",
		resources: [{ identifier: resource, name: "Configured name" }],
		resourceSeedMode: options.mode,
		clientRegistrationDefaultResources: [resource],
		allowDynamicClientRegistration: true,
		allowUnauthenticatedClientRegistration: true,
	} satisfies OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		logger: { level: "warn", log },
		database: (authOptions) => {
			const adapter = memoryAdapter(store)(authOptions);
			const findOne = adapter.findOne.bind(adapter);
			const create = adapter.create.bind(adapter);
			const update = adapter.update.bind(adapter);
			adapter.findOne = async (input) => {
				if (input.model === "oauthResource") {
					state.reads++;
					if (state.failure && (options.operation ?? "findOne") === "findOne")
						throw state.failure;
				}
				return findOne(input);
			};
			adapter.create = async (input) => {
				if (
					input.model === "oauthResource" &&
					state.failure &&
					options.operation === "create"
				)
					throw state.failure;
				return create(input);
			};
			adapter.update = async (input) => {
				if (
					input.model === "oauthResource" &&
					state.failure &&
					options.operation === "update"
				)
					throw state.failure;
				return update(input);
			};
			return adapter;
		},
		plugins: [jwt(), oauthProvider(providerOptions)],
	});
	const register = () =>
		instance.auth.handler(
			new Request("http://localhost:3000/api/auth/oauth2/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					client_name: "Resource recovery test",
					redirect_uris: ["http://127.0.0.1:8788/callback"],
					token_endpoint_auth_method: "none",
					application_type: "native",
				}),
			}),
		);
	return { ...instance, store, state, log, providerOptions, register };
}

/** @see https://github.com/better-auth/better-auth/issues/10887 */
describe("resource seed failure during auth initialization", () => {
	it.each<SeedOperation>([
		"findOne",
		"create",
		"update",
	])("recovers after a failed %s without replacing auth", async (operation) => {
		const { auth, state, store, log, register, signInWithTestUser } =
			await boot({
				operation,
				existing: operation === "update",
				mode: "merge",
			});
		const { headers, user } = await signInWithTestUser();
		expect((await auth.api.getSession({ headers }))?.user.id).toBe(user.id);
		expect(log).toHaveBeenCalledWith(
			"warn",
			expect.stringContaining("deferring resource seed"),
			connectionError,
		);

		// An unsuccessful lazy attempt must keep failing closed and remain retryable.
		for (let attempt = 0; attempt < 2; attempt++) {
			expect((await register()).status).toBe(500);
			expect(store.oauthClient).toHaveLength(0);
			expect(store.oauthClientResource).toHaveLength(0);
		}
		state.failure = null;
		expect((await auth.api.getSession({ headers }))?.user.id).toBe(user.id);
		const registered = await register();
		expect(registered.status).toBe(201);
		expect(store.oauthResource).toHaveLength(1);
		expect(store.oauthClientResource).toHaveLength(1);

		store.oauthResource[0]!.disabled = true;
		const disabled = await register();
		expect(disabled.status).toBe(400);
		expect(await disabled.json()).toMatchObject({ error: "invalid_target" });
		expect(store.oauthClientResource).toHaveLength(1);
	});

	it("shares the retry among concurrent resource accesses", async () => {
		const { auth, state, store, providerOptions } = await boot();
		const context = (await auth.$context) as unknown as AuthContext;
		state.failure = null;
		const readsBeforeRetry = state.reads;
		await Promise.all(
			Array.from({ length: 10 }, () =>
				seedResourcesOnce(context, providerOptions),
			),
		);
		expect(state.reads - readsBeforeRetry).toBe(1);
		expect(store.oauthResource).toHaveLength(1);
	});

	it("reports permanent storage errors without authorizing a resource", async () => {
		const failure = new Error("permission denied for table oauth_resource");
		const { auth, register, log, store } = await boot({ failure });
		expect(log).toHaveBeenCalledWith(
			"warn",
			expect.stringContaining("deferring resource seed"),
			failure,
		);
		expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
		expect((await register()).status).toBe(500);
		expect(store.oauthClientResource).toHaveLength(0);
	});

	it.each([
		"insertOnly",
		"merge",
		"overwrite",
	] as const)("preserves healthy startup seeding with %s", async (mode) => {
		const { auth, store } = await boot({ failure: null, existing: true, mode });
		await auth.$context;
		expect(store.oauthResource).toHaveLength(1);
		expect(store.oauthResource[0]!.name).toBe(
			mode === "insertOnly" ? "Database name" : "Configured name",
		);
		expect(store.oauthResource[0]!.accessTokenTtl).toBe(
			mode === "overwrite" ? null : 900,
		);
	});
});
