import type { ImportGroup } from "../utility";
import { createImport } from "../utility/imports";

export type DatabaseAdapter =
	// prisma
	| "prisma-sqlite"
	| "prisma-mysql"
	| "prisma-postgresql"
	// drizzle
	| "drizzle-sqlite-better-sqlite3"
	| "drizzle-sqlite-bun"
	| "drizzle-sqlite-node"
	| "drizzle-mysql"
	| "drizzle-postgresql"
	// kysely
	| "sqlite-better-sqlite3"
	| "sqlite-bun"
	| "sqlite-node"
	| "mysql"
	| "postgresql"
	| "mssql"
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
	dependencies: string[];
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
	provider: "sqlite" | "mysql" | "pg";
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
	if (additionalOptions) {
		optsString = ", {";
		optsString += Object.entries(additionalOptions)
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
		dependencies: ["@prisma/client", "prisma"],
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
		dependencies: ["@prisma/client", "prisma"],
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
		dependencies: ["@prisma/client", "prisma"],
	},
	// Drizzle
	{
		adapter: "drizzle-sqlite-better-sqlite3",
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				imports: [createImport({ name: "drizzleAdapter" })],
				isNamedImport: false,
			},
			{
				path: "drizzle-orm/better-sqlite3",
				imports: [createImport({ name: "drizzle" })],
				isNamedImport: false,
			},
			{
				path: "better-sqlite3",
				imports: createImport({ name: "Database" }),
				isNamedImport: true,
			},
			{
				path: "./auth-schema",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		preCode: `const db = drizzle(new Database("database.sqlite"), { schema });`,
		code({ additionalOptions }) {
			return drizzleCode({ provider: "sqlite", additionalOptions });
		},
		dependencies: ["drizzle-orm", "better-sqlite3", "@types/better-sqlite3"],
	},
	{
		adapter: "drizzle-sqlite-bun",
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				imports: [createImport({ name: "drizzleAdapter" })],
				isNamedImport: false,
			},
			{
				path: "drizzle-orm/bun-sqlite",
				imports: [createImport({ name: "drizzle" })],
				isNamedImport: false,
			},
			{
				path: "bun:sqlite",
				imports: [createImport({ name: "Database" })],
				isNamedImport: false,
			},
			{
				path: "./auth-schema",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		preCode: `const db = drizzle({ client: new Database('sqlite.db'), schema });`,
		code({ additionalOptions }) {
			return drizzleCode({ provider: "sqlite", additionalOptions });
		},
		dependencies: ["drizzle-orm", "bun", "@types/bun"],
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
				path: "drizzle-orm/node-postgres",
				imports: [createImport({ name: "drizzle" })],
				isNamedImport: false,
			},
			{
				path: "pg",
				imports: [createImport({ name: "Pool" })],
				isNamedImport: false,
			},
			{
				path: "./auth-schema",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		preCode: `const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });`,
		code({ additionalOptions }) {
			return drizzleCode({ provider: "pg", additionalOptions });
		},
		dependencies: ["drizzle-orm", "pg"],
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
				path: "drizzle-orm/mysql2",
				imports: [createImport({ name: "drizzle" })],
				isNamedImport: false,
			},
			{
				path: "mysql2/promise",
				imports: [createImport({ name: "createPool" })],
				isNamedImport: false,
			},
			{
				path: "./auth-schema",
				imports: createImport({ name: "*", alias: "schema" }),
				isNamedImport: true,
			},
		],
		preCode: `const db = drizzle(createPool(process.env.DATABASE_URL!), { schema, mode: "default" });`,
		code({ additionalOptions }) {
			return drizzleCode({ provider: "mysql", additionalOptions });
		},
		dependencies: ["drizzle-orm", "mysql2"],
	},
	// Kysely
	{
		adapter: "sqlite-better-sqlite3",
		imports: [
			{
				path: "better-sqlite3",
				imports: createImport({ name: "Database" }),
				isNamedImport: true,
			},
		],
		preCode: `const database = new Database("auth.db")`,
		code({ additionalOptions }) {
			return `database`;
		},
		dependencies: ["better-sqlite3", "@types/better-sqlite3"],
	},
	{
		adapter: "sqlite-bun",
		imports: [
			{
				path: "bun:sqlite",
				imports: createImport({ name: "Database" }),
				isNamedImport: true,
			},
		],
		preCode: `const database = new Database("auth.db")`,
		code({ additionalOptions }) {
			return `database`;
		},
		dependencies: [],
	},
	{
		adapter: "sqlite-node",
		imports: [
			{
				path: "node:sqlite",
				imports: createImport({ name: "DatabaseSync" }),
				isNamedImport: true,
			},
		],
		preCode: `const database = new DatabaseSync("auth.db")`,
		code({ additionalOptions }) {
			return `database`;
		},
		dependencies: [],
	},
	{
		adapter: "mysql",
		imports: [
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
		dependencies: ["mysql2"],
	},
	{
		adapter: "postgresql",
		imports: [
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
		dependencies: ["pg"],
	},
	{
		adapter: "mssql",
		imports: [
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
						TYPES: {
								...Tedious.TYPES,
								DateTime: Tedious.TYPES.DateTime2,
							},
                    },
                    })`,
		code({ additionalOptions }) {
			return kyselyCode({ provider: "mssql", additionalOptions });
		},
		dependencies: ["kysely", "tedious", "tarn"],
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
		preCode: `const client = new MongoClient(process.env.DATABASE_URL!);\nconst db = client.db();`,
		code({ additionalOptions }) {
			return mongodbCode({ additionalOptions });
		},
		dependencies: ["mongodb"],
	},
] satisfies DatabasesConfig[];
