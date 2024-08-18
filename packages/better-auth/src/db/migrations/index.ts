import chalk from "chalk";
import { Kysely, Migrator } from "kysely";
import ora from "ora";
import prompts from "prompts";
import { type BetterAuthOptions } from "../../types";
import { logger } from "../../utils/logger";
import { BetterAuthError } from "../../error/better-auth-error";
import { getDialect } from "..";
import { getMigrations } from "./get-migrations";

export const migrationTableName = "better_auth_migrations";
export const migrationLockTableName = "better_auth_migrations_lock";

export const migrateAll = async (
	options: BetterAuthOptions,
	{ cli }: { cli: boolean },
) => {
	const spinner = cli ? ora("preparing migration...").start() : null;
	const { migrations, noMigration, affected } = await getMigrations(
		options,
		cli,
		() => spinner?.stop(),
	);
	spinner?.stop();

	if (!noMigration && cli) {
		logger.info(chalk.bgBlack("\n🔑 The migration will affect the following:"));
		for (const key of Object.keys(affected)) {
			const i = affected[key];
			if (!i?.length) {
				continue;
			}
			logger.info(
				"->",
				chalk.magenta(i.join(", ")),
				chalk.white("fields on"),
				chalk.yellow(`${key}`),
				chalk.white("table."),
			);
		}

		const { migrate } = await prompts({
			type: "confirm",
			name: "migrate",
			message: "Are you sure you want to run migrations?",
			initial: false,
		});
		if (!migrate) {
			logger.info("Migration cancelled.");
			process.exit(0);
		}
	}
	spinner?.start("migrating...");
	const dialect = getDialect(options);
	if (!dialect) {
		if (cli) {
			logger.error("Invalid database configuration.");
			process.exit(1);
		} else {
			throw new BetterAuthError("Invalid database configuration.");
		}
	}

	const db = new Kysely({
		dialect,
	});
	const migrator = new Migrator({
		db,
		provider: {
			async getMigrations() {
				return migrations;
			},
		},
		migrationTableName,
		migrationLockTableName,
	});

	try {
		const { error, results } = await migrator.migrateToLatest();
		spinner?.stop();
		results?.forEach((it, index) => {
			if (it.status === "Error") {
				logger.error(
					`failed to execute ${it.migrationName.split("_")[1]?.split("_")[0]
					} migration`,
				);
			}
		});

		if (!results?.length && !error) {
			logger.success("🚀 No migrations to run.");
		} else {
			logger.success("🚀 migration was completed successfully!");
		}

		if (error) {
			if (cli) {
				logger.error("failed to migrate");
				logger.error(error);
				process.exit(1);
			} else {
				throw new BetterAuthError("failed to migrate");
			}
		}
		return {
			results,
			error,
		};
	} catch (e) {
		spinner?.stop();
		logger.error(e);
		throw e;
	}
};
