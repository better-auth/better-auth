import type {
	Database,
	DatabaseConfig,
	EnvVar,
	ORM,
	ORMConfig,
} from "../types.js";

const DATABASE_CONFIGS: Record<Database, DatabaseConfig> = {
	postgres: {
		provider: "postgresql",
		envVarName: "DATABASE_URL",
		connectionStringExample: "postgresql://user:password@localhost:5432/mydb",
	},
	mysql: {
		provider: "mysql",
		envVarName: "DATABASE_URL",
		connectionStringExample: "mysql://user:password@localhost:3306/mydb",
	},
	sqlite: {
		provider: "sqlite",
		envVarName: "DATABASE_URL",
		connectionStringExample: "file:./dev.db",
	},
	mongodb: {
		provider: "mongodb",
		envVarName: "DATABASE_URL",
		connectionStringExample: "mongodb://localhost:27017/mydb",
	},
};

const ORM_CONFIGS: Record<ORM, ORMConfig> = {
	prisma: {
		adapterImport: `import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";`,
		adapterSetup: (dbProvider: string) => `prismaAdapter(prisma, {
    provider: "${dbProvider}",
  })`,
		schemaCommand:
			"npx @better-auth/cli generate --output prisma/schema.prisma",
		pushCommand: "npx prisma db push",
	},
	drizzle: {
		adapterImport: `import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";`,
		adapterSetup: (dbProvider: string) => `drizzleAdapter(db, {
    provider: "${getShortProvider(dbProvider)}",
  })`,
		schemaCommand: "npx @better-auth/cli generate --output src/lib/schema.ts",
		pushCommand: "npx drizzle-kit push",
	},
	none: {
		adapterImport: "",
		adapterSetup: (dbProvider: string) => `{
    provider: "${getShortProvider(dbProvider)}",
    url: process.env.DATABASE_URL,
  }`,
		pushCommand: "npx @better-auth/cli migrate",
	},
};

function getShortProvider(provider: string): string {
	switch (provider) {
		case "postgresql":
			return "pg";
		case "mysql":
			return "mysql";
		case "sqlite":
			return "sqlite";
		case "mongodb":
			return "mongodb";
		default:
			return provider;
	}
}

export function generateDatabaseConfig(
	database: Database,
	orm: ORM,
): { imports: string; config: string; prismaInstance?: string } {
	const dbConfig = DATABASE_CONFIGS[database];
	const ormConfig = ORM_CONFIGS[orm];

	let imports = "";
	let prismaInstance = "";

	if (orm === "prisma") {
		imports = ormConfig.adapterImport;
		prismaInstance = "\nconst prisma = new PrismaClient();\n";
	} else if (orm === "drizzle") {
		imports = ormConfig.adapterImport;
	}

	const config = ormConfig.adapterSetup(dbConfig.provider);

	return { imports, config, prismaInstance };
}

export function getDatabaseEnvVar(database: Database): EnvVar {
	const config = DATABASE_CONFIGS[database];
	return {
		name: config.envVarName,
		description: `${database.charAt(0).toUpperCase() + database.slice(1)} connection string`,
		required: true,
		example: config.connectionStringExample,
	};
}

export function getDatabaseCommands(
	orm: ORM,
): { command: string; description: string; when?: string }[] {
	const ormConfig = ORM_CONFIGS[orm];
	const commands: { command: string; description: string; when?: string }[] =
		[];

	if (ormConfig.schemaCommand) {
		commands.push({
			command: ormConfig.schemaCommand,
			description: `Generate ${orm === "prisma" ? "Prisma" : "Drizzle"} schema for auth tables`,
		});
	}

	commands.push({
		command: ormConfig.pushCommand,
		description:
			orm === "none"
				? "Run database migrations for auth tables"
				: `Push ${orm === "prisma" ? "Prisma" : "Drizzle"} schema to database`,
		when: "After setting DATABASE_URL",
	});

	return commands;
}
