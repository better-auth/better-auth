import type {
	BetterAuthOptions,
	DBAdapter,
	DBTransactionAdapter,
	User,
} from "better-auth";
import { betterAuth } from "better-auth";
import type { MemoryDB } from "better-auth/adapters/memory";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMGroup, SCIMUser } from "./persistence";
import { createScopedKey } from "./resource-key";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const headers = { authorization: "Bearer test-scim-token" };

interface ResourceCreateData extends MemoryDB {
	user: User[];
	scimUser: SCIMUser[];
	scimGroup: SCIMGroup[];
}

type CreateInput = Parameters<DBTransactionAdapter["create"]>[0];

function createData(): ResourceCreateData {
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

function createAuth(database: BetterAuthOptions["database"]) {
	return betterAuth({
		baseURL: "http://localhost:3000",
		database,
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
}

function createConcurrentCommitAdapter(
	data: ResourceCreateData,
	injectConcurrentCommit: (model: string) => void,
) {
	let injected = false;
	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		return {
			...adapter,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) =>
				adapter.transaction(async (transaction) => {
					const create = async (input: CreateInput): Promise<unknown> => {
						if (
							!injected &&
							(input.model === "scimGroup" || input.model === "scimUser")
						) {
							injected = true;
							injectConcurrentCommit(input.model);
							throw new Error(`Simulated ${input.model} unique constraint`);
						}
						return transaction.create(input);
					};

					return callback({
						...transaction,
						create: create as DBTransactionAdapter["create"],
					});
				}),
		};
	};
}

describe("SCIM resource create uniqueness races", () => {
	it("normalizes a concurrent Group displayName commit to SCIM uniqueness", async () => {
		const data = createData();
		const now = new Date();
		const auth = createAuth(
			createConcurrentCommitAdapter(data, (model) => {
				if (model !== "scimGroup") return;
				data.scimGroup.push({
					id: "concurrent-group",
					connectionId: "workforce",
					provisioningDomainId: "workforce",
					revision: 0,
					displayName: "Engineering",
					displayNameKey: createScopedKey([
						"scim-group-display-name",
						"workforce",
						"engineering",
					]),
					orderKey: "concurrent-group-order",
					createdAt: now,
					updatedAt: now,
				});
			}),
		);

		await expect(
			auth.api.createSCIMGroup({
				body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("normalizes a concurrent User userName commit to SCIM uniqueness", async () => {
		const data = createData();
		const now = new Date();
		const auth = createAuth(
			createConcurrentCommitAdapter(data, (model) => {
				if (model !== "scimUser") return;
				data.user.push({
					id: "concurrent-user",
					name: "Concurrent User",
					email: "ada@example.com",
					emailVerified: false,
					image: null,
					createdAt: now,
					updatedAt: now,
				});
				data.scimUser.push({
					id: "concurrent-scim-user",
					connectionId: "workforce",
					provisioningDomainId: "workforce",
					userId: "concurrent-user",
					connectionUserKey: createScopedKey([
						"scim-user",
						"workforce",
						"concurrent-user",
					]),
					userName: "ada@example.com",
					userNameKey: createScopedKey([
						"scim-user-name",
						"workforce",
						"ada@example.com",
					]),
					primaryEmail: "ada@example.com",
					workEmailValueIndex: "|ada@example.com|",
					emailValueIndex: "|ada@example.com|",
					displayName: "Concurrent User",
					formattedName: "Concurrent User",
					serializedEmails: "[]",
					active: true,
					orderKey: "concurrent-user-order",
					createdAt: now,
					updatedAt: now,
				});
			}),
		);

		await expect(
			auth.api.createSCIMUser({
				body: { schemas: [USER_SCHEMA], userName: "ada@example.com" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				status: "409",
				scimType: "uniqueness",
			}),
		});
	});

	it("preserves a create failure when no committed uniqueness conflict exists", async () => {
		const data = createData();
		const auth = createAuth(createConcurrentCommitAdapter(data, () => {}));

		await expect(
			auth.api.createSCIMGroup({
				body: { schemas: [GROUP_SCHEMA], displayName: "Engineering" },
				headers,
			}),
		).rejects.toThrowError("Simulated scimGroup unique constraint");
	});
});
