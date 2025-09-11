import { describe, beforeAll, afterAll } from "vitest";
import { prismaAdapter } from "../../prisma-adapter";
import { runJoinAdapterTest } from "../../../join-test";
import type { BetterAuthOptions } from "../../../../types";

describe("Prisma Adapter JOIN Tests", async () => {
	// Mock Prisma client to avoid needing actual database setup
	const mockPrismaClient = {
		// Store test data
		_userData: new Map(),
		_sessionData: new Map(),
		_profileData: new Map(),

		// Mock User model
		user: {
			create: async (options: any) => {
				const id = `user_${Date.now()}_${Math.random()}`;
				const data = { id, ...options.data };
				mockPrismaClient._userData.set(id, data);
				return data;
			},
			findFirst: async (options: any) => {
				for (const [id, data] of mockPrismaClient._userData) {
					if (options.where && matchesWhere(data, options.where)) {
						const result = { ...data };
						if (options.include) {
							// Handle JOIN via include
							for (const [includeName, includeOptions] of Object.entries(
								options.include,
							)) {
								if (includeName === "profile") {
									// Find profile by userId
									for (const [, profile] of mockPrismaClient._profileData) {
										if ((profile as any).userId === data.id) {
											result.profile = profile;
											break;
										}
									}
								}
							}
						}
						return result;
					}
				}
				return null;
			},
			findMany: async (options: any) => {
				const results = [];
				for (const [id, data] of mockPrismaClient._userData) {
					if (!options.where || matchesWhere(data, options.where)) {
						const result = { ...data };
						if (options.include) {
							// Handle JOIN via include
							for (const [includeName, includeOptions] of Object.entries(
								options.include,
							)) {
								if (includeName === "profile") {
									// Find profile by userId
									for (const [, profile] of mockPrismaClient._profileData) {
										if ((profile as any).userId === data.id) {
											result.profile = profile;
											break;
										}
									}
								}
							}
						}
						results.push(result);
					}
				}
				return results.slice(
					options.skip || 0,
					(options.skip || 0) + (options.take || 100),
				);
			},
			count: async (options: any) => {
				let count = 0;
				for (const [id, data] of mockPrismaClient._userData) {
					if (!options.where || matchesWhere(data, options.where)) {
						count++;
					}
				}
				return count;
			},
			update: async (options: any) => {
				for (const [id, data] of mockPrismaClient._userData) {
					if (matchesWhere(data, options.where)) {
						const updated = { ...data, ...options.data };
						mockPrismaClient._userData.set(id, updated);
						return updated;
					}
				}
				return null;
			},
			delete: async (options: any) => {
				for (const [id, data] of mockPrismaClient._userData) {
					if (matchesWhere(data, options.where)) {
						mockPrismaClient._userData.delete(id);
						return data;
					}
				}
				return null;
			},
			deleteMany: async (options: any) => {
				let count = 0;
				const toDelete = [];
				for (const [id, data] of mockPrismaClient._userData) {
					if (!options.where || matchesWhere(data, options.where)) {
						toDelete.push(id);
						count++;
					}
				}
				toDelete.forEach((id) => mockPrismaClient._userData.delete(id));
				return { count };
			},
		},

		// Mock Session model
		session: {
			create: async (options: any) => {
				const id = `session_${Date.now()}_${Math.random()}`;
				const data = { id, ...options.data };
				mockPrismaClient._sessionData.set(id, data);
				return data;
			},
			findFirst: async (options: any) => {
				for (const [id, data] of mockPrismaClient._sessionData) {
					if (options.where && matchesWhere(data, options.where)) {
						const result = { ...data };
						if (options.include) {
							// Handle JOIN via include
							for (const [includeName, includeOptions] of Object.entries(
								options.include,
							)) {
								if (includeName === "user") {
									// Find user by userId in session
									for (const [, user] of mockPrismaClient._userData) {
										if ((user as any).id === data.userId) {
											result.user = user;
											break;
										}
									}
								}
							}
						}
						return result;
					}
				}
				return null;
			},
			findMany: async (options: any) => {
				const results = [];
				for (const [id, data] of mockPrismaClient._sessionData) {
					if (!options.where || matchesWhere(data, options.where)) {
						const result = { ...data };
						if (options.include) {
							// Handle JOIN via include
							for (const [includeName, includeOptions] of Object.entries(
								options.include,
							)) {
								if (includeName === "user") {
									// Find user by userId in session
									for (const [, user] of mockPrismaClient._userData) {
										if ((user as any).id === data.userId) {
											let userData = user;
											// Handle select option to filter fields
											if (
												includeOptions &&
												typeof includeOptions === "object" &&
												(includeOptions as any).select
											) {
												userData = {};
												for (const field of Object.keys(
													(includeOptions as any).select,
												)) {
													userData[field] = user[field];
												}
											}
											result.user = userData;
											break;
										}
									}
								} else if (includeName.startsWith("user_")) {
									// Handle aliased user joins (e.g., user_info, user_contact)
									for (const [, user] of mockPrismaClient._userData) {
										if ((user as any).id === data.userId) {
											let userData = user;
											// Handle select option to filter fields
											if (
												includeOptions &&
												typeof includeOptions === "object" &&
												(includeOptions as any).select
											) {
												userData = {};
												for (const field of Object.keys(
													(includeOptions as any).select,
												)) {
													userData[field] = user[field];
												}
											}
											result[includeName] = userData;
											break;
										}
									}
								}
							}
						}
						results.push(result);
					}
				}
				return results.slice(
					options.skip || 0,
					(options.skip || 0) + (options.take || 100),
				);
			},
			count: async (options: any) => {
				let count = 0;
				for (const [id, data] of mockPrismaClient._sessionData) {
					if (!options.where || matchesWhere(data, options.where)) {
						count++;
					}
				}
				return count;
			},
			deleteMany: async (options: any) => {
				let count = 0;
				const toDelete = [];
				for (const [id, data] of mockPrismaClient._sessionData) {
					if (!options.where || matchesWhere(data, options.where)) {
						toDelete.push(id);
						count++;
					}
				}
				toDelete.forEach((id) => mockPrismaClient._sessionData.delete(id));
				return { count };
			},
		},

		// Mock Profile model
		profile: {
			create: async (options: any) => {
				const id = `profile_${Date.now()}_${Math.random()}`;
				const data = { id, ...options.data };
				mockPrismaClient._profileData.set(id, data);
				return data;
			},
			findFirst: async (options: any) => {
				for (const [id, data] of mockPrismaClient._profileData) {
					if (options.where && matchesWhere(data, options.where)) {
						return data;
					}
				}
				return null;
			},
			findMany: async (options: any) => {
				const results = [];
				for (const [id, data] of mockPrismaClient._profileData) {
					if (!options.where || matchesWhere(data, options.where)) {
						results.push(data);
					}
				}
				return results.slice(
					options.skip || 0,
					(options.skip || 0) + (options.take || 100),
				);
			},
			deleteMany: async (options: any) => {
				let count = 0;
				const toDelete = [];
				for (const [id, data] of mockPrismaClient._profileData) {
					if (!options.where || matchesWhere(data, options.where)) {
						toDelete.push(id);
						count++;
					}
				}
				toDelete.forEach((id) => mockPrismaClient._profileData.delete(id));
				return { count };
			},
		},

		$disconnect: async () => {
			// No-op for mock
		},
	};

	// Helper function to match Prisma where clauses
	function matchesWhere(data: any, where: any): boolean {
		if (!where) return true;

		for (const [key, value] of Object.entries(where)) {
			if (key === "AND") {
				if (!Array.isArray(value)) return false;
				for (const condition of value) {
					if (!matchesWhere(data, condition)) return false;
				}
			} else if (key === "OR") {
				if (!Array.isArray(value)) return false;
				let matchFound = false;
				for (const condition of value) {
					if (matchesWhere(data, condition)) {
						matchFound = true;
						break;
					}
				}
				if (!matchFound) return false;
			} else {
				// Simple field match
				if (typeof value === "object" && value !== null) {
					// Handle operators like { not: "value" }, { in: [values] }, etc.
					for (const [op, opValue] of Object.entries(value)) {
						if (op === "not" && data[key] === opValue) return false;
						if (
							op === "in" &&
							Array.isArray(opValue) &&
							!opValue.includes(data[key])
						)
							return false;
						// Add more operators as needed
					}
				} else {
					// Direct equality
					if (data[key] !== value) return false;
				}
			}
		}
		return true;
	}

	const testOptions = (): BetterAuthOptions =>
		({
			user: {
				fields: {
					email: "email",
				},
			},
			session: {
				fields: {
					token: "token",
				},
			},
			plugins: [],
		}) satisfies BetterAuthOptions;

	beforeAll(async () => {
		// Clear mock data
		mockPrismaClient._userData.clear();
		mockPrismaClient._sessionData.clear();
		mockPrismaClient._profileData.clear();
		console.log("Mock Prisma client initialized");
	});

	afterAll(async () => {
		// Clean up mock data
		try {
			mockPrismaClient._profileData.clear();
			mockPrismaClient._sessionData.clear();
			mockPrismaClient._userData.clear();
		} catch (error) {
			console.warn("Could not clean up test data:", error);
		}

		// Disconnect (no-op for mock)
		await mockPrismaClient.$disconnect();
	});

	await runJoinAdapterTest({
		testPrefix: "Prisma JOIN",
		getAdapter: async (customOptions = {}) => {
			const options = { ...testOptions(), ...customOptions };
			const adapter = prismaAdapter(mockPrismaClient as any, {
				provider: "sqlite",
			});
			return adapter(options);
		},
		tableNames: {
			user: "user",
			session: "session",
		},
		fieldMappings: {
			userEmail: "email",
			sessionToken: "token",
		},
	});
});
