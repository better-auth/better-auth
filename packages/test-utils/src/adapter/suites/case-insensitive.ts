import type { User } from "@better-auth/core/db";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { expect } from "vitest";

/**
 * Test suite for case-insensitive string operations across adapters.
 * Tests eq, ne, in, not_in, contains, starts_with, ends_with with mode: "insensitive".
 */
export const caseInsensitiveTestSuite = createTestSuite(
	"case-insensitive",
	{},
	(helpers) => {
		const { adapter, insertRandom, generate } = helpers;

		return {
			"findOne - eq with mode insensitive should match regardless of case":
				async () => {
					const user = await adapter.create<User>({
						model: "user",
						data: {
							...(await generate("user")),
							email: "TestUser@Example.COM",
							name: "CaseTest",
						},
						forceAllowId: true,
					});

					const result = await adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: "email",
								value: "testuser@example.com",
								operator: "eq",
								mode: "insensitive",
							},
						],
					});

					expect(result).not.toBeNull();
					expect(result?.id).toBe(user.id);
					expect(result?.email).toBe("TestUser@Example.COM");
				},
			"findOne - eq with mode sensitive (default) should not match different case":
				async () => {
					await adapter.create<User>({
						model: "user",
						data: {
							...(await generate("user")),
							email: "ExactCase@Test.com",
							name: "ExactCase",
						},
						forceAllowId: true,
					});

					const result = await adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: "email",
								value: "exactcase@test.com",
								operator: "eq",
								mode: "sensitive",
							},
						],
					});

					expect(result).toBeNull();
				},
			"findMany - eq with mode insensitive": async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "FindMany@EQ.Test",
						name: "FindManyEQ",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "findmany@eq.test",
							operator: "eq",
							mode: "insensitive",
						},
					],
				});

				expect(result).toHaveLength(1);
				expect(result[0]?.id).toBe(user.id);
			},
			"findMany - ne with mode insensitive": async () => {
				const users = (await insertRandom("user", 3)).map((x) => x[0]);
				const targetEmail = "ExcludeMe@NE.Test";
				const excludeUser = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: targetEmail,
						name: "ExcludeMe",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "excludeme@ne.test",
							operator: "ne",
							mode: "insensitive",
						},
					],
				});

				const resultIds = result.map((u) => u.id);
				expect(resultIds).not.toContain(excludeUser.id);
				expect(resultIds).toContain(users[0]!.id);
			},
			"findMany - in with mode insensitive": async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "InArray@Test.COM",
						name: "InArray",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: ["other@test.com", "inarray@test.com", "third@test.com"],
							operator: "in",
							mode: "insensitive",
						},
					],
				});

				expect(result).toHaveLength(1);
				expect(result[0]?.id).toBe(user.id);
			},
			"findMany - not_in with mode insensitive": async () => {
				const users = (await insertRandom("user", 2)).map((x) => x[0]);
				const excludeUser = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "NotIn@Exclude.Test",
						name: "NotIn",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: ["notin@exclude.test"],
							operator: "not_in",
							mode: "insensitive",
						},
					],
				});

				const resultIds = result.map((u) => u.id);
				expect(resultIds).not.toContain(excludeUser.id);
				expect(resultIds).toContain(users[0]!.id);
			},
			"findMany - contains with mode insensitive": async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "prefixCONTAINSsuffix@test.com",
						name: "Contains",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "containssuffix",
							operator: "contains",
							mode: "insensitive",
						},
					],
				});

				expect(result.length).toBeGreaterThanOrEqual(1);
				expect(result.some((u) => u.id === user.id)).toBe(true);
			},
			"findMany - starts_with with mode insensitive": async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "STARTSwith@test.com",
						name: "StartsWith",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "starts",
							operator: "starts_with",
							mode: "insensitive",
						},
					],
				});

				expect(result.length).toBeGreaterThanOrEqual(1);
				expect(result.some((u) => u.id === user.id)).toBe(true);
			},
			"findMany - ends_with with mode insensitive": async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "user@ENDSWITH.Com",
						name: "EndsWith",
					},
					forceAllowId: true,
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "endswith.com",
							operator: "ends_with",
							mode: "insensitive",
						},
					],
				});

				expect(result.length).toBeGreaterThanOrEqual(1);
				expect(result.some((u) => u.id === user.id)).toBe(true);
			},
			"count - with mode insensitive": async () => {
				await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "CountTest@Case.INSENSITIVE",
						name: "CountTest",
					},
					forceAllowId: true,
				});

				const result = await adapter.count({
					model: "user",
					where: [
						{
							field: "email",
							value: "counttest@case.insensitive",
							operator: "eq",
							mode: "insensitive",
						},
					],
				});

				expect(result).toBeGreaterThanOrEqual(1);
			},
			"update - where with mode insensitive": async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "UpdateWhere@Insensitive.Test",
						name: "BeforeUpdate",
					},
					forceAllowId: true,
				});

				const result = await adapter.update<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "updatewhere@insensitive.test",
							operator: "eq",
							mode: "insensitive",
						},
					],
					update: { name: "AfterUpdate" },
				});

				expect(result).not.toBeNull();
				expect(result?.name).toBe("AfterUpdate");
				expect(result?.id).toBe(user.id);
			},
			"deleteMany - where with mode insensitive": async () => {
				const keepUser = (await insertRandom("user"))[0];
				const deleteUser = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						email: "DeleteMany@Case.INSENSITIVE",
						name: "ToDelete",
					},
					forceAllowId: true,
				});

				await adapter.deleteMany({
					model: "user",
					where: [
						{
							field: "email",
							value: "deletemany@case.insensitive",
							operator: "eq",
							mode: "insensitive",
						},
					],
				});

				const deleted = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: deleteUser.id }],
				});
				expect(deleted).toBeNull();

				const kept = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: keepUser.id }],
				});
				expect(kept).not.toBeNull();
			},
		};
	},
);
