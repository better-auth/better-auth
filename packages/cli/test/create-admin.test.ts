import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { expectNoTwoFactorChallenge } from "better-auth/test";
import Database from "better-sqlite3";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminAction } from "../src/commands/create-admin";
import { migrateAction } from "../src/commands/migrate";
import * as config from "../src/utils/get-config";

vi.mock("prompts", () => ({
	default: vi.fn(),
}));

describe("create-admin", () => {
	let db: Database.Database;
	let lastConsoleError = "";

	beforeEach(() => {
		lastConsoleError = "";
		vi.mocked(prompts).mockReset();
		vi.spyOn(console, "error").mockImplementation((message) => {
			lastConsoleError = String(message);
		});
		vi.spyOn(process, "exit").mockImplementation((code) => {
			if (code && Number(code) !== 0) {
				throw new Error(lastConsoleError || "process.exit(" + code + ")");
			}
			return code as never;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		db?.close();
	});

	async function setupAuth(withAdmin = true, requireEmailVerification = false) {
		db = new Database(":memory:");
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
				requireEmailVerification,
			},
			plugins: withAdmin ? [admin()] : [],
		});

		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			yes: true,
		});

		return auth;
	}

	it("creates an initial admin user that can sign in with password", async () => {
		const auth = await setupAuth(true, true);

		await createAdminAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			email: "Admin@Example.com",
			password: "secure-password",
			name: "Root Admin",
		});

		const user = db
			.prepare(
				"SELECT email, name, role, emailVerified FROM user WHERE email = ?",
			)
			.get("admin@example.com") as {
			email: string;
			name: string;
			role: string;
			emailVerified: number | boolean;
		};
		expect(user).toMatchObject({
			email: "admin@example.com",
			name: "Root Admin",
			role: "admin",
		});
		expect(Boolean(user.emailVerified)).toBe(true);

		const signIn = await auth.api.signInEmail({
			body: {
				email: "admin@example.com",
				password: "secure-password",
			},
		});
		expectNoTwoFactorChallenge(signIn);
		expect(signIn.user.email).toBe("admin@example.com");
	});

	it("uses Admin as the default name without prompting", async () => {
		await setupAuth();

		await createAdminAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			email: "admin@example.com",
			password: "secure-password",
		});

		const user = db
			.prepare("SELECT name FROM user WHERE email = ?")
			.get("admin@example.com") as { name: string };
		expect(user.name).toBe("Admin");
		expect(prompts).not.toHaveBeenCalled();
	});

	it("passes additional user data to the admin create-user API", async () => {
		await setupAuth();

		await createAdminAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			email: "admin@example.com",
			password: "secure-password",
			name: "Root Admin",
			data: JSON.stringify({ image: "https://example.com/avatar.png" }),
		});

		const user = db
			.prepare("SELECT image FROM user WHERE email = ?")
			.get("admin@example.com") as { image: string };
		expect(user.image).toBe("https://example.com/avatar.png");
	});

	it("rejects duplicate admin email addresses", async () => {
		await setupAuth();

		await createAdminAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			email: "admin@example.com",
			password: "secure-password",
			name: "Root Admin",
		});

		await expect(
			createAdminAction({
				cwd: process.cwd(),
				config: "test/auth.ts",
				email: "admin@example.com",
				password: "secure-password",
				name: "Root Admin",
				force: true,
			}),
		).rejects.toThrow(/already exists/i);
	});

	it("requires the admin plugin", async () => {
		await setupAuth(false);

		await expect(
			createAdminAction({
				cwd: process.cwd(),
				config: "test/auth.ts",
				email: "admin@example.com",
				password: "secure-password",
				name: "Root Admin",
			}),
		).rejects.toThrow(/admin plugin is required/i);
	});

	it("returns a friendly error when existing-user inspection fails", async () => {
		const adapter = {
			id: "test",
			create: vi.fn(),
			findOne: vi.fn(),
			findMany: vi.fn(),
			count: vi.fn().mockRejectedValue(new Error("missing user table")),
			update: vi.fn(),
			updateMany: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn(),
			transaction: vi.fn(async (callback: (adapter: unknown) => unknown) =>
				callback(adapter),
			),
		} as any;
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: () => adapter,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [admin()],
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);

		await expect(
			createAdminAction({
				cwd: process.cwd(),
				config: "test/auth.ts",
				email: "admin@example.com",
				password: "secure-password",
			}),
		).rejects.toThrow(/Failed to inspect existing users/);
		await expect(
			createAdminAction({
				cwd: process.cwd(),
				config: "test/auth.ts",
				email: "admin@example.com",
				password: "secure-password",
			}),
		).rejects.toThrow(/missing user table/);
	});

	it("asks for confirmation when users already exist", async () => {
		const auth = await setupAuth();
		vi.mocked(prompts).mockResolvedValueOnce({ confirmed: false });

		await auth.api.signUpEmail({
			body: {
				email: "user@example.com",
				password: "password",
				name: "Existing User",
			},
		});

		await createAdminAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			email: "admin@example.com",
			password: "secure-password",
			name: "Root Admin",
		});

		expect(prompts).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "confirm",
				name: "confirmed",
			}),
		);
		const count = db.prepare("SELECT COUNT(*) as count FROM user").get() as {
			count: number;
		};
		expect(count.count).toBe(1);
	});
});
