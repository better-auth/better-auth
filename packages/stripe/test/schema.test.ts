import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { organization as organizationPlugin } from "better-auth/plugins";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { stripe } from "../src";
import { getSchema, organization, subscriptions, user } from "../src/schema";

describe("stripe schema indexes", () => {
	it("should define index on subscription lookup fields", () => {
		expect(subscriptions.subscription.fields.referenceId.index).toBe(true);
		expect(subscriptions.subscription.fields.stripeCustomerId.index).toBe(true);
		expect(
			subscriptions.subscription.fields.stripeSubscriptionId.index,
		).toBe(true);
	});

	it("should define index on user stripeCustomerId", () => {
		expect(user.user.fields.stripeCustomerId.index).toBe(true);
	});

	it("should define index on organization stripeCustomerId", () => {
		expect(organization.organization.fields.stripeCustomerId.index).toBe(true);
	});

	it("should return indexed fields from getSchema with subscription and organization enabled", () => {
		const schema = getSchema({
			stripeClient: {} as Stripe,
			stripeWebhookSecret: "test",
			subscription: {
				enabled: true,
				plans: [],
			},
			organization: {
				enabled: true,
			},
		});

		expect(schema.subscription?.fields.referenceId.index).toBe(true);
		expect(schema.subscription?.fields.stripeCustomerId.index).toBe(true);
		expect(schema.subscription?.fields.stripeSubscriptionId.index).toBe(true);
		expect(schema.user?.fields.stripeCustomerId.index).toBe(true);
		expect(schema.organization?.fields.stripeCustomerId.index).toBe(true);
	});

	it("should preserve indexes when custom schema is provided", () => {
		const schema = getSchema({
			stripeClient: {} as Stripe,
			stripeWebhookSecret: "test",
			subscription: {
				enabled: true,
				plans: [],
			},
			schema: {
				subscription: {
					fields: {
						plan: {
							required: false,
						},
					},
				},
			},
		});

		expect(schema.subscription?.fields.referenceId.index).toBe(true);
		expect(schema.subscription?.fields.stripeCustomerId.index).toBe(true);
		expect(schema.subscription?.fields.stripeSubscriptionId.index).toBe(true);
		expect(schema.user?.fields.stripeCustomerId.index).toBe(true);
	});

	it("should create indexes in new SQLite database via getMigrations", async () => {
		const db = new DatabaseSync(":memory:");
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			plugins: [
				organizationPlugin(),
				stripe({
					stripeClient: {} as Stripe,
					stripeWebhookSecret: "test",
					subscription: {
						enabled: true,
						plans: [],
					},
					organization: {
						enabled: true,
					},
				}),
			],
		});

		const migrations = await getMigrations(auth.options);
		await migrations.runMigrations();

		const indexes = db
			.prepare(
				"SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'",
			)
			.all() as Array<{ name: string; tbl_name: string }>;

		const indexNames = indexes.map((i) => i.name);
		expect(indexNames).toContain("subscription_referenceId_idx");
		expect(indexNames).toContain("subscription_stripeCustomerId_idx");
		expect(indexNames).toContain("subscription_stripeSubscriptionId_idx");
		expect(indexNames).toContain("user_stripeCustomerId_idx");
		expect(indexNames).toContain("organization_stripeCustomerId_idx");

		db.close();
	});

	it("should produce no migrations on an existing database that already has the tables without indexes", async () => {
		const db = new DatabaseSync(":memory:");
		const baseAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			plugins: [organizationPlugin()],
		});
		await (await getMigrations(baseAuth.options)).runMigrations();

		// Add stripe columns and subscription table without indexes (simulating an existing deployment)
		db.exec(`
			ALTER TABLE "user" ADD COLUMN "stripeCustomerId" TEXT;
			ALTER TABLE "organization" ADD COLUMN "stripeCustomerId" TEXT;
			CREATE TABLE "subscription" (
				"id" TEXT PRIMARY KEY,
				"plan" TEXT NOT NULL,
				"referenceId" TEXT NOT NULL,
				"stripeCustomerId" TEXT,
				"stripeSubscriptionId" TEXT,
				"status" TEXT NOT NULL,
				"periodStart" DATE,
				"periodEnd" DATE,
				"trialStart" DATE,
				"trialEnd" DATE,
				"cancelAtPeriodEnd" INTEGER DEFAULT 0,
				"cancelAt" DATE,
				"canceledAt" DATE,
				"endedAt" DATE,
				"seats" INTEGER,
				"billingInterval" TEXT,
				"stripeScheduleId" TEXT
			);
		`);

		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			plugins: [
				organizationPlugin(),
				stripe({
					stripeClient: {} as Stripe,
					stripeWebhookSecret: "test",
					subscription: {
						enabled: true,
						plans: [],
					},
					organization: {
						enabled: true,
					},
				}),
			],
		});

		const migrations = await getMigrations(auth.options);
		expect(migrations.toBeCreated).toHaveLength(0);
		expect(migrations.toBeAdded).toHaveLength(0);

		db.close();
	});
});
