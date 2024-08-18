import {
	type AlterTableBuilder,
	type AlterTableColumnAlteringBuilder,
	type CreateTableBuilder,
	type Kysely,
	type Migration,
	sql,
} from "kysely";
import { toColumns } from "./to-columns";
import { BetterAuthOptions } from "../../types";
import { BetterAuthError } from "../../error/better-auth-error";
import { MigrationTable } from "../../adapters/schema";
import { createKyselyAdapter, getDatabaseType } from "../../adapters/kysely";
import { FieldAttribute } from "../field";
import { migrationTableName } from ".";
import { getAuthTables } from "../../adapters/get-tables";
export const BaseModels = ["session", "account", "user"];


async function findAllMigrations(db: Kysely<any>) {
	try {
		const res = await db.selectFrom(migrationTableName).selectAll().execute();
		return res as MigrationTable[];
	} catch (e) {
		return []
	}
}

export const getMigrations = async (
	option: BetterAuthOptions,
	cli: boolean,
	interrupt?: () => void,
) => {
	const dbType = getDatabaseType(option);
	if (!dbType) {
		throw new BetterAuthError("Database type not found.");
	}
	const db = createKyselyAdapter(option);
	if (!db) {
		throw new BetterAuthError(
			"Invalid Database Configuration. Make sure your database configuration is a kysely dialect, a mysql or postgres pool or a configuration.",
		);
	}
	const migrations = await findAllMigrations(db);
	const pluginsMigrations =
		option.plugins?.map((plugin) => ({
			migrations: Object.keys(plugin.schema || {})
				.map((key) => {
					const schema = plugin.schema || {};
					// biome-ignore lint/style/noNonNullAssertion: <explanation>
					const table = schema[key]!;
					if (table?.disableMigration) {
						return;
					}
					return {
						tableName: key,
						fields: table?.fields as Record<string, FieldAttribute>,
					};
				})
				.filter((value) => value !== undefined),
			default: plugin.migrations || {},
			prefix: plugin.id,
		})) || [];

	const providerMigrations = option.providers.map((provider) => ({
		prefix: provider.id,
		migrations: Object.keys(provider.schema || {})
			.map((key) => {
				const schema = provider.schema || {};
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const table = schema[key]!;
				if (table?.disableMigration) {
					return;
				}
				return {
					tableName: key,
					fields: table?.fields as Record<string, FieldAttribute>,
				};
			})
			.filter((value) => value !== undefined),
		default: provider.migrations || {},
	}));

	const baseSchema = getAuthTables(option)

	const migrationsToRun: {
		prefix: string;
		migrations: {
			tableName: string;
			fields: Record<string, FieldAttribute>;
		}[];
		default: Record<string, Migration>;
	}[] = [
			{
				prefix: "base",
				migrations: [{
					tableName: baseSchema.user.tableName,
					fields: baseSchema.user.fields
				}, {
					tableName: baseSchema.session.tableName,
					fields: baseSchema.session.fields
				}, {
					tableName: baseSchema.account.tableName,
					fields: baseSchema.account.fields
				}],
				default: {},
			},
			...pluginsMigrations,
			...providerMigrations,
		];

	let returnedMigration: Record<string, Migration> = {};

	const affected: {
		[table in string]: string[];
	} = {};
	for (const toRun of migrationsToRun) {
		if (!toRun.migrations) {
			continue;
		}
		let pluginMigrations = {
			...toRun.default,
		};

		for (const migration of toRun.migrations) {
			const fields = migration.fields;
			const modelName = migration.tableName;
			const prefix = `${toRun.prefix}_${modelName}_`;
			const modelMigrations = migrations.filter((migration) =>
				migration.name.includes(prefix),
			);
			const isBaseAlter =
				toRun.prefix !== "base" && BaseModels.includes(modelName);

			const kyselyMigration = await getMigration({
				migrations: modelMigrations,
				fields,
				dbType,
				modelName,
				prefix,
				cli,
				interrupt,
				alter: isBaseAlter,
			});
			pluginMigrations = {
				...pluginMigrations,
				...kyselyMigration.migrations,
			};
			if (affected[modelName]) {
				affected[modelName].push(...Object.keys(kyselyMigration.affected));
			} else {
				affected[modelName] = Object.keys(kyselyMigration.affected);
			}
		}
		returnedMigration = {
			...returnedMigration,
			...pluginMigrations,
		};
	}
	const noMigration = !Object.keys(affected).filter((key) => {
		const fields = affected[key];
		return fields?.length;
	}).length;
	return {
		migrations: returnedMigration,
		affected,
		noMigration,
	};
};

function toMigrationKey(fields: Record<string, FieldAttribute>) {
	return Object.keys(fields).map(
		(it) =>
			`${it}!${fields[it]?.type[0]}!${fields[it]?.required === false ? "f" : "t"
			}`,
	);
}

export function fromMigrationKey(key: string) {
	const typeMap = {
		s: "string",
		n: "number",
		b: "boolean",
		d: "date",
	} as const;

	const [prefix, table, _migrationKey] = key.split("_");
	const migrationKey = _migrationKey?.split("-");

	if (!migrationKey) {
		throw new BetterAuthError("Corrupted Migration");
	}

	const fields: Record<string, FieldAttribute> = {};
	for (const k of migrationKey) {
		const [key, type, required] = k.split("!") as [
			string,
			"n" | "s" | "b" | "d",
			"t" | "f",
		];
		if (!key || !type || !required) {
			throw new BetterAuthError("Corrupted Migration");
		}
		fields[key] = {
			type: typeMap[type],
			required: required !== "f",
		};
	}
	if (!table || !prefix || !fields) {
		throw new BetterAuthError("Corrupted Migration");
	}

	return { fields, prefix, table };
}

