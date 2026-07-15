import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import { Hono } from "hono";
import { createDrizzle } from "./db";

interface CloudflareBindings {
	DB: D1Database;
}

const ATOMIC_PROVISIONING_CONFLICT_ACCOUNT_ID =
	"atomic-provisioning-existing-account";

const createDrizzleAuth = (env: CloudflareBindings) =>
	betterAuth({
		baseURL: "http://localhost:4000",
		database: drizzleAdapter(createDrizzle(env.DB), {
			provider: "sqlite",
			transaction: false,
		}),
		emailAndPassword: {
			enabled: true,
		},
		logger: {
			level: "debug",
		},
		plugins: [jwt(), sso()],
	});

const createKyselyAuth = (env: CloudflareBindings) =>
	betterAuth({
		baseURL: "http://localhost:4000",
		basePath: "/api/kysely-auth",
		database: env.DB,
		user: {
			fields: {
				emailVerified: "email_verified",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		logger: {
			level: "debug",
		},
	});

const createAtomicProvisioningAuth = (env: CloudflareBindings) =>
	betterAuth({
		baseURL: "http://localhost:4000",
		basePath: "/api/atomic-provisioning",
		database: drizzleAdapter(createDrizzle(env.DB), {
			provider: "sqlite",
			transaction: false,
		}),
		emailAndPassword: {
			enabled: true,
		},
		databaseHooks: {
			account: {
				create: {
					async before(account) {
						return {
							data: {
								...account,
								id: ATOMIC_PROVISIONING_CONFLICT_ACCOUNT_ID,
							},
						};
					},
				},
			},
		},
		logger: {
			level: "error",
		},
	});

type AtomicProbeAuth =
	| ReturnType<typeof createDrizzleAuth>
	| ReturnType<typeof createKyselyAuth>;

function createProbeUser(id: string, email: string, name: string, now: Date) {
	return {
		id,
		name,
		email,
		emailVerified: false,
		createdAt: now,
		updatedAt: now,
	};
}

async function probeAtomicWriteResults(auth: AtomicProbeAuth, probeId: string) {
	const adapter = (await auth.$context).adapter;
	if (!adapter.commitAtomicWrites) {
		return {
			supported: false,
			resultsAligned: false,
			finalStateCorrect: false,
		};
	}

	const now = new Date();
	const primaryUser = createProbeUser(
		`${probeId}-primary`,
		`${probeId}-primary@example.com`,
		"Primary batch user",
		now,
	);
	const deletedUser = createProbeUser(
		`${probeId}-deleted`,
		`${probeId}-deleted@example.com`,
		"Deleted batch user",
		now,
	);
	const firstStaleUser = createProbeUser(
		`${probeId}-stale-1`,
		`${probeId}-stale-1@example.com`,
		"Stale batch user",
		now,
	);
	const secondStaleUser = createProbeUser(
		`${probeId}-stale-2`,
		`${probeId}-stale-2@example.com`,
		"Stale batch user",
		now,
	);
	const updatedName = "Updated batch user";

	const results = await adapter.commitAtomicWrites([
		{
			type: "create",
			model: "user",
			forceAllowId: true,
			data: primaryUser,
		},
		{
			type: "update",
			model: "user",
			where: [{ field: "id", value: primaryUser.id }],
			update: { name: updatedName },
		},
		{
			type: "create",
			model: "user",
			forceAllowId: true,
			data: deletedUser,
		},
		{
			type: "delete",
			model: "user",
			where: [{ field: "id", value: deletedUser.id }],
		},
		{
			type: "create",
			model: "user",
			forceAllowId: true,
			data: firstStaleUser,
		},
		{
			type: "create",
			model: "user",
			forceAllowId: true,
			data: secondStaleUser,
		},
		{
			type: "deleteMany",
			model: "user",
			where: [{ field: "name", value: "Stale batch user" }],
		},
	]);

	const resultTypes = results.map((result) => result.type);
	const createdRecord = results[0];
	const updatedRecord = results[1];
	const deleteManyResult = results[6];
	const storedPrimaryUser = await adapter.findOne<{
		id: string;
		name: string;
	}>({
		model: "user",
		where: [{ field: "id", value: primaryUser.id }],
	});
	const storedDeletedUser = await adapter.findOne({
		model: "user",
		where: [{ field: "id", value: deletedUser.id }],
	});
	const storedFirstStaleUser = await adapter.findOne({
		model: "user",
		where: [{ field: "id", value: firstStaleUser.id }],
	});
	const storedSecondStaleUser = await adapter.findOne({
		model: "user",
		where: [{ field: "id", value: secondStaleUser.id }],
	});

	return {
		supported: true,
		resultsAligned:
			resultTypes.join(",") ===
				"create,update,create,delete,create,create,deleteMany" &&
			createdRecord?.type === "create" &&
			createdRecord.record.id === primaryUser.id &&
			updatedRecord?.type === "update" &&
			updatedRecord.record?.name === updatedName &&
			deleteManyResult?.type === "deleteMany" &&
			deleteManyResult.deletedCount === 2,
		finalStateCorrect:
			storedPrimaryUser?.name === updatedName &&
			storedDeletedUser === null &&
			storedFirstStaleUser === null &&
			storedSecondStaleUser === null,
	};
}

async function probeAtomicWriteRollback(
	auth: AtomicProbeAuth,
	probeId: string,
) {
	const adapter = (await auth.$context).adapter;
	if (!adapter.commitAtomicWrites) {
		return {
			supported: false,
			batchRejected: false,
			prefixWriteRolledBack: false,
		};
	}

	const firstUserId = `${probeId}-first`;
	const duplicateEmail = `${probeId}@example.com`;
	const now = new Date();
	let batchRejected = false;

	try {
		await adapter.commitAtomicWrites([
			{
				type: "create",
				model: "user",
				forceAllowId: true,
				data: {
					id: firstUserId,
					name: "First batch user",
					email: duplicateEmail,
					emailVerified: false,
					createdAt: now,
					updatedAt: now,
				},
			},
			{
				type: "create",
				model: "user",
				forceAllowId: true,
				data: {
					id: `${probeId}-second`,
					name: "Conflicting batch user",
					email: duplicateEmail,
					emailVerified: false,
					createdAt: now,
					updatedAt: now,
				},
			},
		]);
	} catch {
		batchRejected = true;
	}

	const prefixWrite = await adapter.findOne({
		model: "user",
		where: [{ field: "id", value: firstUserId }],
	});

	return {
		supported: true,
		batchRejected,
		prefixWriteRolledBack: prefixWrite === null,
	};
}

const app = new Hono<{
	Bindings: CloudflareBindings;
}>();

app.on(["POST", "GET"], "/api/auth/*", (c) =>
	createDrizzleAuth(c.env).handler(c.req.raw),
);
app.on(["POST", "GET"], "/api/kysely-auth/*", (c) =>
	createKyselyAuth(c.env).handler(c.req.raw),
);
app.on(["POST", "GET"], "/api/atomic-provisioning/*", (c) =>
	createAtomicProvisioningAuth(c.env).handler(c.req.raw),
);

app.post("/test/atomic-provisioning/setup", async (c) => {
	const adapter = (await createAtomicProvisioningAuth(c.env).$context).adapter;
	const existingAccount = await adapter.findOne({
		model: "account",
		where: [{ field: "id", value: ATOMIC_PROVISIONING_CONFLICT_ACCOUNT_ID }],
	});
	if (!existingAccount) {
		const now = new Date();
		const userId = "atomic-provisioning-existing-user";
		const identityId = "atomic-provisioning-existing-identity";
		await adapter.create({
			model: "user",
			data: {
				id: userId,
				name: "Existing provisioning user",
				email: "atomic-provisioning-existing@example.com",
				emailVerified: false,
				createdAt: now,
				updatedAt: now,
			},
			forceAllowId: true,
		});
		await adapter.create({
			model: "identity",
			data: {
				id: identityId,
				userId,
				issuer: "local:atomic-provisioning-fixture",
				providerAccountId: userId,
				createdAt: now,
				updatedAt: now,
			},
			forceAllowId: true,
		});
		await adapter.create({
			model: "account",
			data: {
				id: ATOMIC_PROVISIONING_CONFLICT_ACCOUNT_ID,
				identityId,
				providerId: "atomic-provisioning-fixture",
				providerInstanceId: "atomic-provisioning-fixture",
				createdAt: now,
				updatedAt: now,
			},
			forceAllowId: true,
		});
	}
	return c.json({ ready: true });
});

app.get("/test/atomic-provisioning/status", async (c) => {
	const email = c.req.query("email");
	if (!email) return c.json({ error: "email is required" }, 400);
	const internalAdapter = (await createAtomicProvisioningAuth(c.env).$context)
		.internalAdapter;
	const user = await internalAdapter.findUserByEmail(email);
	return c.json({ prefixWriteRolledBack: user === null });
});

app.post("/test/atomic-writes/drizzle", async (c) =>
	c.json(
		await probeAtomicWriteRollback(
			createDrizzleAuth(c.env),
			`drizzle-${crypto.randomUUID()}`,
		),
	),
);

app.post("/test/atomic-writes/kysely", async (c) =>
	c.json(
		await probeAtomicWriteRollback(
			createKyselyAuth(c.env),
			`kysely-${crypto.randomUUID()}`,
		),
	),
);

app.post("/test/atomic-writes/drizzle/results", async (c) =>
	c.json(
		await probeAtomicWriteResults(
			createDrizzleAuth(c.env),
			`drizzle-results-${crypto.randomUUID()}`,
		),
	),
);

app.post("/test/atomic-writes/kysely/results", async (c) =>
	c.json(
		await probeAtomicWriteResults(
			createKyselyAuth(c.env),
			`kysely-results-${crypto.randomUUID()}`,
		),
	),
);

app.get("/", async (c) => {
	const session = await createDrizzleAuth(c.env).api.getSession({
		headers: c.req.raw.headers,
	});
	if (session) return c.text("Hello " + session.user.name);
	return c.text("Not logged in");
});

export default app satisfies ExportedHandler<CloudflareBindings>;
