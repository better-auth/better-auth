import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBAdapterMigrationPlan,
} from "@better-auth/core/db/adapter";
import { getAdapter } from "better-auth/db/adapter";
import { getMigrations, UnsafeMigrationError } from "better-auth/db/migration";
import prompts from "prompts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "../utils/get-config";
import { migrateAction } from "./migrate";

vi.mock("../utils/get-config", () => ({ getConfig: vi.fn() }));
vi.mock("better-auth/db/adapter", () => ({ getAdapter: vi.fn() }));
vi.mock("better-auth/db/migration", async (importOriginal) => ({
	...(await importOriginal<typeof import("better-auth/db/migration")>()),
	getMigrations: vi.fn(),
}));
vi.mock("@better-auth/telemetry", () => ({
	createTelemetry: vi.fn(async () => ({ publish: vi.fn() })),
	getTelemetryAuthConfig: vi.fn(async () => ({})),
}));
vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("yocto-spinner", () => ({
	default: () => {
		const spinner = { start: () => spinner, stop: vi.fn() };
		return spinner;
	},
}));

const config: BetterAuthOptions = {};
let plan: DBAdapterMigrationPlan;
let adapter: DBAdapter;

beforeEach(() => {
	plan = {
		toBeCreated: [{ table: "user", fields: { email: { type: "string" } } }],
		toBeAdded: [],
		toBeAddedIndexes: [],
		schemaProblems: [],
		runMigrations: vi.fn(async () => {}),
	};
	adapter = {
		id: "custom",
		getMigrations: vi.fn(async () => plan),
	} as unknown as DBAdapter;
	vi.mocked(getConfig).mockResolvedValue(config);
	vi.mocked(getAdapter).mockResolvedValue(adapter);
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("command exited");
	});
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function run(yes = true) {
	await expect(migrateAction({ cwd: process.cwd(), yes })).rejects.toThrow(
		"command exited",
	);
}

describe("adapter-owned migrations", () => {
	it("preserves the plan receiver when running adapter migrations", async () => {
		plan.runMigrations = vi.fn(async function (this: DBAdapterMigrationPlan) {
			expect(this.toBeCreated[0]?.table).toBe("user");
		});
		await run();
		expect(plan.runMigrations).toHaveBeenCalledOnce();
		expect(process.exit).toHaveBeenCalledWith(0);
	});

	it.each(["custom", "kysely", "prisma", "drizzle"])(
		"prefers the hook for %s adapters",
		async (id) => {
			adapter.id = id;
			await run();
			expect(adapter.getMigrations).toHaveBeenCalledWith(config);
			expect(getMigrations).not.toHaveBeenCalled();
			expect(plan.runMigrations).toHaveBeenCalledOnce();
			expect(process.exit).toHaveBeenCalledWith(0);
		},
	);

	it("uses the existing Kysely planner when no hook is provided", async () => {
		adapter.id = "kysely";
		adapter.getMigrations = undefined;
		vi.mocked(getMigrations).mockResolvedValue(
			plan as Awaited<ReturnType<typeof getMigrations>>,
		);
		await run();
		expect(getMigrations).toHaveBeenCalledWith(config);
		expect(plan.runMigrations).toHaveBeenCalledOnce();
	});

	it("still rejects adapters without migration support", async () => {
		adapter.getMigrations = undefined;
		await run();
		expect(getMigrations).not.toHaveBeenCalled();
		expect(plan.runMigrations).not.toHaveBeenCalled();
		expect(process.exit).toHaveBeenCalledWith(1);
	});

	it("does not run a plan with schema problems", async () => {
		plan.schemaProblems.push("unexpected required column");
		await run();
		expect(plan.runMigrations).not.toHaveBeenCalled();
		expect(process.exit).toHaveBeenCalledWith(1);
	});

	it("preserves unsafe-change refusal for adapter hooks", async () => {
		vi.mocked(adapter.getMigrations!).mockRejectedValue(
			new UnsafeMigrationError("unsafe change"),
		);
		await run();
		expect(plan.runMigrations).not.toHaveBeenCalled();
		expect(process.exit).toHaveBeenCalledWith(1);
	});

	it("asks for confirmation before executing the adapter plan", async () => {
		vi.mocked(prompts).mockResolvedValue({ migrate: false });
		await run(false);
		expect(prompts).toHaveBeenCalledOnce();
		expect(plan.runMigrations).not.toHaveBeenCalled();
	});

	it("does not execute an empty plan", async () => {
		plan.toBeCreated = [];
		await run();
		expect(plan.runMigrations).not.toHaveBeenCalled();
		expect(process.exit).toHaveBeenCalledWith(0);
	});
});
