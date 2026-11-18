import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [{ configPath: "./wrangler.json" }],
});

beforeAll(async () => {
	await server.listen();
});

beforeEach(async () => {
	const response = await server.fetch("http://localhost:8787/_test/migrate", {
		method: "POST",
	});
	expect(response.status).toBe(204);
});

afterEach(async ({ task }) => {
	if (task.result?.state === "fail") server.debug();
	await server.reset();
});

afterAll(async () => {
	await server.close();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10860
 */
describe("SCIM on D1", () => {
	it.each([
		{ method: "GET", path: "ServiceProviderConfig" },
		{ method: "GET", path: "Users" },
		{ method: "POST", path: "Users" },
	])("returns 501 for $method /scim/v2/$path", async ({ method, path }) => {
		const response = await server.fetch(
			`http://localhost:8787/api/auth/scim/v2/${path}`,
			{
				method,
				headers: {
					authorization: "Bearer scim-token",
					"content-type": "application/scim+json",
				},
				body:
					method === "POST"
						? JSON.stringify({
								schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
								userName: "ada@example.com",
							})
						: undefined,
			},
		);
		expect(response.status).toBe(501);
		expect(response.headers.get("content-type")).toBe("application/scim+json");
		expect(await response.json()).toMatchObject({
			schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
			status: "501",
		});
	});
});
