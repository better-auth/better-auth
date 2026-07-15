import type { BetterAuthPlugin } from "@better-auth/core";
import type { MemoryDB } from "@better-auth/memory-adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { describe, expect, it } from "vitest";
import { betterAuth } from "../../auth/full";

const accountMetadataPlugin = {
	id: "account-metadata",
	schema: {
		accountMetadata: {
			fields: {
				accountId: {
					type: "string",
					required: true,
					references: {
						model: "account",
						field: "id",
						onDelete: "cascade",
					},
				},
				label: { type: "string", required: true },
			},
		},
	},
} satisfies BetterAuthPlugin;

async function createAccountMetadataGraph() {
	const database: MemoryDB = {
		user: [],
		identity: [],
		account: [],
		session: [],
		verification: [],
		accountMetadata: [],
	};
	const auth = betterAuth({
		database: memoryAdapter(database),
		plugins: [accountMetadataPlugin],
	});
	const context = await auth.$context;
	const user = await context.internalAdapter.createUser(
		{
			name: "Account metadata owner",
			email: "account-metadata@example.com",
		},
		{ method: "admin" },
	);
	const link = async (
		subject: string,
		providerInstanceId: string,
		label: string,
	) =>
		context.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://account-metadata.example.com",
				providerAccountId: subject,
			},
			{
				providerId: "account-metadata-provider",
				providerInstanceId,
			},
			{
				buildRelatedRecords: ({ accountId }) => [
					{
						model: "accountMetadata",
						data: { accountId, label },
					},
				],
			},
		);

	return { context, link, user };
}

describe("account-owned plugin records", () => {
	it("keeps the account graph when no atomic deletion capability exists", async () => {
		const { context, link } = await createAccountMetadataGraph();
		const linked = await link(
			"unsupported-delete-subject",
			"unsupported-delete-provider",
			"kept",
		);
		const adapterConfig = context.adapter.options?.adapterConfig;
		if (!adapterConfig) {
			throw new Error("The memory adapter should expose its configuration");
		}
		adapterConfig.transaction = false;
		context.adapter.commitAtomicWrites = undefined;

		await expect(
			context.internalAdapter.deleteAccount(linked.account.id),
		).rejects.toMatchObject({ code: "ATOMIC_WRITES_UNSUPPORTED" });
		await expect(
			context.adapter.findOne({
				model: "accountMetadata",
				where: [{ field: "accountId", value: linked.account.id }],
			}),
		).resolves.toMatchObject({
			accountId: linked.account.id,
			label: "kept",
		});
		await expect(
			context.internalAdapter.findAccountWithIdentityById(linked.account.id),
		).resolves.toEqual(linked);
	});

	it("deletes every related record past the adapter's default page size", async () => {
		const { context, link, user } = await createAccountMetadataGraph();
		for (let index = 0; index < 101; index += 1) {
			await link(
				`user-subject-${index}`,
				`provider-instance-${index}`,
				`identity-${index}`,
			);
		}
		for (let index = 0; index < 100; index += 1) {
			await link(
				"user-subject-0",
				`additional-provider-instance-${index}`,
				`account-${index}`,
			);
		}
		await expect(
			context.adapter.count({ model: "accountMetadata" }),
		).resolves.toBe(201);

		await context.internalAdapter.deleteUserAccounts(user.id);

		await expect(
			context.adapter.findMany({ model: "accountMetadata" }),
		).resolves.toEqual([]);
		await expect(
			context.adapter.findMany({ model: "account" }),
		).resolves.toEqual([]);
		await expect(
			context.adapter.findMany({ model: "identity" }),
		).resolves.toEqual([]);
	});

	it("deletes only related records owned by a provider-instance sweep", async () => {
		const { context, link } = await createAccountMetadataGraph();
		await link("first-target-subject", "target-provider-instance", "first");
		await link("second-target-subject", "target-provider-instance", "second");
		const retained = await link(
			"retained-subject",
			"retained-provider-instance",
			"retained",
		);

		await context.internalAdapter.deleteAccountsByProviderInstanceId(
			"target-provider-instance",
		);

		await expect(
			context.adapter.findMany({ model: "accountMetadata" }),
		).resolves.toEqual([
			expect.objectContaining({
				accountId: retained.account.id,
				label: "retained",
			}),
		]);
		await expect(
			context.adapter.findMany({ model: "account" }),
		).resolves.toEqual([expect.objectContaining({ id: retained.account.id })]);
		await expect(
			context.adapter.findMany({ model: "identity" }),
		).resolves.toHaveLength(3);
	});
});
