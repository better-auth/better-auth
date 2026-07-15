import type {
	BetterAuthDBOptions,
	BetterAuthOptions,
	BetterAuthPlugin,
	InternalAdapter,
} from "@better-auth/core";
import type {
	Account,
	AccountKey,
	AccountWithIdentity,
	Identity,
	IdentityKey,
	Session,
	User,
	Verification,
} from "@better-auth/core/db";
import { expectTypeOf, test } from "vitest";

const testPlugin = () => {
	return {
		id: "demo",
		schema: {
			user: {
				fields: {
					customField: {
						type: "string",
						required: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};

test("User with additionalFields", () => {
	const options = {
		user: {
			additionalFields: {
				code: {
					type: "string",
					required: false,
				},
				name: {
					type: "string",
					required: true,
				},
			},
		},
		plugins: [testPlugin()],
	} satisfies BetterAuthOptions;

	type Options = typeof options;

	type FinalUser = User<Options["user"], Options["plugins"]>;

	expectTypeOf<FinalUser["customField"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalUser["code"]>().toEqualTypeOf<string | null | undefined>();
	expectTypeOf<FinalUser["name"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalUser["email"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalUser["id"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalUser["createdAt"]>().toEqualTypeOf<Date>();
	expectTypeOf<FinalUser["updatedAt"]>().toEqualTypeOf<Date>();
});

test("User with different field types", () => {
	const options = {
		user: {
			additionalFields: {
				age: {
					type: "number",
					required: true,
				},
				isActive: {
					type: "boolean",
					required: false,
				},
				joinedAt: {
					type: "date",
					required: true,
				},
				metadata: {
					type: "json",
					required: false,
				},
			},
		},
	} satisfies BetterAuthOptions;

	type FinalUser = User<(typeof options)["user"]>;

	expectTypeOf<FinalUser["age"]>().toEqualTypeOf<number>();
	expectTypeOf<FinalUser["isActive"]>().toEqualTypeOf<
		boolean | null | undefined
	>();
	expectTypeOf<FinalUser["joinedAt"]>().toEqualTypeOf<Date>();
	expectTypeOf<FinalUser["metadata"]>().toEqualTypeOf<
		Record<string, any> | null | undefined
	>();
});

test("Session with additionalFields", () => {
	const options = {
		session: {
			additionalFields: {
				deviceId: {
					type: "string",
					required: true,
				},
				refreshCount: {
					type: "number",
					required: false,
				},
			},
		},
	} satisfies BetterAuthOptions;

	type FinalSession = Session<(typeof options)["session"]>;

	expectTypeOf<FinalSession["deviceId"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalSession["refreshCount"]>().toEqualTypeOf<
		number | null | undefined
	>();
	expectTypeOf<FinalSession["token"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalSession["userId"]>().toEqualTypeOf<string>();
});

test("Account with additionalFields", () => {
	const options = {
		account: {
			additionalFields: {
				lastLoginAt: {
					type: "date",
					required: false,
				},
				isVerified: {
					type: "boolean",
					required: true,
				},
			},
		},
	} satisfies BetterAuthOptions;

	type FinalAccount = Account<(typeof options)["account"]>;

	expectTypeOf<FinalAccount["lastLoginAt"]>().toEqualTypeOf<
		Date | null | undefined
	>();
	expectTypeOf<FinalAccount["isVerified"]>().toEqualTypeOf<boolean>();
	expectTypeOf<FinalAccount["providerId"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalAccount["providerInstanceId"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalAccount["identityId"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalAccount>().not.toHaveProperty("issuer");
	expectTypeOf<FinalAccount>().not.toHaveProperty("providerAccountId");
	expectTypeOf<FinalAccount>().not.toHaveProperty("userId");
});

test("AccountKey mirrors the provider-account uniqueness contract", () => {
	expectTypeOf<AccountKey>().toEqualTypeOf<
		Readonly<{ identityId: string; providerInstanceId: string }>
	>();
	expectTypeOf<AccountKey>().not.toHaveProperty("providerId");
	expectTypeOf<AccountKey>().not.toHaveProperty("id");
});

test("Identity with additionalFields", () => {
	const options = {
		identity: {
			additionalFields: {
				lastAuthenticatedAt: {
					type: "date",
					required: false,
				},
			},
		},
	} satisfies BetterAuthOptions;

	type FinalIdentity = Identity<(typeof options)["identity"]>;

	expectTypeOf<FinalIdentity["lastAuthenticatedAt"]>().toEqualTypeOf<
		Date | null | undefined
	>();
	expectTypeOf<FinalIdentity["issuer"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalIdentity["providerAccountId"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalIdentity["userId"]>().toEqualTypeOf<string>();
});

test("IdentityKey mirrors the issuer-scoped uniqueness contract", () => {
	expectTypeOf<IdentityKey>().toEqualTypeOf<
		Readonly<{ issuer: string; providerAccountId: string }>
	>();
	expectTypeOf<IdentityKey>().not.toHaveProperty("id");
	expectTypeOf<IdentityKey>().not.toHaveProperty("userId");
});

test("AccountWithIdentity and InternalAdapter preserve configured model fields", () => {
	const modelFieldsPlugin = {
		id: "model-fields",
		schema: {
			account: {
				fields: {
					pluginAccountLabel: {
						type: "string",
						required: true,
					},
				},
			},
			identity: {
				fields: {
					pluginIdentityLabel: {
						type: "string",
						required: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
	const options = {
		account: {
			additionalFields: {
				accountLabel: {
					type: "string",
					required: true,
				},
			},
		},
		identity: {
			additionalFields: {
				identityLabel: {
					type: "string",
					required: true,
				},
			},
		},
		plugins: [modelFieldsPlugin],
	} satisfies BetterAuthOptions;
	type Options = typeof options;
	type LinkedAccount = AccountWithIdentity<Options>;
	type ListedAccount = Awaited<
		ReturnType<InternalAdapter<Options>["listUserAccounts"]>
	>[number];

	expectTypeOf<
		LinkedAccount["account"]["accountLabel"]
	>().toEqualTypeOf<string>();
	expectTypeOf<
		LinkedAccount["account"]["pluginAccountLabel"]
	>().toEqualTypeOf<string>();
	expectTypeOf<
		LinkedAccount["identity"]["identityLabel"]
	>().toEqualTypeOf<string>();
	expectTypeOf<
		LinkedAccount["identity"]["pluginIdentityLabel"]
	>().toEqualTypeOf<string>();
	expectTypeOf<ListedAccount>().toEqualTypeOf<LinkedAccount>();
});

test("Verification with additionalFields", () => {
	const options = {
		verification: {
			additionalFields: {
				attempts: {
					type: "number",
					required: true,
				},
				lockedUntil: {
					type: "date",
					required: false,
				},
			},
		},
	} satisfies BetterAuthOptions;

	type FinalVerification = Verification<(typeof options)["verification"]>;

	expectTypeOf<FinalVerification["attempts"]>().toEqualTypeOf<number>();
	expectTypeOf<FinalVerification["lockedUntil"]>().toEqualTypeOf<
		Date | null | undefined
	>();
	expectTypeOf<FinalVerification["value"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalVerification["identifier"]>().toEqualTypeOf<string>();
});

test("Schema without additionalFields should work", () => {
	type DefaultUser = User;
	type DefaultSession = Session;
	type DefaultIdentity = Identity;
	type DefaultAccount = Account;
	type DefaultVerification = Verification;

	expectTypeOf<DefaultUser["email"]>().toEqualTypeOf<string>();
	expectTypeOf<DefaultSession["token"]>().toEqualTypeOf<string>();
	expectTypeOf<DefaultIdentity["issuer"]>().toEqualTypeOf<string>();
	expectTypeOf<DefaultAccount["providerId"]>().toEqualTypeOf<string>();
	expectTypeOf<DefaultAccount["providerInstanceId"]>().toEqualTypeOf<string>();
	expectTypeOf<DefaultVerification["value"]>().toEqualTypeOf<string>();
});

test("User with plugin fields", () => {
	const options = {
		plugins: [
			{
				id: "test-plugin",
				schema: {
					user: {
						fields: {
							pluginField: {
								type: "string",
								required: true,
							},
							optionalPluginField: {
								type: "number",
								required: false,
							},
						},
					},
				},
			},
		],
	} satisfies BetterAuthOptions;

	type FinalUser = User<
		BetterAuthDBOptions<"user">,
		(typeof options)["plugins"]
	>;

	expectTypeOf<FinalUser["pluginField"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalUser["optionalPluginField"]>().toEqualTypeOf<
		number | null | undefined
	>();
	expectTypeOf<FinalUser["email"]>().toEqualTypeOf<string>();
});

test("Session with plugin fields", () => {
	const options = {
		plugins: [
			{
				id: "session-plugin",
				schema: {
					session: {
						fields: {
							pluginSessionId: {
								type: "string",
								required: true,
							},
							metadata: {
								type: "json",
								required: false,
							},
						},
					},
				},
			},
		],
	} satisfies BetterAuthOptions;

	type FinalSession = Session<
		BetterAuthDBOptions<"session">,
		(typeof options)["plugins"]
	>;

	expectTypeOf<FinalSession["pluginSessionId"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalSession["metadata"]>().toEqualTypeOf<
		Record<string, any> | null | undefined
	>();
	expectTypeOf<FinalSession["token"]>().toEqualTypeOf<string>();
});

test("Account with plugin fields", () => {
	const options = {
		plugins: [
			{
				id: "account-plugin",
				schema: {
					account: {
						fields: {
							customAccountField: {
								type: "boolean",
								required: true,
							},
						},
					},
				},
			},
		],
	} satisfies BetterAuthOptions;

	type FinalAccount = Account<
		BetterAuthDBOptions<"account">,
		(typeof options)["plugins"]
	>;

	expectTypeOf<FinalAccount["customAccountField"]>().toEqualTypeOf<boolean>();
	expectTypeOf<FinalAccount["providerId"]>().toEqualTypeOf<string>();
});

test("User with both additionalFields and plugin fields", () => {
	const options = {
		user: {
			additionalFields: {
				customField: {
					type: "string",
					required: true,
				},
			},
		},
		plugins: [
			{
				id: "test-plugin",
				schema: {
					user: {
						fields: {
							pluginField: {
								type: "number",
								required: true,
							},
						},
					},
				},
			},
		],
	} satisfies BetterAuthOptions;

	type FinalUser = User<(typeof options)["user"], (typeof options)["plugins"]>;

	expectTypeOf<FinalUser["customField"]>().toEqualTypeOf<string>();
	expectTypeOf<FinalUser["pluginField"]>().toEqualTypeOf<number>();
	expectTypeOf<FinalUser["email"]>().toEqualTypeOf<string>();
});
