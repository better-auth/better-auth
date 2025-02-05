import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { apiKey } from ".";
import { apiKeyClient } from "./client";

describe("apiKey plugin", async () => {
	const { client, signInWithTestUser, auth } = await getTestInstance(
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
		console.log(apiKey);
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
});
