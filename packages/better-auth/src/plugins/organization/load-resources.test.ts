import { describe, expect, it, beforeEach } from "vitest";
import {
	validateResourceName,
	getReservedResourceNames,
	getDefaultReservedResourceNames,
	invalidateResourceCache,
	clearAllResourceCache,
} from "./load-resources";
import type { OrganizationOptions } from "./types";

describe("load-resources utility functions", () => {
	beforeEach(() => {
		clearAllResourceCache();
	});

	describe("getDefaultReservedResourceNames", () => {
		it("should return default reserved resource names", () => {
			const reserved = getDefaultReservedResourceNames();
			expect(reserved).toEqual([
				"organization",
				"member",
				"invitation",
				"team",
				"ac",
			]);
		});
	});

	describe("getReservedResourceNames", () => {
		it("should return default reserved names when none configured", () => {
			const options: OrganizationOptions = {};
			const reserved = getReservedResourceNames(options);
			expect(reserved).toEqual([
				"organization",
				"member",
				"invitation",
				"team",
				"ac",
			]);
		});

		it("should return custom reserved names when configured", () => {
			const options: OrganizationOptions = {
				dynamicAccessControl: {
					reservedResourceNames: ["custom", "reserved"],
				},
			};
			const reserved = getReservedResourceNames(options);
			expect(reserved).toEqual(["custom", "reserved"]);
		});
	});

	describe("validateResourceName", () => {
		it("should accept valid lowercase alphanumeric names", () => {
			const options: OrganizationOptions = {};
			expect(validateResourceName("project", options)).toEqual({ valid: true });
			expect(validateResourceName("task123", options)).toEqual({
				valid: true,
			});
			expect(validateResourceName("my_resource", options)).toEqual({
				valid: true,
			});
		});

		it("should reject names with uppercase letters", () => {
			const options: OrganizationOptions = {};
			const result = validateResourceName("Project", options);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("lowercase");
		});

		it("should reject names with special characters", () => {
			const options: OrganizationOptions = {};
			const result = validateResourceName("project-name", options);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("lowercase alphanumeric");
		});

		it("should reject names with spaces", () => {
			const options: OrganizationOptions = {};
			const result = validateResourceName("my project", options);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("lowercase alphanumeric");
		});

		it("should reject empty names", () => {
			const options: OrganizationOptions = {};
			const result = validateResourceName("", options);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("between 1 and 50");
		});

		it("should reject names longer than 50 characters", () => {
			const options: OrganizationOptions = {};
			const longName = "a".repeat(51);
			const result = validateResourceName(longName, options);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("between 1 and 50");
		});

		it("should accept names up to 50 characters", () => {
			const options: OrganizationOptions = {};
			const maxLengthName = "a".repeat(50);
			const result = validateResourceName(maxLengthName, options);
			expect(result.valid).toBe(true);
		});

		it("should reject default reserved names", () => {
			const options: OrganizationOptions = {};
			const reservedNames = [
				"organization",
				"member",
				"invitation",
				"team",
				"ac",
			];

			for (const name of reservedNames) {
				const result = validateResourceName(name, options);
				expect(result.valid).toBe(false);
				expect(result.error).toContain("reserved");
			}
		});

		it("should reject custom reserved names", () => {
			const options: OrganizationOptions = {
				dynamicAccessControl: {
					reservedResourceNames: ["custom_resource", "another_one"],
				},
			};

			expect(validateResourceName("custom_resource", options).valid).toBe(
				false,
			);
			expect(validateResourceName("another_one", options).valid).toBe(false);
			expect(validateResourceName("allowed_name", options).valid).toBe(true);
		});

		it("should apply custom validation function", () => {
			const options: OrganizationOptions = {
				dynamicAccessControl: {
					resourceNameValidation: (name) => {
						if (name.startsWith("test_")) {
							return { valid: false, error: "Cannot start with test_" };
						}
						return true;
					},
				},
			};

			const result1 = validateResourceName("test_resource", options);
			expect(result1.valid).toBe(false);
			expect(result1.error).toBe("Cannot start with test_");

			const result2 = validateResourceName("valid_resource", options);
			expect(result2.valid).toBe(true);
		});

		it("should handle custom validation returning boolean", () => {
			const options: OrganizationOptions = {
				dynamicAccessControl: {
					resourceNameValidation: (name) => name.length <= 20,
				},
			};

			const result1 = validateResourceName("short", options);
			expect(result1.valid).toBe(true);

			const result2 = validateResourceName("verylongnamethatexceedstwentycharacters", options);
			expect(result2.valid).toBe(false);
			expect(result2.error).toContain("custom validation");
		});
	});

	describe("cache management", () => {
		it("should invalidate specific organization cache", () => {
			// Cache operations are tested indirectly through the main functions
			// but we can test that the functions exist and don't throw
			expect(() => invalidateResourceCache("org-123")).not.toThrow();
		});

		it("should clear all cache", () => {
			expect(() => clearAllResourceCache()).not.toThrow();
		});
	});

	describe("edge cases", () => {
		it("should handle underscores in resource names", () => {
			const options: OrganizationOptions = {};
			expect(validateResourceName("user_profile", options).valid).toBe(true);
			expect(validateResourceName("_leading_underscore", options).valid).toBe(
				true,
			);
			expect(validateResourceName("trailing_underscore_", options).valid).toBe(
				true,
			);
		});

		it("should handle numbers in resource names", () => {
			const options: OrganizationOptions = {};
			expect(validateResourceName("resource123", options).valid).toBe(true);
			expect(validateResourceName("123resource", options).valid).toBe(true);
			expect(validateResourceName("123", options).valid).toBe(true);
		});

		it("should reject mixed case even with valid characters", () => {
			const options: OrganizationOptions = {};
			expect(validateResourceName("camelCase", options).valid).toBe(false);
			expect(validateResourceName("PascalCase", options).valid).toBe(false);
			expect(validateResourceName("UPPERCASE", options).valid).toBe(false);
		});
	});
});

