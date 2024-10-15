import { expect, test } from "vitest";
import type { Adapter, User } from "../types";

interface AdapterTestOptions {
	adapter: Adapter;
}

export async function runAdapterTest(opts: AdapterTestOptions) {
	const { adapter } = opts;
	const user = {
		id: "1",
		name: "user",
		email: "user@email.com",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	test("create model", async () => {
		const res = await adapter.create({
			model: "user",
			data: user,
		});
		expect({
			name: res.name,
			email: res.email,
		}).toEqual({
			name: user.name,
			email: user.email,
		});
	});

	test("find model", async () => {
		const res = await adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		expect({
			name: res?.name,
			email: res?.email,
		}).toEqual({
			name: user.name,
			email: user.email,
		});
	});

	test("find model without id", async () => {
		const res = await adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "email",
					value: user.email,
				},
			],
		});
		expect({
			name: res?.name,
			email: res?.email,
		}).toEqual({
			name: user.name,
			email: user.email,
		});
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
		const res = await adapter.update<User>({
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
		expect(res?.email).toEqual(newEmail);
	});

	test("should find many", async () => {
		const res = await adapter.findMany({
			model: "user",
		});
		expect(res.length).toBe(1);
	});

	test("should find many with where", async () => {
		await adapter.create({
			model: "user",
			data: {
				id: "2",
				name: "user2",
				email: "test@email.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const res = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "id",
					value: "2",
				},
			],
		});
		expect(res.length).toBe(1);
	});

	test("should find many with sortBy", async () => {
		await adapter.create({
			model: "user",
			data: {
				name: "a",
				email: "a@email.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const res = await adapter.findMany<User>({
			model: "user",
			sortBy: {
				field: "name",
				direction: "asc",
			},
		});
		expect(res[0].name).toBe("a");

		const res2 = await adapter.findMany<User>({
			model: "user",
			sortBy: {
				field: "name",
				direction: "desc",
			},
		});

		expect(res2[res2.length - 1].name).toBe("a");
	});

	test("should find many with limit", async () => {
		const res = await adapter.findMany({
			model: "user",
			limit: 1,
		});
		expect(res.length).toBe(1);
	});

	test("should find many with offset", async () => {
		const res = await adapter.findMany({
			model: "user",
			offset: 2,
		});
		expect(res.length).toBe(1);
	});

	test("should update with multiple where", async () => {
		await adapter.update({
			model: "user",
			where: [
				{
					field: "name",
					value: user.name,
				},
				{
					field: "email",
					value: user.email,
				},
			],
			update: {
				email: "updated@email.com",
			},
		});
		const updatedUser = await adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "email",
					value: "updated@email.com",
				},
			],
		});
		expect(updatedUser).toMatchObject({
			name: user.name,
			email: "updated@email.com",
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

	test("shouldn't throw on record not found", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: "3",
				},
			],
		});
		expect(res).toBeNull();
	});
}
