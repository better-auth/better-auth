import { expect, test } from "vitest";
import type { Adapter, BetterAuthOptions, User } from "../types";
import { generateId } from "../utils";

interface AdapterTestOptions {
	getAdapter: (
		customOptions?: Omit<BetterAuthOptions, "database">,
	) => Promise<Adapter>;
	skipGenerateIdTest?: boolean;
}

export async function runAdapterTest(opts: AdapterTestOptions) {
	const adapter = await opts.getAdapter();
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
		user.id = res.id;
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
		expect(res).toMatchObject({
			email: newEmail,
			name: user.name,
		});
	});

	test("should find many", async () => {
		const res = await adapter.findMany({
			model: "user",
		});
		expect(res.length).toBe(1);
	});

	test("should find many with where", async () => {
		const user = await adapter.create<User>({
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
					value: user.id,
				},
			],
		});
		expect(res.length).toBe(1);
	});

	test("should find many with operators", async () => {
		const newUser = await adapter.create<User>({
			model: "user",
			data: {
				id: "3",
				name: "user",
				email: "test-email2@email.com",
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
					operator: "in",
					value: [user.id, newUser.id],
				},
			],
		});
		expect(res.length).toBe(2);
	});

	test("should work with reference fields", async () => {
		let token = null;
		const user = await adapter.create<{ id: string } & Record<string, any>>({
			model: "user",
			data: {
				id: "4",
				name: "user",
				email: "my-email@email.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const session = await adapter.create({
			model: "session",
			data: {
				id: "1",
				token: generateId(),
				createdAt: new Date(),
				updatedAt: new Date(),
				userId: user.id,
				expiresAt: new Date(),
			},
		});
		token = session.token;
		const res = await adapter.findOne({
			model: "session",
			where: [
				{
					field: "userId",
					value: user.id,
				},
			],
		});
		const resToken = await adapter.findOne({
			model: "session",
			where: [
				{
					field: "token",
					value: token,
				},
			],
		});
		expect(res).toMatchObject({
			userId: user.id,
		});
		expect(resToken).toMatchObject({
			userId: user.id,
		});
	});

	test("should find many with sortBy", async () => {
		await adapter.create({
			model: "user",
			data: {
				id: "5",
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
		expect(res.length).toBe(3);
	});

	test("should update with multiple where", async () => {
		await adapter.updateMany({
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

	test("should delete many", async () => {
		for (const id of ["to-be-delete1", "to-be-delete2", "to-be-delete3"]) {
			await adapter.create({
				model: "user",
				data: {
					id,
					name: "to-be-deleted",
					email: `email@test-${id}.com`,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		}
		const findResFirst = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					value: "to-be-deleted",
				},
			],
		});
		expect(findResFirst.length).toBe(3);
		await adapter.deleteMany({
			model: "user",
			where: [
				{
					field: "name",
					value: "to-be-deleted",
				},
			],
		});
		const findRes = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					value: "to-be-deleted",
				},
			],
		});
		expect(findRes.length).toBe(0);
	});

	test("shouldn't throw on delete record not found", async () => {
		await adapter.delete({
			model: "user",
			where: [
				{
					field: "id",
					value: "5",
				},
			],
		});
	});

	test("shouldn't throw on record not found", async () => {
		const res = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: "5",
				},
			],
		});
		expect(res).toBeNull();
	});

	test("should find many with contains operator", async () => {
		const res = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					operator: "contains",
					value: "user2",
				},
			],
		});
		expect(res.length).toBe(1);
	});

	test("should search users with startsWith", async () => {
		const res = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					operator: "starts_with",
					value: "us",
				},
			],
		});
		expect(res.length).toBe(3);
	});

	test("should search users with endsWith", async () => {
		const res = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					operator: "ends_with",
					value: "er2",
				},
			],
		});
		expect(res.length).toBe(1);
	});

	test.skipIf(opts.skipGenerateIdTest)(
		"should prefer generateId if provided",
		async () => {
			const customAdapter = await opts.getAdapter({
				advanced: {
					generateId: () => "mocked-id",
				},
			});

			const res = await customAdapter.create({
				model: "user",
				data: {
					id: "1",
					name: "user4",
					email: "user4@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			expect(res.id).toBe("mocked-id");
		},
	);
}
