import type { BetterAuthPlugin } from "@better-auth/core";
import {
	ATTR_CONTEXT,
	ATTR_DB_COLLECTION_NAME,
	ATTR_DB_OPERATION_NAME,
	ATTR_HOOK_TYPE,
} from "@better-auth/core/instrumentation";
import { trace } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { getTestInstance } from "./test-utils/index.js";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

const createTestInstance = async () => {
	const hooks = {
		create: {
			before: async (data: any) => ({ data }),
			after: async () => {},
		},
		update: {
			before: async (data: any) => ({ data }),
			after: async () => {},
		},
		delete: {
			before: async () => true,
			after: async () => {},
		},
	};

	return getTestInstance({
		databaseHooks: {
			user: hooks,
			session: hooks,
		},
	});
};

async function waitForSpan(
	predicate: (s: ReadableSpan) => boolean,
): Promise<ReadableSpan> {
	return vi.waitUntil(() => exporter.getFinishedSpans().find(predicate), {
		timeout: 10_000,
		interval: 5,
	});
}

const testUser = {
	email: "user@test.com",
	password: "test123456",
	name: "Test user",
};

describe("database instrumentation", () => {
	beforeAll(() => {
		exporter = new InMemorySpanExporter();
		provider = new NodeTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(exporter)],
		});
		trace.setGlobalTracerProvider(provider);
	});

	afterAll(async () => {
		await provider.shutdown();
	});

	beforeEach(() => {
		exporter.reset();
	});

	it("emits db create span", async () => {
		const instance = await createTestInstance();
		await instance.client.signUp.email(testUser);

		const span = await waitForSpan((s) => s.name === "db create user");
		expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe("create");
		expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBe("user");

		const beforeHookSpan = await waitForSpan(
			(s) => s.name === "db create.before user",
		);
		expect(beforeHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "create.before",
			[ATTR_DB_COLLECTION_NAME]: "user",
			[ATTR_CONTEXT]: "user",
		});

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "db create.after user",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "create.after",
			[ATTR_DB_COLLECTION_NAME]: "user",
			[ATTR_CONTEXT]: "user",
		});
	});

	it("emits db findOne span", async () => {
		const instance = await createTestInstance();
		await instance.client.signUp.email(testUser);

		await instance.runWithUser(
			testUser.email,
			testUser.password,
			async () => void (await instance.client.getSession()),
		);

		const span = await waitForSpan((s) => s.name === "db findOne session");
		expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe("findOne");
		expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBe("session");
	});

	it("emits db findMany span", async () => {
		const instance = await createTestInstance();
		await instance.client.signUp.email(testUser);

		await instance.runWithUser(
			testUser.email,
			testUser.password,
			async () => void (await instance.client.listSessions()),
		);

		const span = await waitForSpan((s) => s.name === "db findMany session");
		expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe("findMany");
		expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBe("session");
	});

	it("emits db update span", async () => {
		const instance = await createTestInstance();
		await instance.client.signUp.email(testUser);

		await instance.runWithUser(
			testUser.email,
			testUser.password,
			async () =>
				void (await instance.client.updateUser({ name: "Updated Name" })),
		);

		const span = await waitForSpan((s) => s.name === "db update user");
		expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe("update");
		expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBe("user");

		const beforeHookSpan = await waitForSpan(
			(s) => s.name === "db update.before user",
		);
		expect(beforeHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "update.before",
			[ATTR_DB_COLLECTION_NAME]: "user",
		});

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "db update.after user",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "update.after",
			[ATTR_DB_COLLECTION_NAME]: "user",
		});
	});

	it("emits db delete span", async () => {
		const instance = await createTestInstance();
		await instance.client.signUp.email(testUser);

		let sessionToken: string | undefined;
		await instance.runWithUser(testUser.email, testUser.password, async () => {
			const res = await instance.client.getSession();
			sessionToken = res?.data?.session?.token;
		});

		await instance.runWithUser(
			testUser.email,
			testUser.password,
			async () =>
				void (await instance.client.revokeSession({ token: sessionToken! })),
		);

		const span = await waitForSpan((s) => s.name === "db delete session");
		expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe("delete");
		expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBe("session");

		const beforeHookSpan = await waitForSpan(
			(s) => s.name === "db delete.before session",
		);
		expect(beforeHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "delete.before",
			[ATTR_DB_COLLECTION_NAME]: "session",
		});

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "db delete.after session",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "delete.after",
			[ATTR_DB_COLLECTION_NAME]: "session",
		});
	});

	it("emits db deleteMany span", async () => {
		const instance = await createTestInstance();
		await instance.client.signUp.email(testUser);

		await instance.runWithUser(
			testUser.email,
			testUser.password,
			async () => void (await instance.client.revokeSessions()),
		);

		const span = await waitForSpan((s) => s.name === "db deleteMany session");
		expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe("deleteMany");
		expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBe("session");

		const beforeHookSpan = await waitForSpan(
			(s) => s.name === "db delete.before session",
		);
		expect(beforeHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "delete.before",
			[ATTR_DB_COLLECTION_NAME]: "session",
		});

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "db delete.after session",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "delete.after",
			[ATTR_DB_COLLECTION_NAME]: "session",
		});
	});

	it("emits plugin id on db hook spans when hooks come from plugin", async () => {
		const PLUGIN_ID = "db-hooks-plugin";
		const pluginWithDbHooks: BetterAuthPlugin = {
			id: PLUGIN_ID,
			init: () => ({
				options: {
					databaseHooks: {
						user: {
							create: {
								before: async (data: any) => ({ data }),
								after: async () => {},
							},
						},
					},
				},
			}),
		};

		const instance = await getTestInstance({
			plugins: [pluginWithDbHooks],
		});
		await instance.client.signUp.email(testUser);

		const beforeHookSpan = await waitForSpan(
			(s) => s.name === "db create.before user",
		);
		expect(beforeHookSpan.attributes).toMatchObject({
			[ATTR_CONTEXT]: `plugin:${PLUGIN_ID}`,
		});

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "db create.after user",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_CONTEXT]: `plugin:${PLUGIN_ID}`,
		});
	});
});
