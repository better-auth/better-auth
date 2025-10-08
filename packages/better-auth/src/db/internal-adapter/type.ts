import type { schema } from "../schema";
import type {
	Adapter,
	AuthContext,
	AuthPluginSchema,
	BetterAuthOptions,
	GenericEndpointContext,
	SchemaTypes,
	TransactionAdapter,
	Where,
} from "../../types";
import { type InternalLogger } from "../../utils";
import type { EndpointContext } from "better-call";

export type InternalAdapter<S extends AuthPluginSchema<typeof schema>> = {
	createOAuthUser: (
		user: Omit<SchemaTypes<S["user"], true>, "id">,
		account: Omit<
			SchemaTypes<S["account"], true>,
			"userId" | "id" | "createdAt" | "updatedAt"
		>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
	) => Promise<{
		user: SchemaTypes<S["user"]>;
		account: SchemaTypes<S["account"]>;
	}>;
	createUser: (
		user: Omit<
			SchemaTypes<S["user"], true>,
			"id" | "createdAt" | "updatedAt" | "emailVerified"
		> &
			Partial<SchemaTypes<S["user"], true>> &
			Record<string, any>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["user"]>>;
	createAccount: (
		account: Omit<SchemaTypes<S["account"]>, "id" | "createdAt" | "updatedAt"> &
			Partial<SchemaTypes<S["account"]>>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]>>;
	listSessions: (
		userId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["session"]>[]>;
	listUsers: (
		limit?: number,
		offset?: number,
		sortBy?: {
			field: string;
			direction: "asc" | "desc";
		},
		where?: Where<S["user"], keyof S["user"]["fields"] & string>[],
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["user"]>[]>;
	countTotalUsers: (
		where?: Where<S["user"], keyof S["user"]["fields"] & string>[],
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<number>;
	deleteUser: (
		userId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	createSession: (
		userId: string,
		ctx: GenericEndpointContext<S> | EndpointContext<any, any, AuthContext<S>>,
		dontRememberMe?: boolean,
		override?: Partial<SchemaTypes<S["session"]>>,
		overrideAll?: boolean,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["session"]>>;
	findSession: (
		token: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<{
		session: SchemaTypes<S["session"]> & Record<string, any>;
		user: SchemaTypes<S["user"]> & Record<string, any>;
	} | null>;
	findSessions: (
		sessionTokens: string[],
		trxAdapter?: TransactionAdapter<S>,
	) => {
		session: SchemaTypes<S["session"]>;
		user: SchemaTypes<S["user"]>;
	}[];
	updateSession: (
		sessionToken: string,
		session: Partial<SchemaTypes<S["session"]>> & Record<string, any>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => SchemaTypes<S["session"]>;
	deleteSession: (
		token: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	deleteAccounts: (
		userId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	deleteAccount: (
		accountId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	deleteSessions: (
		userIdOrSessionTokens: string | string[],
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	findOAuthUser: (
		email: string,
		accountId: string,
		providerId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<{
		user: SchemaTypes<S["user"]>;
		accounts: SchemaTypes<S["account"]>[];
	} | null>;
	findUserByEmail: (
		email: string,
		options?: { includeAccounts: boolean },
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<{
		user: SchemaTypes<S["user"]>;
		accounts: SchemaTypes<S["account"]>[];
	} | null>;
	findUserById: (
		userId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["user"]> | null>;
	linkAccount: (
		account: Omit<
			SchemaTypes<S["account"], true>,
			"id" | "createdAt" | "updatedAt" //| "scope" | "accessToken" | "refreshToken" | "accessTokenExpiresAt"
		> &
			Partial<SchemaTypes<S["account"], true>>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]>>;
	updateUser: (
		userId: string,
		data: Partial<SchemaTypes<S["user"]>> & Record<string, any>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["user"]> | null>;
	updateUserByEmail: (
		email: string,
		data: Partial<SchemaTypes<S["user"]>> & Record<string, any>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["user"]> | null>;
	updatePassword: (
		userId: string,
		password: string,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	findAccounts: (
		userId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]>[]>;
	findAccount: (
		accountId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]> | null>;
	findAccountByProviderId: (
		accountId: string,
		providerId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]> | null>;
	findAccountByUserId: (
		userId: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]>[]>;
	updateAccount: (
		id: string,
		data: Partial<SchemaTypes<S["account"]>>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["account"]> | null>;
	createVerificationValue: (
		data: Omit<
			SchemaTypes<S["verification"]>,
			"createdAt" | "id" | "updatedAt"
		> &
			Partial<SchemaTypes<S["verification"]>>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["verification"]>>;
	findVerificationValue: (
		identifier: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["verification"]> | null>;
	deleteVerificationValue: (
		id: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	deleteVerificationByIdentifier: (
		identifier: string,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<void>;
	updateVerificationValue: (
		id: string,
		data: Partial<SchemaTypes<S["verification"]>>,
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) => Promise<SchemaTypes<S["verification"]> | null>;
};

export type InternalAdapterInitializer<
	S extends AuthPluginSchema<typeof schema>,
> = (
	adapter: Adapter<S>,
	ctx: {
		options: Omit<BetterAuthOptions<S>, "logger">;
		logger: InternalLogger;
		hooks: Exclude<BetterAuthOptions<S>["databaseHooks"], undefined>[];
		generateId: AuthContext<S>["generateId"];
	},
) => InternalAdapter<S>;
