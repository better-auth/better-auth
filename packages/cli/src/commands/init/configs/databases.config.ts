import { createImport, type ImportGroup } from "../utility";

export type DatabaseAdapter =
	// prisma
	| "prisma-sqlite"
	| "prisma-mysql"
	| "prisma-postgresql"
	// drizzle
	| "drizzle-sqlite"
	| "drizzle-mysql"
	| "drizzle-postgresql"
	// kysely
	| "kysely-sqlite"
	| "kysely-mysql"
	| "kysely-postgresql"
	| "kysely-mssql"
	// mongodb
	| "mongodb";

export type DatabasesConfig = {
	adapter: DatabaseAdapter;
	imports: ImportGroup[];
	/**
	 * this is code that is placed before the auth config code.
	 */
	preCode?: string;
	code: (attributes: { additionalOptions?: Record<string, any> }) => string;
};

const prismaCode = ({
	provider,
	additionalOptions,
}: {
	provider: "sqlite" | "mysql" | "postgresql";
	additionalOptions?: Record<string, any>;
}) => {
	return `prismaAdapter(client, { provider: "${provider}", ${
		additionalOptions
			? Object.entries(additionalOptions)
					.map(([key, value]) => `${key}: ${value}`)
					.join(", ")
			: ""
	} })`;
};

const drizzleCode = ({
	provider,
	additionalOptions,
}: {
	provider: "sqlite" | "mysql" | "postgresql";
	additionalOptions?: Record<string, any>;
}) => {
	return `drizzleAdapter(db, { provider: "${provider}", schema, ${
		additionalOptions
			? Object.entries(additionalOptions)
					.map(([key, value]) => `${key}: ${value}`)
					.join(", ")
			: ""
	} })`;
};

const kyselyCode = ({
	provider,
	additionalOptions,
}: {
	provider: "sqlite" | "mysql" | "postgresql" | "mssql";
	additionalOptions?: Record<string, any>;
}) => {
	return `{dialect, type: "${provider}", ${
		additionalOptions
			? Object.entries(additionalOptions)
					.map(([key, value]) => `${key}: ${value}`)
					.join(", ")
			: ""
	} }`;
};

const mongodbCode = ({
	additionalOptions,
}: {
	additionalOptions?: Record<string, any>;
}) => {
	let optsString = "";
	if(additionalOptions){
		optsString = ", {";
		optsString = Object.entries(additionalOptions)
					.map(([key, value]) => `${key}: ${value}`)
					.join(", ");
		optsString += "}";
	}
	return `mongodbAdapter(db${optsString})`;
};

