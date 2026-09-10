import type { BetterAuthDBSchema } from "@better-auth/core/db";
import { initGetDefaultModelName } from "@better-auth/core/db/adapter";
import { describe, expect, it } from "vitest";
import {
	buildRelationKeysByModel,
	getOneToOneRelationKey,
} from "./join-relation-key";

const schema = {
	user: {
		modelName: "user",
		fields: {
			id: { type: "string" },
		},
	},
	session: {
		modelName: "session",
		fields: {
			userId: {
				type: "string",
				references: { model: "user", field: "id" },
			},
		},
	},
} satisfies BetterAuthDBSchema;

function resolveRelationKey({
	baseModel,
	joinModel,
	relationKeys,
	usePlural,
	databaseSchema = schema,
}: {
	baseModel: string;
	joinModel: string;
	relationKeys: readonly string[] | undefined;
	usePlural: boolean;
	databaseSchema?: BetterAuthDBSchema | undefined;
}) {
	return getOneToOneRelationKey({
		baseModel,
		joinModel,
		relationKeys: relationKeys ? new Set(relationKeys) : undefined,
		schema: databaseSchema,
		getDefaultModelName: initGetDefaultModelName({
			schema: databaseSchema,
			usePlural,
		}),
	});
}

describe("buildRelationKeysByModel", () => {
	it("collects keys from registered relations", () => {
		const relationKeysByModel = buildRelationKeysByModel({
			users: {
				relations: {
					sessions: {},
					accounts: {},
				},
			},
			sessions: {},
		});

		expect(relationKeysByModel.get("users")).toEqual(
			new Set(["sessions", "accounts"]),
		);
		expect(relationKeysByModel.has("sessions")).toBe(false);
	});
});

describe("getOneToOneRelationKey", () => {
	it("resolves a generated forward relation key with plural models", () => {
		expect(
			resolveRelationKey({
				baseModel: "sessions",
				joinModel: "users",
				relationKeys: ["user"],
				usePlural: true,
			}),
		).toBe("user");
	});

	it("prefers a generated key when generated and legacy keys both exist", () => {
		expect(
			resolveRelationKey({
				baseModel: "sessions",
				joinModel: "users",
				relationKeys: ["user", "users"],
				usePlural: true,
			}),
		).toBe("user");
	});

	it("falls back to a legacy plural forward relation key", () => {
		expect(
			resolveRelationKey({
				baseModel: "sessions",
				joinModel: "users",
				relationKeys: ["users"],
				usePlural: true,
			}),
		).toBe("users");
	});

	it("resolves a generated reverse relation key with plural models", () => {
		expect(
			resolveRelationKey({
				baseModel: "users",
				joinModel: "sessions",
				relationKeys: ["sessions"],
				usePlural: true,
			}),
		).toBe("sessions");
	});

	it("resolves a relation key without plural model names", () => {
		expect(
			resolveRelationKey({
				baseModel: "session",
				joinModel: "user",
				relationKeys: ["user"],
				usePlural: false,
			}),
		).toBe("user");
	});

	it("resolves a custom model name", () => {
		const customSchema = {
			user: {
				modelName: "member",
				fields: {
					id: { type: "string" },
				},
			},
			session: {
				modelName: "authSession",
				fields: {
					userId: {
						type: "string",
						references: { model: "user", field: "id" },
					},
				},
			},
		} satisfies BetterAuthDBSchema;

		expect(
			resolveRelationKey({
				baseModel: "authSessions",
				joinModel: "members",
				relationKeys: ["member"],
				usePlural: true,
				databaseSchema: customSchema,
			}),
		).toBe("member");
	});

	it("preserves the transformed join model without relation metadata", () => {
		expect(
			resolveRelationKey({
				baseModel: "sessions",
				joinModel: "users",
				relationKeys: undefined,
				usePlural: true,
			}),
		).toBe("users");
	});

	it("uses the generated key when metadata has no matching candidate", () => {
		expect(
			resolveRelationKey({
				baseModel: "sessions",
				joinModel: "users",
				relationKeys: ["profile"],
				usePlural: true,
			}),
		).toBe("user");
	});
});
