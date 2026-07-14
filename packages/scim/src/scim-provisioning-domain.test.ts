import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMConnectionBinding, SCIMGroup, SCIMUser } from "./types";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

describe("SCIM provisioning domain immutability", () => {
	it("rejects configuration drift instead of moving persisted resources", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as SCIMGroup[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
			scimConnectionBinding: [] as SCIMConnectionBinding[],
		};
		const createAuth = (provisioningDomainId: string) =>
			betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter(data),
				plugins: [
					scim({
						connections: [
							{
								id: "workforce",
								provisioningDomainId,
								credentials: [{ type: "bearer", token: "test-scim-token" }],
							},
						],
					}),
				],
			});
		const headers = { authorization: "Bearer test-scim-token" };
		const original = createAuth("workspace-original");
		const user = await original.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});
		const group = await original.api.createSCIMGroup({
			body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
			headers,
		});
		const drifted = createAuth("workspace-drifted");

		await expect(
			drifted.api.getSCIMUser({
				params: { userId: user.id },
				headers,
			}),
		).rejects.toThrowError(expect.objectContaining({ statusCode: 409 }));
		await expect(
			drifted.api.getSCIMGroup({
				params: { groupId: group.id },
				headers,
			}),
		).rejects.toThrowError(expect.objectContaining({ statusCode: 409 }));
		expect(data.scimUser[0]?.provisioningDomainId).toBe("workspace-original");
		expect(data.scimGroup[0]?.provisioningDomainId).toBe("workspace-original");
	});

	it.each([
		["Group", "User"],
		["User", "Group"],
	] as const)("rejects domain drift after provisioning only a %s before creating a %s", async (originalResource, driftedResource) => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as SCIMConnectionBinding[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUser[],
			scimGroup: [] as SCIMGroup[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const createAuth = (provisioningDomainId: string) =>
			betterAuth({
				baseURL: "http://localhost:3000",
				database: memoryAdapter(data),
				plugins: [
					scim({
						connections: [
							{
								id: "workforce",
								provisioningDomainId,
								credentials: [{ type: "bearer", token: "test-scim-token" }],
							},
						],
					}),
				],
			});
		const headers = { authorization: "Bearer test-scim-token" };
		const original = createAuth("workspace-original");
		if (originalResource === "Group") {
			await original.api.createSCIMGroup({
				body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
				headers,
			});
		} else {
			await original.api.createSCIMUser({
				body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
				headers,
			});
		}

		const drifted = createAuth("workspace-drifted");
		const driftedCreation =
			driftedResource === "User"
				? drifted.api.createSCIMUser({
						body: {
							schemas: [USER_SCHEMA],
							userName: "grace@example.com",
						},
						headers,
					})
				: drifted.api.createSCIMGroup({
						body: {
							schemas: [GROUP_SCHEMA],
							displayName: "Finance",
						},
						headers,
					});

		await expect(driftedCreation).rejects.toThrowError(
			expect.objectContaining({ statusCode: 409 }),
		);
		expect(data.scimConnectionBinding).toEqual([
			expect.objectContaining({
				connectionId: "workforce",
				provisioningDomainId: "workspace-original",
			}),
		]);
		expect(data.scimUser).toHaveLength(originalResource === "User" ? 1 : 0);
		expect(data.scimGroup).toHaveLength(originalResource === "Group" ? 1 : 0);
	});
});
