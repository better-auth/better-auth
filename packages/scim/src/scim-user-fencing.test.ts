import type { BetterAuthOptions, DBAdapter, User } from "better-auth";
import { betterAuth } from "better-auth";
import type { MemoryDB } from "better-auth/adapters/memory";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMConnectionBinding, SCIMUser } from "./persistence";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const headers = { authorization: "Bearer test-scim-token" };

interface UserFencingData extends MemoryDB {
	user: User[];
	scimConnectionBinding: SCIMConnectionBinding[];
	scimUser: SCIMUser[];
}

function createData(): UserFencingData {
	return {
		user: [],
		session: [],
		verification: [],
		account: [],
		scimConnectionBinding: [],
		scimIdentityTombstone: [],
		scimSubject: [],
		scimUser: [],
		scimGroup: [],
		scimGroupMember: [],
		scimProjectionGrant: [],
	};
}

function createDecommissionRaceAdapter(data: UserFencingData) {
	let decommissionBeforeNextTransaction = false;
	return {
		database: (options: BetterAuthOptions): DBAdapter => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				transaction: async (callback) => {
					if (decommissionBeforeNextTransaction) {
						decommissionBeforeNextTransaction = false;
						const binding = data.scimConnectionBinding.find(
							(candidate) => candidate.connectionId === "workforce",
						);
						if (!binding)
							throw new Error("Expected the SCIM connection binding");
						binding.decommissionStatus = "complete";
					}
					return adapter.transaction(callback);
				},
			};
		},
		decommissionBeforeNextTransaction() {
			decommissionBeforeNextTransaction = true;
		},
	};
}

describe("SCIM User connection fencing", () => {
	it("rejects a no-op PATCH when the connection retires before commit", async () => {
		const data = createData();
		const race = createDecommissionRaceAdapter(data);
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: race.database,
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
						},
					],
				}),
			],
		});
		const user = await auth.api.createSCIMUser({
			body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
			headers,
		});
		race.decommissionBeforeNextTransaction();

		await expect(
			auth.api.patchSCIMUser({
				params: { userId: user.id },
				body: {
					schemas: [PATCH_SCHEMA],
					Operations: [{ op: "replace", path: "active", value: true }],
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ status: "401" }),
		});
	});
});
