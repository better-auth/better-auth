import type { DependenciesGroup, Env, Import } from "./types";

/**
 * Should only use any database that is core DBs, and supports the BetterAuth CLI generate functionality.
 */
export const supportedDatabases = [
	// Built-in kysely
	"sqlite",
	"mysql",
	"mssql",
	"postgres",
	// Drizzle
	"drizzle:pg",
	"drizzle:mysql",
	"drizzle:sqlite",
	// Prisma
	"prisma:pg",
	"prisma:mysql",
	"prisma:sqlite",
	// Mongo
	"mongodb",
] as const;

export type SupportedDatabase = (typeof supportedDatabases)[number];

export const databaseCodeSnippets: Record<
	SupportedDatabase,
	{
		/**
		 * Code that is defined above the `betterAuth` call.
		 */
		pre_code?: string;
		/**
		 * Code that will be defined in the `database:` option.
		 */
		snippet: string;
		imports: Import[];
		dependencies: DependenciesGroup[];
		envs: Env[];
	}
> = {
	sqlite: {
		snippet: `new Database(process.env.DATABASE_URL || "database.sqlite")`,
		imports: [
			{
				path: "better-sqlite3",
				variables: { name: "Database" },
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "better-sqlite3",
						version: "latest",
					},
				],
			},
			{
				type: "dev",
				dependencies: [
					{
						packageName: "@types/better-sqlite3",
						version: "latest",
					},
				],
			},
		],
		envs: [
			{
				name: "DATABASE_URL",
				value: undefined,
				comment: "The URL of your database",
			},
		],
	},

	postgres: {
		snippet: `{ type: "postgres", dialect: new PgDialect(createPool(process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/database")) }`,
		imports: [
			{
				path: "pg",
				variables: [
					{
						name: "Pool",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "pg",
						version: "latest",
					},
				],
			},
			{
				type: "dev",
				dependencies: [
					{
						packageName: "@types/pg",
						version: "latest",
					},
				],
			},
		],
		envs: [
			{
				name: "DATABASE_URL",
				value: undefined,
				comment: "The URL of your database",
			},
		],
	},

	mysql: {
		snippet: `{ type: "mysql", dialect: new MysqlDialect(createPool(process.env.DATABASE_URL || "mysql://root:password@localhost:3306/database")) }`,
		imports: [
			{
				path: "mysql2/promise",
				variables: [
					{
						name: "createPool",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "mysql2",
						version: "latest",
					},
				],
			},
		],
		envs: [
			{
				name: "DATABASE_URL",
				value: undefined,
				comment: "The URL of your database",
			},
		],
	},

	mssql: {
		pre_code: `const dialect = new MssqlDialect({
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
					})`,
		snippet: `{type: "mssql", dialect: dialect}`,
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "tedious",
						version: "latest",
					},
					{
						packageName: "tarn",
						version: "latest",
					},
					{
						packageName: "kysely",
						version: "latest",
					},
				],
			},
		],
		imports: [
			{
				path: "tedious",
				variables: {
					name: "*",
					as: "Tedious",
				},
			},
			{
				path: "tarn",
				variables: {
					name: "*",
					as: "Tarn",
				},
			},
			{
				path: "kysely",
				variables: [
					{
						name: "MssqlDialect",
					},
				],
			},
		],
		envs: [
			{
				name: "DATABASE_URL",
				value: undefined,
				comment: "The URL of your database",
			},
		],
	},

	"drizzle:mysql": {
		snippet: `drizzleAdapter(db, {\nprovider: "mysql",\n})`,
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				variables: [
					{
						name: "drizzleAdapter",
					},
				],
			},
			{
				path: "./database.ts",
				variables: [
					{
						name: "db",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "drizzle-orm",
						version: "latest",
					},
				],
			},
		],
		envs: [],
	},
	"drizzle:pg": {
		snippet: `drizzleAdapter(db, {\nprovider: "pg",\n})`,
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				variables: [
					{
						name: "drizzleAdapter",
					},
				],
			},
			{
				path: "./database.ts",
				variables: [
					{
						name: "db",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "drizzle-orm",
						version: "latest",
					},
				],
			},
		],
		envs: [],
	},

	"drizzle:sqlite": {
		snippet: `drizzleAdapter(db, {\nprovider: "sqlite",\n})`,
		imports: [
			{
				path: "better-auth/adapters/drizzle",
				variables: [
					{
						name: "drizzleAdapter",
					},
				],
			},
			{
				path: "./database.ts",
				variables: [
					{
						name: "db",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "drizzle-orm",
						version: "latest",
					},
				],
			},
		],
		envs: [],
	},

	"prisma:mysql": {
		pre_code: `const client = new PrismaClient();`,
		snippet: `prismaAdapter(client, {\nprovider: "mysql",\n})`,
		imports: [
			{
				path: "better-auth/adapters/prisma",
				variables: [
					{
						name: "prismaAdapter",
					},
				],
			},
			{
				path: "@prisma/client",
				variables: [
					{
						name: "PrismaClient",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "@prisma/client",
						version: "latest",
					},
				],
			},
		],
		envs: [],
	},

	"prisma:pg": {
		pre_code: `const client = new PrismaClient();`,
		snippet: `prismaAdapter(client, {\nprovider: "pg",\n})`,
		imports: [
			{
				path: "better-auth/adapters/prisma",
				variables: [
					{
						name: "prismaAdapter",
					},
				],
			},
			{
				path: "@prisma/client",
				variables: [
					{
						name: "PrismaClient",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "@prisma/client",
						version: "latest",
					},
				],
			},
		],
		envs: [],
	},

	"prisma:sqlite": {
		pre_code: `const client = new PrismaClient();`,
		snippet: `prismaAdapter(client, {\nprovider: "sqlite",\n})`,
		imports: [
			{
				path: "better-auth/adapters/prisma",
				variables: [
					{
						name: "prismaAdapter",
					},
				],
			},
			{
				path: "@prisma/client",
				variables: [
					{
						name: "PrismaClient",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "@prisma/client",
						version: "latest",
					},
				],
			},
		],
		envs: [],
	},

	mongodb: {
		pre_code: [
			`const client = new MongoClient(process.env.DATABASE_URL || "mongodb://localhost:27017/database");`,
			`const db = client.db();`,
		].join(`\n`),
		snippet: `mongodbAdapter(db)`,
		imports: [
			{
				path: "better-auth/adapters/mongodb",
				variables: [
					{
						name: "mongodbAdapter",
					},
				],
			},
			{
				path: "mongodb",
				variables: [
					{
						name: "MongoClient",
					},
				],
			},
		],
		dependencies: [
			{
				type: "default",
				dependencies: [
					{
						packageName: "mongodb",
						version: "latest",
					},
				],
			},
		],
		envs: [
			{
				name: "DATABASE_URL",
				value: undefined,
				comment: "The URL of your database",
			},
		],
	},
};

export const db_schema_generation_or_migration_supported_databases: {
	id: SupportedDatabase;
	migration: boolean;
	generation: boolean;
}[] = [
	{
		id: "sqlite",
		generation: true,
		migration: true,
	},
	{
		id: "mysql",
		generation: true,
		migration: true,
	},
	{
		id: "mssql",
		generation: true,
		migration: true,
	},
	{
		id: "postgres",
		generation: true,
		migration: true,
	},
	{
		id: "drizzle:mysql",
		migration: false,
		generation: true,
	},
	{
		id: "drizzle:pg",
		migration: false,
		generation: true,
	},
	{
		id: "drizzle:sqlite",
		migration: false,
		generation: true,
	},
	{
		id: "prisma:mysql",
		generation: false,
		migration: true,
	},
	{
		id: "prisma:pg",
		generation: false,
		migration: true,
	},
	{
		id: "prisma:sqlite",
		generation: false,
		migration: true,
	},
	{
		id: "mongodb",
		generation: true,
		migration: false,
	},
];