export const databasesConfig = [
	// Prisma
	{
		adapter: "prisma-sqlite",
		imports: [
			{
				path: "better-auth/adapters/prisma",
				imports: [createImport({ name: "prismaAdapter" })],
				isNamedImport: false,
			},
			{
				path: "@prisma/client",
				imports: [createImport({ name: "PrismaClient" })],
				isNamedImport: false,
			},
		],
		preCode: "const client = new PrismaClient();",
		code: ({ additionalOptions }) => {
			return prismaCode({ provider: "sqlite", additionalOptions });
		},
	},
	{
		adapter: "prisma-mysql",
		imports: [
			{
				path: "better-auth/adapters/prisma",
				imports: [createImport({ name: "prismaAdapter" })],
				isNamedImport: false,
			},
			{
				path: "@prisma/client",
				imports: [createImport({ name: "PrismaClient" })],
				isNamedImport: false,
			},
		],
		preCode: "const client = new PrismaClient();",
		code: ({ additionalOptions }) => {
			return prismaCode({ provider: "mysql", additionalOptions });
		},
	},
	{
		adapter: "prisma-postgresql",
		imports: [
			{
				path: "better-auth/adapters/prisma",
				imports: [createImport({ name: "prismaAdapter" })],
				isNamedImport: false,
			},
			{
				path: "@prisma/client",
				imports: [createImport({ name: "PrismaClient" })],
				isNamedImport: false,
			},
		],
		preCode: "const client = new PrismaClient();",
		code: ({ additionalOptions }) => {
			return prismaCode({ provider: "postgresql", additionalOptions });
		},
	},
	// Drizzle
	{
		adapter: "drizzle-sqlite",
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				imports: [createImport({ name: "drizzleAdapter" })],
				isNamedImport: false,
			},
			{
				path: "@/db",
				imports: [createImport({ name: "db" })],
				isNamedImport: false,
			},
			{
				path: "auth-schema.ts",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		code({ additionalOptions }) {
			return drizzleCode({ provider: "sqlite", additionalOptions });
		},
	},
	{
		adapter: "drizzle-postgresql",
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				imports: [createImport({ name: "drizzleAdapter" })],
				isNamedImport: false,
			},
			{
				path: "@/db",
				imports: [createImport({ name: "db" })],
				isNamedImport: false,
			},
			{
				path: "auth-schema.ts",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		code({ additionalOptions }) {
			return drizzleCode({ provider: "postgresql", additionalOptions });
		},
	},
	{
		adapter: "drizzle-mysql",
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				imports: [createImport({ name: "drizzleAdapter" })],
				isNamedImport: false,
			},
			{
				path: "@/db",
				imports: [createImport({ name: "db" })],
				isNamedImport: false,
			},
			{
				path: "auth-schema.ts",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		code({ additionalOptions }) {
			return drizzleCode({ provider: "mysql", additionalOptions });
		},
	},
	// Kysely
	{
		adapter: "kysely-sqlite",
		imports: [
			{
				path: "better-auth/adapters/kysely",
				imports: [createImport({ name: "kyselyAdapter" })],
				isNamedImport: false,
			},
			{
				path: "better-sqlite3",
				imports: createImport({ name: "Database" }),
				isNamedImport: true,
			},
		],
		preCode: `const dialect = new Database("database.sqlite")`,
		code({ additionalOptions }) {
			return kyselyCode({ provider: "sqlite", additionalOptions });
		},
	},
	{
		adapter: "kysely-mysql",
		imports: [
			{
				path: "better-auth/adapters/kysely",
				imports: [createImport({ name: "kyselyAdapter" })],
				isNamedImport: false,
			},
			{
				path: "mysql2/promise",
				imports: [createImport({ name: "createPool" })],
				isNamedImport: false,
			},
		],
		preCode: `const dialect = createPool({ host: "localhost", user: "root", password: "password", database: "database", timezone: "Z" })`,
		code({ additionalOptions }) {
			return kyselyCode({ provider: "mysql", additionalOptions });
		},
	},
	{
		adapter: "kysely-postgresql",
		imports: [
			{
				path: "better-auth/adapters/kysely",
				imports: [createImport({ name: "kyselyAdapter" })],
				isNamedImport: false,
			},
			{
				path: "pg",
				imports: [createImport({ name: "Pool" })],
				isNamedImport: false,
			},
		],
		preCode: `const dialect = new Pool({ connectionString: "postgresql://postgres:password@localhost:5432/database" })`,
		code({ additionalOptions }) {
			return kyselyCode({ provider: "postgresql", additionalOptions });
		},
	},
	{
		adapter: "kysely-mssql",
		imports: [
			{
				path: "better-auth/adapters/kysely",
				imports: [createImport({ name: "kyselyAdapter" })],
				isNamedImport: false,
			},
			{
				path: "kysely",
				imports: [createImport({ name: "MssqlDialect" })],
				isNamedImport: false,
			},
			{
				path: "tedious",
				imports: createImport({ name: "*", alias: "Tedious" }),
				isNamedImport: true,
			},
			{
				path: "tarn",
				imports: createImport({ name: "*", alias: "Tarn" }),
				isNamedImport: true,
			},
		],
		preCode: `const dialect = new MssqlDialect({
                    tarn: {
                        ...Tarn,
                        options: {
                        min: 0,
                        max: 10,
                        },
                    },
                    tedious: {
                        ...Tedious,
                        connectionFactory: () => new Tedious.Connection({
                        authentication: {
                            options: {
                            password: 'password',
                            userName: 'username',
                            },
                            type: 'default',
                        },
                        options: {
                            database: 'some_db',
                            port: 1433,
                            trustServerCertificate: true,
                        },
                        server: 'localhost',
                        }),
                    },
                    TYPES: {
                            ...Tedious.TYPES,
                            DateTime: Tedious.TYPES.DateTime2,
                        },
                    })`,
		code({ additionalOptions }) {
			return kyselyCode({ provider: "mssql", additionalOptions });
		},
	},
	// MongoDB
	{
		adapter: "mongodb",
		imports: [
			{
				path: "better-auth/adapters/mongodb",
				imports: [createImport({ name: "mongodbAdapter" })],
				isNamedImport: false,
			},
			{
				path: "mongodb",
				imports: [createImport({ name: "MongoClient" })],
				isNamedImport: false,
			},
		],
		preCode: `const client = new MongoClient(process.env.DATABASE_URL);\nconst db = client.db();`,
		code({ additionalOptions }) {
			return mongodbCode({ additionalOptions });
		},
	},
] satisfies DatabasesConfig[];