/**
 * Migrations are identified through a name.
 * The name is a combination of the timestamp and the fields that are on the model with the prefix,
 * modelName and their properties.
 */
export const getMigration = async ({
	migrations,
	fields,
	dbType,
	modelName,
	prefix,
	cli,
	defaultFields: _defaultFields,
	interrupt,
	alter,
}: {
	migrations: MigrationTable[];
	fields: Record<string, FieldAttribute>;
	dbType: "sqlite" | "mysql" | "postgres";
	modelName: string;
	prefix: string;
	cli: boolean;
	defaultFields?: {
		id?: boolean;
		createdAt?: boolean;
		updatedAt?: boolean;
	};
	interrupt?: () => void;
	alter?: boolean;
}) => {
	const defaultFields = {
		id: true,
		createdAt: true,
		updatedAt: true,
		..._defaultFields,
	};
	/**
	 * We're using the fields as the migration key so that we can
	 * have multiple migrations when the user changes their
	 * schema.
	 */
	const migrationKey = toMigrationKey(fields);
	const oldMigrationKey = migrations[migrations.length - 1]?.name
		.split(prefix)[1]
		?.split("|")[0]
		?.split("-");

	let toAdd: Record<string, FieldAttribute> | null = null;
	let toUpdate: Record<string, FieldAttribute> | null = null;
	let toRemove: Record<string, FieldAttribute> | null = null;

	const typeMap = {
		s: "string",
		n: "number",
		b: "boolean",
		d: "date",
	} as const;

	for (const k of migrationKey) {
		const [key, type, required] = k.split("!") as [
			string,
			"n" | "s" | "b" | "d",
			"t" | "f",
		];
		if (!key || !type || !required) {
			throw new BetterAuthError("Corrupted Migration");
		}
		const existing = oldMigrationKey?.find((it) => it.split("!")[0] === key);
		const field = fields[key];
		if (!existing) {
			if (!toAdd) {
				toAdd = {};
			}
			toAdd[key] = {
				type: typeMap[type],
				required: required !== "f",
				...field,
			};
			continue;
		}
		const [_, oldType, oldRequired] = existing.split("!");
		if (oldType !== type || oldRequired !== required) {
			if (!toUpdate) {
				toUpdate = {};
			}
			toUpdate[key] = {
				type: typeMap[type],
				required: required !== "f",
				...field,
			};
		}
	}

	for (const k of oldMigrationKey || []) {
		const [key] = k.split("!");
		if (!key) {
			throw new BetterAuthError("Corrupted Migration");
		}
		const exists = migrationKey?.find((it) => it.split("!")[0] === key);
		if (!exists) {
			if (!toRemove) {
				toRemove = {};
			}
			toRemove[key] = {
				type: "string",
				required: true,
			};
		}
	}

	async function up(db: Kysely<any>): Promise<void> {
		let schema:
			| CreateTableBuilder<any, any>
			| AlterTableBuilder
			| AlterTableColumnAlteringBuilder;
		schema = db.schema.createTable(modelName);
		if (oldMigrationKey || alter) {
			schema = db.schema.alterTable(modelName);
		}
		if (!oldMigrationKey && !alter) {
			if (defaultFields.id) {
				schema = schema.addColumn("id", "text", (col) =>
					col.primaryKey().notNull(),
				);
			}
		}
		schema = toAdd
			? toColumns(toAdd, { dbType, builder: schema, to: "add" })
			: schema;
		schema = toUpdate
			? toColumns(toUpdate, { dbType, builder: schema, to: "update" })
			: schema;
		schema = toRemove
			? toColumns(toRemove, { dbType, builder: schema, to: "remove" })
			: schema;
		if ("execute" in schema) {
			const compiled = schema.compile();
			if (
				compiled.sql.includes("alter") &&
				compiled.sql.split(",").length > 1 &&
				dbType === "sqlite"
			) {
				/**
				 * Sqlite doesn't support multiple columns update in one alter statement.
				 * This will separate each statement and build a transaction instead.
				 *
				 * @see https://stackoverflow.com/questions/6172815/sqlite-alter-table-add-multiple-columns-in-a-single-statement
				 */
				const alterSt = compiled.sql.split(",")[0]?.split(" add column")[0];
				const compiledQ = compiled.sql
					.split(",")
					.map((q) =>
						q.startsWith("alter table") ? q : `${alterSt}${q.replace(",", "")}`,
					);
				db.transaction().execute(async (tx) => {
					for (const q of compiledQ) {
						//@ts-expect-error q shouldn't be passed as template string
						const s = sql(q).compile(tx);
						await tx.executeQuery(s);
					}
				});
				return;
			}
			await schema.execute();
		}
	}

	async function down(db: Kysely<any>): Promise<void> { }

	const latestMigration =
		toAdd || toUpdate || toRemove
			? {
				[`${Date.now()}${prefix}${migrationKey.join("-")}|`]: {
					up,
					down,
				},
			}
			: {};

	const kMigrations = migrations.reduce((acc, it) => {
		return {
			// biome-ignore lint/performance/noAccumulatingSpread: <explanation>
			...acc,
			[it.name]: {
				up: async (db: Kysely<any>) => { },
				down: async (db: Kysely<any>) => { },
			},
		};
	}, latestMigration);
	return {
		migrations: kMigrations,
		affected: {
			...toAdd,
			...toRemove,
			...toUpdate,
		},
	};
};
