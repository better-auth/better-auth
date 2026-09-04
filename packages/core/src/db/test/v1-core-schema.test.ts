/**
 * The v1 core schema contract.
 *
 * A database created by one v1 release keeps working on every later v1
 * release. That holds only while the four core tables stay exactly as they
 * are, so this file freezes their whole declaration. Renaming a table, adding,
 * removing, or retyping a column, or adding an index sends every existing
 * deployment through a data migration before it can upgrade.
 *
 * The expectation below is the schema itself rather than a summary of it, so a
 * property added to a table or to a field turns up here on its own. That also
 * pins declarations no database ever sees, such as `order` and `input`, and it
 * is meant to: deciding which properties matter is the judgement this file
 * exists to put in front of a reviewer.
 *
 * Do not edit it for the lifetime of v1. A failure here is not a stale test,
 * it is a breaking change that belongs in the next major release.
 *
 * Deployments still extend the schema through plugins, `additionalFields`, and
 * custom `fieldName` mappings, none of which this file covers.
 */

import { describe, expect, it } from "vitest";
import { getAuthTables } from "../get-tables";
import type { BaseAccount } from "../schema/account";
import type { BaseSession } from "../schema/session";
import type { BaseUser } from "../schema/user";
import type { BaseVerification } from "../schema/verification";

type AuthTables = ReturnType<typeof getAuthTables>;
type AuthField = AuthTables[string]["fields"][string];

/**
 * A core table as v1 declares it. `id` is absent from `fields` because the
 * adapter supplies the primary key.
 */
type CoreTable<Table> = {
	modelName: string;
	indexes: undefined;
	fields: Record<Exclude<keyof Table, "id">, AuthField>;
	order: number;
};

const v1CoreSchema: {
	user: CoreTable<BaseUser>;
	session: CoreTable<BaseSession>;
	account: CoreTable<BaseAccount>;
	verification: CoreTable<BaseVerification>;
} = {
	user: {
		modelName: "user",
		indexes: undefined,
		fields: {
			name: {
				type: "string",
				required: true,
				fieldName: "name",
				sortable: true,
			},
			email: {
				type: "string",
				unique: true,
				required: true,
				fieldName: "email",
				sortable: true,
			},
			emailVerified: {
				type: "boolean",
				defaultValue: false,
				required: true,
				fieldName: "emailVerified",
				input: false,
			},
			image: {
				type: "string",
				required: false,
				fieldName: "image",
			},
			createdAt: {
				type: "date",
				defaultValue: expect.any(Function),
				required: true,
				fieldName: "createdAt",
			},
			updatedAt: {
				type: "date",
				defaultValue: expect.any(Function),
				onUpdate: expect.any(Function),
				required: true,
				fieldName: "updatedAt",
			},
		},
		order: 1,
	},
	session: {
		modelName: "session",
		indexes: undefined,
		fields: {
			expiresAt: {
				type: "date",
				required: true,
				fieldName: "expiresAt",
			},
			token: {
				type: "string",
				required: true,
				fieldName: "token",
				unique: true,
			},
			createdAt: {
				type: "date",
				required: true,
				fieldName: "createdAt",
				defaultValue: expect.any(Function),
			},
			updatedAt: {
				type: "date",
				required: true,
				fieldName: "updatedAt",
				onUpdate: expect.any(Function),
			},
			ipAddress: {
				type: "string",
				required: false,
				fieldName: "ipAddress",
			},
			userAgent: {
				type: "string",
				required: false,
				fieldName: "userAgent",
			},
			userId: {
				type: "string",
				fieldName: "userId",
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				required: true,
				index: true,
			},
		},
		order: 2,
	},
	account: {
		modelName: "account",
		indexes: undefined,
		fields: {
			accountId: {
				type: "string",
				required: true,
				fieldName: "accountId",
			},
			providerId: {
				type: "string",
				required: true,
				fieldName: "providerId",
			},
			userId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				required: true,
				fieldName: "userId",
				index: true,
			},
			accessToken: {
				type: "string",
				required: false,
				returned: false,
				fieldName: "accessToken",
			},
			refreshToken: {
				type: "string",
				required: false,
				returned: false,
				fieldName: "refreshToken",
			},
			idToken: {
				type: "string",
				required: false,
				returned: false,
				fieldName: "idToken",
			},
			accessTokenExpiresAt: {
				type: "date",
				required: false,
				returned: false,
				fieldName: "accessTokenExpiresAt",
			},
			refreshTokenExpiresAt: {
				type: "date",
				required: false,
				returned: false,
				fieldName: "refreshTokenExpiresAt",
			},
			scope: {
				type: "string",
				required: false,
				fieldName: "scope",
			},
			password: {
				type: "string",
				required: false,
				returned: false,
				fieldName: "password",
			},
			createdAt: {
				type: "date",
				required: true,
				fieldName: "createdAt",
				defaultValue: expect.any(Function),
			},
			updatedAt: {
				type: "date",
				required: true,
				fieldName: "updatedAt",
				onUpdate: expect.any(Function),
			},
		},
		order: 3,
	},
	verification: {
		modelName: "verification",
		indexes: undefined,
		fields: {
			identifier: {
				type: "string",
				required: true,
				fieldName: "identifier",
				index: true,
			},
			value: {
				type: "string",
				required: true,
				fieldName: "value",
			},
			expiresAt: {
				type: "date",
				required: true,
				fieldName: "expiresAt",
			},
			createdAt: {
				type: "date",
				required: true,
				defaultValue: expect.any(Function),
				fieldName: "createdAt",
			},
			updatedAt: {
				type: "date",
				required: true,
				defaultValue: expect.any(Function),
				onUpdate: expect.any(Function),
				fieldName: "updatedAt",
			},
		},
		order: 4,
	},
};

const coreSchemaIsFrozen =
	"The v1 core schema is frozen. A change here sends every existing v1 deployment through a data migration, so ship it in the next major release instead of updating this expectation.";

describe("v1 core schema", () => {
	it("keeps the core tables as v1 shipped them", () => {
		expect(getAuthTables({}), coreSchemaIsFrozen).toStrictEqual(v1CoreSchema);
	});
});
