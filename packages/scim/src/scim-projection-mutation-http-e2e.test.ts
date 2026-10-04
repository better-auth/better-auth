import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMProjectedUserState } from "./configuration";

const userSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
const patchSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const profile = {
	schemas: [userSchema],
	userName: "employee@example.com",
	displayName: "Employee",
	active: true,
	emails: [{ value: "employee@example.com", primary: true, type: "work" }],
};

async function fixture() {
	const states: SCIMProjectedUserState[] = [];
	const { auth } = await getTestInstance(
		{
			plugins: [
				scim({
					connections: [
						{
							id: "mutation-workforce",
							provisioningDomainId: "mutation-workspace",
							credentials: [
								{
									type: "bearer",
									id: "mutation-token",
									token: "mutation-token",
								},
							],
						},
					],
					projection: {
						async reconcileUser(state) {
							states.push(state);
						},
					},
				}),
			],
		},
		{ disableTestUser: true, transaction: true },
	);
	const request = (method: string, suffix = "", body?: unknown) =>
		auth.handler(
			new Request(`http://localhost:3000/api/auth/scim/v2/Users${suffix}`, {
				method,
				headers: {
					authorization: "Bearer mutation-token",
					"content-type": "application/scim+json",
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			}),
		);
	const create = async () => {
		const response = await request("POST", "", profile);
		expect(response.status).toBe(201);
		const user: { id: string } = await response.json();
		return user.id;
	};
	return { auth, states, request, create };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11567
 */
describe("SCIM User request context at the public HTTP boundary", () => {
	it("includes the creating User method", async () => {
		const f = await fixture();
		await f.create();
		expect(f.states.at(-1)).toMatchObject({
			mutation: { method: "POST" },
			active: true,
		});
	});

	it("preserves validated PATCH operations", async () => {
		const f = await fixture();
		const id = await f.create();
		const Operations = [{ op: "replace", path: "active", value: false }];
		const response = await f.request("PATCH", `/${id}`, {
			schemas: [patchSchema],
			Operations,
		});
		expect(response.status).toBe(200);
		expect(f.states.at(-1)).toMatchObject({
			mutation: { method: "PATCH", patchOperations: Operations },
			active: false,
		});
	});

	it("does not classify an active-only replacement as a profile change", async () => {
		const f = await fixture();
		const id = await f.create();
		const response = await f.request("PUT", `/${id}`, {
			...profile,
			active: false,
		});
		expect(response.status).toBe(200);
		expect(f.states.at(-1)).toMatchObject({
			mutation: { method: "PUT", profileChanged: false },
			active: false,
		});
	});

	it("detects a normalized writable profile change", async () => {
		const f = await fixture();
		const id = await f.create();
		const response = await f.request("PUT", `/${id}`, {
			...profile,
			displayName: "Updated Employee",
		});
		expect(response.status).toBe(200);
		expect(f.states.at(-1)).toMatchObject({
			mutation: { method: "PUT", profileChanged: true },
		});
	});

	it("includes deletion context when the source no longer exists", async () => {
		const f = await fixture();
		const id = await f.create();
		const response = await f.request("DELETE", `/${id}`);
		expect(response.status).toBe(204);
		expect(f.states.at(-1)).toMatchObject({
			mutation: { method: "DELETE" },
			active: false,
		});
	});

	it("does not retain User request context during projection replay", async () => {
		const f = await fixture();
		await f.create();
		f.states.length = 0;
		await f.auth.api.reconcileSCIMProjection({
			body: { provisioningDomainId: "mutation-workspace" },
		});
		expect(f.states).toHaveLength(1);
		expect(f.states[0]).not.toHaveProperty("mutation");
	});
});
