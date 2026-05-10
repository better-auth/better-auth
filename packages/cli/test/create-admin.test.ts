import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
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

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
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
		expect(signIn.user.email).toBe("admin@example.com");
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
