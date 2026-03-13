import type { BetterAuthOptions } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { expect } from "vitest";
import { getPrismaClient } from "./get-prisma-client";

const dialect = "postgresql";

/**
 * Test suite that verifies JSON field support in the Prisma PostgreSQL adapter.
 * Extends the core user schema with a metadata JSON field and tests:
 * - Write/read via adapter
 * - Write/read via Prisma directly
 * - Cross-operations: write via adapter, read via Prisma and vice versa
 */
export const prismaPgJsonFieldTestSuite = createTestSuite(
	"prisma-pg-json-field",
	{
		defaultBetterAuthOptions: {
			user: {
				additionalFields: {
					metadata: {
						type: "json",
						required: false,
					},
				},
			},
		} satisfies BetterAuthOptions,
		alwaysMigrate: true,
	},
	(helpers) => {
		const sampleMetadata = {
			theme: "dark",
			preferences: { notifications: true },
			tags: ["admin", "beta"],
		};

		return {
			"json - write and read via adapter": async () => {
				const adapter = helpers.adapter;
				const userData = await helpers.generate("user");
				const userWithMetadata = {
					...userData,
					metadata: sampleMetadata,
				};

				const created = await adapter.create<
					User & { metadata?: typeof sampleMetadata }
				>({
					model: "user",
					data: userWithMetadata,
					forceAllowId: true,
				});

				expect(created.metadata).toEqual(sampleMetadata);

				const found = await adapter.findOne<
					User & { metadata?: typeof sampleMetadata }
				>({
					model: "user",
					where: [{ field: "id", value: created.id }],
				});

				expect(found?.metadata).toEqual(sampleMetadata);
			},
			"json - write and read via Prisma directly": async () => {
				const db = await getPrismaClient(dialect);
				const userData = await helpers.generate("user");
				const userWithMetadata = {
					...userData,
					metadata: sampleMetadata,
				};

				const created = await db.user.create({
					data: userWithMetadata,
				});

				// @ts-expect-error - not typed
				expect(created.metadata).toEqual(sampleMetadata);

				const found = await db.user.findUnique({
					where: { id: created.id },
				});

				// @ts-expect-error - not typed
				expect(found?.metadata).toEqual(sampleMetadata);
			},
			"json - write via adapter, read via Prisma": async () => {
				const adapter = helpers.adapter;
				const db = await getPrismaClient(dialect);
				const userData = await helpers.generate("user");
				const userWithMetadata = {
					...userData,
					metadata: sampleMetadata,
				};

				const created = await adapter.create<
					User & { metadata?: typeof sampleMetadata }
				>({
					model: "user",
					data: userWithMetadata,
					forceAllowId: true,
				});

				const foundViaPrisma = await db.user.findUnique({
					where: { id: created.id },
				});

				// @ts-expect-error - not typed
				expect(foundViaPrisma?.metadata).toEqual(sampleMetadata);
			},
			"json - write via Prisma, read via adapter": async () => {
				const adapter = helpers.adapter;
				const db = await getPrismaClient(dialect);
				const userData = await helpers.generate("user");
				const userWithMetadata = {
					...userData,
					metadata: sampleMetadata,
				};

				const created = await db.user.create({
					data: userWithMetadata,
				});

				const foundViaAdapter = await adapter.findOne<
					User & { metadata?: typeof sampleMetadata }
				>({
					model: "user",
					where: [{ field: "id", value: created.id }],
				});

				expect(foundViaAdapter?.metadata).toEqual(sampleMetadata);
			},
		};
	},
);
