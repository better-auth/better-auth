import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { apiKey } from ".";
import { apiKeyClient } from "./client";

describe("apiKey plugin", async () => {
	let user_id = "";
	const { client, signInWithTestUser, auth, db } = await getTestInstance(
		{
			plugins: [
				apiKey({
					verifyAction({ user }) {
						if (user.id === user_id) return true;
						return false;
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [apiKeyClient()],
			},
		},
	);

	const { headers: userHeaders, user } = await signInWithTestUser();
	user_id = user.id;

	it("should create an apiKey", async () => {
		const apiKey = await client.apiKey.create(
			{ reference: user.id },
			{ headers: userHeaders },
		);
		expect(apiKey.data).toBeDefined();
		expect(apiKey.data?.remaining).toEqual(null);
		expect(apiKey.data?.reference).toEqual(user.id);
		expect(apiKey.data?.name).toBeNull();
		expect(apiKey.data?.createdAt).toBeDefined();
		expect(apiKey.data?.updatedAt).toBeDefined();
	});

	it("Should require authorization to create an apiKey", async () => {
		const apiKey = await client.apiKey.create({
			reference: "test",
		});
		expect(apiKey.data).toBeNull();
		expect(apiKey.error).not.toBeNull();
	});

	it("Should create an apiKey with name", async () => {
		const apiKey = await client.apiKey.create(
			{
				reference: "test",
				name: "test",
			},
			{ headers: userHeaders },
		);
		expect(apiKey.data).toBeDefined();
		expect(apiKey.data?.name).toEqual("test");
	});

	it("Should create an apiKey with prefix", async () => {
		const apiKey = await client.apiKey.create(
			{
				reference: "test",
				prefix: "test",
			},
			{ headers: userHeaders },
		);
		expect(apiKey.data).toBeDefined();
		expect(apiKey.data?.key).toContain("test_");
	});

	it("Should create an apiKey with length", async () => {
		const apiKey = await client.apiKey.create(
			{
				reference: "test",
				length: 10,
			},
			{ headers: userHeaders },
		);
		expect(apiKey.data).toBeDefined();
		expect(apiKey.data?.key).toBeDefined();
		expect(apiKey.data?.key.length).toEqual(10);
	});

	it("Should verify an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.verify(
			{
				key: apiKey?.key as string,
			},
			{ headers: userHeaders },
		);
		expect(result.data).toBeDefined();
		expect(result.data?.valid).toEqual(true);
	});

	it("Shouldn't verify a disabled apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
				enabled: false,
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.verify(
			{
				key: apiKey?.key as string,
			},
			{ headers: userHeaders },
		);
		expect(result.data).toBeDefined();
		expect(result.data?.valid).toEqual(false);
	});

	it("Should get an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.get(
			{
				query: {
					keyId: apiKey?.id as string,
				},
			},
			{ headers: userHeaders },
		);
		expect(result.data).toBeDefined();
		expect(result.data).toEqual(apiKey);
	});

	it("Should require authorization to get an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.get({
			query: {
				keyId: apiKey?.id as string,
			},
		});
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
	});

	it("Should update an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.update(
			{
				keyId: apiKey?.id as string,
				name: "test",
			},
			{ headers: userHeaders },
		);
		expect(result.data).toBeDefined();
		expect(result.data?.name).toEqual("test");
	});

	it("Should require authorization to update an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.update({
			keyId: apiKey?.id as string,
			name: "test",
		});
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
	});

	it("Should revoke an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);
		expect(apiKey).not.toBeNull();

		if (apiKey) {
			const r = await client.apiKey.revoke(
				{
					keyId: apiKey.id as string,
				},
				{ headers: userHeaders },
			);
			//@ts-ignore
			expect(r.data.success).toEqual(true);

			const result = await db.findOne({
				model: "apiKey",
				where: [
					{
						field: "id",
						operator: "eq",
						value: apiKey?.id as string,
					},
				],
			});

			expect(result).toBeNull();
		}
	});

	it("Should require authorization to revoke an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.revoke({
			keyId: apiKey?.id as string,
		});
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		//@ts-ignore
		expect(result.error.success).toEqual(false);
	});

	it("Should list apiKeys", async () => {
		const result = await client.apiKey.list(
			{
				query: {
					reference: "test",
				},
			},
			{ headers: userHeaders },
		);
		//@ts-ignore
		expect(result.data.length).toEqual(10);
		expect(result.error).toBeNull();
		if (result.data) {
			for await (const { apiKey } of result.data) {
				if (!apiKey) continue;
				await client.apiKey.revoke(
					{
						keyId: apiKey.id as string,
					},
					{ headers: userHeaders },
				);
			}
			const result2 = await client.apiKey.list(
				{
					query: {
						reference: "test",
					},
				},
				{ headers: userHeaders },
			);
			//@ts-ignore
			expect(result2.data.length).toEqual(0);
			expect(result2.error).toBeNull();
		}
	});
	it("Should reroll an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.reroll(
			{
				keyId: apiKey?.id as string,
			},
			{ headers: userHeaders },
		);

		expect(result.data).toBeDefined();
		expect(result.data?.key).toBeDefined();
		expect(result.data?.key.length).toEqual(64);
		//@ts-ignore
		expect(result.data.key).not.toEqual(apiKey?.key);
	});

	it("Should require authorization to reroll an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.reroll({
			keyId: apiKey?.id as string,
		});
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
	});

	it("Should add new prefix to rerolled apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.reroll(
			{
				keyId: apiKey?.id as string,
				prefix: "hello_world",
			},
			{ headers: userHeaders },
		);

		expect(result.data).toBeDefined();
		expect(result.data?.key).toBeDefined();
		expect(result.data?.key.length).toEqual(64 + "hello_world_".length);
		//@ts-ignore
		expect(result.data.key).not.toEqual(apiKey?.key);
		expect(result.data?.key).toContain("hello_world_");
	});

	it("Should apply new length to rerolled apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.reroll(
			{
				keyId: apiKey?.id as string,
				length: 10,
			},
			{ headers: userHeaders },
		);

		expect(result.data).toBeDefined();
		expect(result.data?.key).toBeDefined();
		expect(result.data?.key.length).toEqual(10);
		//@ts-ignore
		expect(result.data.key).not.toEqual(apiKey?.key);
	});

	it(`Should delete all expired apiKeys`, async () => {
		const list = await client.apiKey.list(
			{
				query: {
					reference: "test",
				},
			},
			{ headers: userHeaders },
		);

		//@ts-ignore
		for await (const { apiKey } of list.data) {
			if (!apiKey) continue;

			await client.apiKey.revoke(
				{
					keyId: apiKey.id as string,
				},
				{ headers: userHeaders },
			);
		}

		await client.apiKey.create(
			{
				reference: "test",
				name: "Soon to expire! but not yet!",
				expires: new Date().getTime() + 2000,
			},
			{ headers: userHeaders },
		);

		await client.apiKey.create(
			{
				reference: "test",
				name: "Should had expired!",
				expires: new Date().getTime() - 2000,
			},
			{ headers: userHeaders },
		);
		await client.apiKey.create(
			{
				reference: "test",
				name: "Should had expired as well!",
				expires: new Date().getTime() - 1,
			},
			{ headers: userHeaders },
		);

		const result = await auth.api.deleteAllExpiredApiKeys();

		const { data: allKeys2 } = await client.apiKey.list(
			{
				query: {
					reference: "test",
				},
			},
			{ headers: userHeaders },
		);

		//@ts-ignore
		expect(result.success).toEqual(true);
		//@ts-ignore
		expect(allKeys2.length).toEqual(1);
		//@ts-ignore
		expect(allKeys2[0].apiKey.name).toEqual("Soon to expire! but not yet!");
	});

	it(`Should only use the apiKey the remaining 3 times`, async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
				remaining: 3,
			},
			{ headers: userHeaders },
		);
		const result = await client.apiKey.verify(
			{
				key: apiKey?.key as string,
			},
			{ headers: userHeaders },
		);
		expect(result.data).toBeDefined();
		expect(result.data?.valid).toEqual(true);

		const result2 = await client.apiKey.verify(
			{
				key: apiKey?.key as string,
			},
			{ headers: userHeaders },
		);
		expect(result2.data).toBeDefined();
		expect(result2.data?.valid).toEqual(true);

		const result3 = await client.apiKey.verify(
			{
				key: apiKey?.key as string,
			},
			{ headers: userHeaders },
		);
		expect(result3.data).toBeDefined();
		expect(result3.data?.valid).toEqual(true);

		const result4 = await client.apiKey.verify(
			{
				key: apiKey?.key as string,
			},
			{ headers: userHeaders },
		);
		expect(result4.data).toBeDefined();
		expect(result4.data?.valid).toEqual(false);
	});

	it(`Should forcefully reroll an apiKey`, async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		await auth.api.forceRerollApiKey({
			body: {
				keyId: apiKey?.id as string,
			},
		});

		const result = await client.apiKey.get(
			{
				query: {
					keyId: apiKey?.id as string,
				},
			},
			{ headers: userHeaders },
		);

		expect(result.data).toBeDefined();
		expect(result.data?.key).toBeDefined();
		//@ts-ignore
		expect(result.data.key).not.toEqual(apiKey?.key);
	});

	it(`Should forcefully revoke an apiKey`, async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		await auth.api.forceRevokeApiKey({
			body: {
				keyId: apiKey?.id as string,
			},
		});

		const result = await client.apiKey.get(
			{
				query: {
					keyId: apiKey?.id as string,
				},
			},
			{ headers: userHeaders },
		);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
	});

	it(`Should forcefully update an apiKey`, async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				reference: "test",
			},
			{ headers: userHeaders },
		);

		await auth.api.forceUpdateApiKey({
			body: {
				keyId: apiKey?.id as string,
				name: "test",
			},
		});

		const result = await client.apiKey.get(
			{
				query: {
					keyId: apiKey?.id as string,
				},
			},
			{ headers: userHeaders },
		);

		expect(result.data).toBeDefined();
		expect(result.data?.name).toEqual("test");
	});

	// it(`Should hit the rate-limit`, async () => {
	// 	const { client, signInWithTestUser, auth, db } = await getTestInstance(
	// 		{
	// 			plugins: [
	// 				organization(),
	// 				apiKey({
	// 					async verifyAction({ user, headers, action, apiKey, session }) {
	// 						if (apiKey.reference.startsWith("org-keys:")) {
	// 							// reference for org keys would be: `org-keys:<org-slug>:<org-id>:<user-id>`
	// 							const [, orgSlug, orgId, userId] = apiKey.reference.split(":");

	// 							const org = await auth.api.getFullOrganization({
	// 								query: { organizationId: orgId, organizationSlug: orgSlug },
	// 								headers,
	// 							});
	// 							if (!org) return false;
	// 							const hasUser = org.members.find((x) => x.userId === userId);
	// 							if (!hasUser) return false;
	// 							return true;
	// 						} else {
	// 							return apiKey.reference === user.id;
	// 						}
	// 					},
	// 				}),
	// 			],
	// 		},
	// 		{
	// 			clientOptions: {
	// 				plugins: [apiKeyClient()],
	// 			},
	// 		},
	// 	);
	// });
});
