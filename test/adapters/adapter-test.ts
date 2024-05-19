import type { Adapter } from "../../src/adapters/types";
import { expect, test } from "vitest";

interface AdapterTestOptions {
	adapter: Adapter;
}

// biome-ignore lint/suspicious/noExportsInTest: <explanation>
export async function runAdapterTest(opts: AdapterTestOptions) {
	const { adapter } = opts;
	const user = {
		id: "1",
		email: "user@email.com",
		name: "user",
		emailVerified: true,
		password: "password",
	};

	const user2 = {
		email: "user2@email.com",
		name: "user2",
		emailVerified: true,
		password: "password",
	};

	test("create model", async () => {
		const res = await adapter.create({
			model: "user",
			data: user,
		});
		expect(res).toEqual(user);
	});

	test("find model", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		expect(res).toEqual(user);
	});
	// for and
	test("find mode with multiple field with AND", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
				{
					field: "email",
					value: user.email,
				},
			],
		});
		expect(res).toEqual(user);
	});

	test("find mode with multiple field with OR", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
					connector: "OR",
				},
				{
					field: "email",
					value: user.email,
				},
			],
		});
		expect(res).toEqual(user);
	});

	test("create model without id", async () => {
		const res = await adapter.create({
			model: "user",
			data: user2,
		});
		expect(res).toMatchObject(user2);
	});

	test("find model without id", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "email",
					value: user2.email,
				},
			],
		});
		expect(res).toMatchObject(user2);
	});

	test("find model with select", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
			select: ["email"],
		});
		expect(res).toEqual({ email: user.email });
	});

	test("update model", async () => {
		const newEmail = "updated@email.com";
		const res = await adapter.update({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
			update: {
				email: newEmail,
			},
		});
		expect(res).toEqual({
			...user,
			email: newEmail,
		});
	});

	test("delete model", async () => {
		await adapter.delete({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		const findRes = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		expect(findRes).toBeNull();
	});
}
