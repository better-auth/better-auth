import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { apiKey } from ".";
import { apiKeyClient } from "./client";

describe("apiKey plugin", async () => {
	const { client, signInWithTestUser, auth, db } = await getTestInstance(
		{
			plugins: [apiKey({})],
		},
		{
			clientOptions: {
				plugins: [apiKeyClient()],
			},
		},
	);

	const { headers: userHeaders, user } = await signInWithTestUser();

	it("should create an apiKey", async () => {
		const apiKey = await client.apiKey.create(
			{
				identifier: "test",
			},
			{ headers: userHeaders },
		);
		expect(apiKey.data).toBeDefined();
		expect(apiKey.data?.remaining).toEqual(0);
		expect(apiKey.data?.identifier).toEqual("test");
		expect(apiKey.data?.name).toBeNull();
		expect(apiKey.data?.createdAt).toBeDefined();
		expect(apiKey.data?.updatedAt).toBeDefined();
	});

	it("Should require authorization to create an apiKey", async () => {
		const apiKey = await client.apiKey.create({
			identifier: "test",
		});
		expect(apiKey.data).toBeNull();
		expect(apiKey.error).not.toBeNull();
	});

	it("Should create an apiKey with name", async () => {
		const apiKey = await client.apiKey.create(
			{
				identifier: "test",
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
				identifier: "test",
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
				identifier: "test",
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
				identifier: "test",
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
	it("Should require authorization to verify an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				identifier: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.verify({
			key: apiKey?.key as string,
		});
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
	});

	it("Should get an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				identifier: "test",
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

	it("Should update an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				identifier: "test",
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
				identifier: "test",
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

	it("Should delete an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				identifier: "test",
			},
			{ headers: userHeaders },
		);
		expect(apiKey).not.toBeNull();

		if (apiKey) {
			const r = await client.apiKey.delete(
				{
					keyId: apiKey.id as string,
				},
				{ headers: userHeaders },
			);
			//@ts-ignore
			expect(r.data.success).toEqual(true);

			const result = await db.findOne({
				model: "apiKeys",
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

	it("Should require authorization to delete an apiKey", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				identifier: "test",
			},
			{ headers: userHeaders },
		);

		const result = await client.apiKey.delete({
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
					identifier: "test",
				},
			},
			{ headers: userHeaders },
		);
		//@ts-ignore
		expect(result.data.length).toEqual(10);
		expect(result.error).toBeNull();
		if (result.data) {
			for await (const apiKey of result.data) {
				await client.apiKey.delete(
					{
						keyId: apiKey.id as string,
					},
					{ headers: userHeaders },
				);
			}
			const result2 = await client.apiKey.list(
				{
					query: {
						identifier: "test",
					},
				},
				{ headers: userHeaders },
			);
			//@ts-ignore
			expect(result2.data.length).toEqual(0);
			expect(result2.error).toBeNull();
		}
	});
});
