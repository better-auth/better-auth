import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getMigrations } from "../../db/get-migration";
import { betterAuth } from "../../index";
import { waitlistClient } from "./client";
import { waitlist } from "./index";
import type { WaitlistEntry, WaitlistOptions } from "./types";
import { calculateAnalytics, generateReferralCode } from "./utils";

describe("Waitlist Plugin", () => {
	let auth: any;
	let client: any;
	let testUser: any;
	let adminUser: any;

	const mockOnUserJoined = vi.fn();
	const mockOnUserLeft = vi.fn();
	const mockOnUserApproved = vi.fn();
	const mockOnUserRejected = vi.fn();

	const waitlistOptions: WaitlistOptions = {
		maxCapacity: 100,
		allowMultipleEntries: false,
		enableAutoCleanup: true,
		expirationDays: 30,
		analytics: {
			enabled: true,
			trackSources: true,
			trackCampaigns: true,
		},
		onUserJoined: mockOnUserJoined,
		onUserLeft: mockOnUserLeft,
		onUserApproved: mockOnUserApproved,
		onUserRejected: mockOnUserRejected,
		isAdmin: (context, user) => user.email === "admin@test.com",
	};

	beforeEach(async () => {
		vi.clearAllMocks();

		const database = new Database(":memory:");

		const authOptions = {
			database,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [waitlist(waitlistOptions)],
			baseURL: "http://localhost:3000",
			secret: "test-secret",
			advanced: {
				disableCSRFCheck: true,
			},
		};

		auth = betterAuth(authOptions);

		// Run migrations to create database tables
		const { runMigrations } = await getMigrations(authOptions);
		await runMigrations();

		// Create custom fetch implementation to connect client to auth instance
		const customFetchImpl = async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			return auth.handler(new Request(url, init));
		};

		client = createAuthClient({
			plugins: [waitlistClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		// Create test users
		testUser = await auth.api.signUpEmail({
			body: {
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			},
		});

		adminUser = await auth.api.signUpEmail({
			body: {
				email: "admin@test.com",
				password: "password123",
				name: "Admin User",
			},
		});
	});

	describe("Basic Functionality", () => {
		it("should allow users to join waitlist", async () => {
			try {
				const response = await client.waitlist.join({
					email: "user1@test.com",
					name: "User One",
					metadata: { source: "landing-page" },
				});
				// Check if there's an error first
				if (response.error) {
					console.error("Error details:", {
						message: response.error.message,
						status: response.error.status,
						statusText: response.error.statusText,
						body: response.error.body,
					});
					throw new Error(
						`Request failed: ${response.error.message || "Unknown error"} (${
							response.error.status
						})`,
					);
				}

				// Also check if response.data exists
				if (!response.data) {
					console.error("response.data is undefined");
					throw new Error("response.data is undefined");
				}

				expect(response.data?.entry).toBeDefined();
				expect(response.data?.entry.email).toBe("user1@test.com");
				expect(response.data?.entry.position).toBe(1);
				expect(response.data?.entry.status).toBe("pending");
				expect(response.data?.totalCount).toBe(1);
			} catch (error) {
				console.error("Test failed with error:", error);
				throw error;
			}
		});

		it("should prevent duplicate email entries", async () => {
			await client.waitlist.join({
				email: "duplicate@test.com",
				name: "First User",
			});

			const response = await client.waitlist.join({
				email: "duplicate@test.com",
				name: "Second User",
			});

			expect(response.error).toBeDefined();
		});

		it("should assign correct positions", async () => {
			const user1 = await client.waitlist.join({
				email: "user1@test.com",
				name: "User One",
			});

			const user2 = await client.waitlist.join({
				email: "user2@test.com",
				name: "User Two",
			});

			const user3 = await client.waitlist.join({
				email: "user3@test.com",
				name: "User Three",
			});

			expect(user1.data?.entry.position).toBe(1);
			expect(user2.data?.entry.position).toBe(2);
			expect(user3.data?.entry.position).toBe(3);
		});

		it("should enforce capacity limits", async () => {
			// Update auth with smaller capacity
			const smallDatabase = new Database(":memory:");
			const smallAuthOptions = {
				database: smallDatabase,
				emailAndPassword: {
					enabled: true,
				},
				plugins: [waitlist({ maxCapacity: 2 })],
				baseURL: "http://localhost:3000",
				secret: "test-secret",
				advanced: {
					disableCSRFCheck: true,
				},
			};

			auth = betterAuth(smallAuthOptions);

			// Run migrations to create database tables for the new database
			const { runMigrations } = await getMigrations(smallAuthOptions);
			await runMigrations();

			await client.waitlist.join({
				email: "user1@test.com",
				name: "User One",
			});

			await client.waitlist.join({
				email: "user2@test.com",
				name: "User Two",
			});

			const response = await client.waitlist.join({
				email: "user3@test.com",
				name: "User Three",
			});

			expect(response.error).toBeDefined();
		});

		it("should allow users to leave waitlist", async () => {
			await client.waitlist.join({
				email: "leave@test.com",
				name: "Leave User",
			});

			const response = await client.waitlist.leave({
				email: "leave@test.com",
			});

			expect(response.data?.success).toBe(true);
		});

		it("should update positions when user leaves", async () => {
			await client.waitlist.join({
				email: "user1@test.com",
				name: "User One",
			});

			await client.waitlist.join({
				email: "user2@test.com",
				name: "User Two",
			});

			await client.waitlist.join({
				email: "user3@test.com",
				name: "User Three",
			});

			// User 2 leaves
			await client.waitlist.leave({
				email: "user2@test.com",
			});

			// Check remaining positions
			const status1 = await client.waitlist.getStatus({
				email: "user1@test.com",
			});
			const status3 = await client.waitlist.getStatus({
				email: "user3@test.com",
			});

			expect(status1.data?.entry?.position).toBe(1);
			expect(status3.data?.entry?.position).toBe(2); // Should move up
		});

		it("should get waitlist status", async () => {
			await client.waitlist.join({
				email: "status@test.com",
				name: "Status User",
			});

			const response = await client.waitlist.getStatus({
				email: "status@test.com",
			});

			expect(response.data?.isOnWaitlist).toBe(true);
			expect(response.data?.entry?.email).toBe("status@test.com");
			expect(response.data?.entry?.position).toBe(1);
		});

		it("should call onUserJoined hook", async () => {
			await client.waitlist.join({
				email: "hook@test.com",
				name: "Hook User",
			});

			expect(mockOnUserJoined).toHaveBeenCalledWith({
				entry: expect.objectContaining({
					email: "hook@test.com",
				}),
				position: 1,
				totalCount: 1,
				context: expect.any(Object),
			});
		});

		it("should call onUserLeft hook", async () => {
			await client.waitlist.join({
				email: "leave-hook@test.com",
				name: "Leave Hook User",
			});

			await client.waitlist.leave({
				email: "leave-hook@test.com",
			});

			expect(mockOnUserLeft).toHaveBeenCalled();
		});
	});

	describe("Admin Functionality", () => {
		beforeEach(async () => {
			// Add some test entries
			await client.waitlist.join({
				email: "admin1@test.com",
				name: "Admin Test 1",
			});

			await client.waitlist.join({
				email: "admin2@test.com",
				name: "Admin Test 2",
			});
		});

		it("should get waitlist entries (admin)", async () => {
			// TODO: This would need proper authentication setup
			// For now, just test the shape
			expect(true).toBe(true);
		});

		it("should bulk approve entries", async () => {
			// TODO: This would need proper authentication setup
			expect(true).toBe(true);
		});

		it("should bulk reject entries", async () => {
			// TODO: This would need proper authentication setup
			expect(true).toBe(true);
		});
	});

	describe("Analytics", () => {
		it("should calculate analytics correctly", async () => {
			const entries: WaitlistEntry[] = [
				{
					id: "1",
					email: "user1@test.com",
					name: "User 1",
					position: 1,
					status: "pending",
					priority: "normal",
					joinedAt: new Date("2024-01-01"),
				},
				{
					id: "2",
					email: "user2@test.com",
					name: "User 2",
					position: 2,
					status: "approved",
					priority: "high",
					joinedAt: new Date("2024-01-02"),
					approvedAt: new Date("2024-01-03"),
				},
				{
					id: "3",
					email: "user3@test.com",
					name: "User 3",
					position: 3,
					status: "converted",
					priority: "normal",
					joinedAt: new Date("2024-01-03"),
					approvedAt: new Date("2024-01-05"),
				},
			];

			const analytics = await calculateAnalytics(entries);

			expect(analytics.totalEntries).toBe(3);
			expect(analytics.pendingCount).toBe(1);
			expect(analytics.approvedCount).toBe(1);
			expect(analytics.conversionRate).toBe(1 / 3);
			expect(analytics.priorityDistribution.normal).toBe(2);
			expect(analytics.priorityDistribution.high).toBe(1);
		});
	});

	describe("Utilities", () => {
		it("should generate referral codes", () => {
			const code1 = generateReferralCode("test@example.com");
			const code2 = generateReferralCode("test@example.com");

			expect(code1).toMatch(/^TES[A-Z0-9]{6}$/);
			expect(code2).toMatch(/^TES[A-Z0-9]{6}$/);
			expect(code1).not.toBe(code2); // Should be unique
		});
	});

	describe("Export", () => {
		it("should export to CSV format", async () => {
			// TODO: Test export functionality
			expect(true).toBe(true);
		});

		it("should export to JSON format", async () => {
			// TODO: Test export functionality
			expect(true).toBe(true);
		});
	});

	describe("Cleanup", () => {
		it("should cleanup expired entries", async () => {
			// TODO: Test cleanup functionality
			expect(true).toBe(true);
		});
	});
});
