import { describe, expect, it } from "vitest";
import { resolveOrgOptions } from "./resolve-org-options";

describe("resolveOrgOptions", () => {
	describe("privacy options", () => {
		it("should disable privacy by default when not specified", () => {
			const options = resolveOrgOptions({});

			expect(options.privacy.enabled).toBe(false);
			expect(options.privacy.hiddenMemberFields).toEqual([]);
			expect(options.privacy.hiddenInvitationFields).toEqual([]);
		});

		it("should disable privacy when set to false", () => {
			const options = resolveOrgOptions({ privacy: false });

			expect(options.privacy.enabled).toBe(false);
			expect(options.privacy.hiddenMemberFields).toEqual([]);
			expect(options.privacy.hiddenInvitationFields).toEqual([]);
		});

		it("should disable privacy when set to undefined", () => {
			const options = resolveOrgOptions({ privacy: undefined });

			expect(options.privacy.enabled).toBe(false);
			expect(options.privacy.hiddenMemberFields).toEqual([]);
			expect(options.privacy.hiddenInvitationFields).toEqual([]);
		});

		it("should enable privacy with defaults when set to true", () => {
			const options = resolveOrgOptions({ privacy: true });

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual(["email"]);
			expect(options.privacy.hiddenInvitationFields).toEqual(["email"]);
		});

		it("should use custom hiddenMemberFields when provided", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenMemberFields: ["email", "image"],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual(["email", "image"]);
			expect(options.privacy.hiddenInvitationFields).toEqual(["email"]);
		});

		it("should use custom hiddenInvitationFields when provided", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenInvitationFields: [],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual(["email"]);
			expect(options.privacy.hiddenInvitationFields).toEqual([]);
		});

		it("should use custom fields for both when provided", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenMemberFields: ["email", "name", "image"],
					hiddenInvitationFields: [],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual([
				"email",
				"name",
				"image",
			]);
			expect(options.privacy.hiddenInvitationFields).toEqual([]);
		});

		it("should enable privacy with empty hiddenMemberFields", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenMemberFields: [],
					hiddenInvitationFields: ["email"],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual([]);
			expect(options.privacy.hiddenInvitationFields).toEqual(["email"]);
		});

		it("should enable privacy with empty arrays for both fields", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenMemberFields: [],
					hiddenInvitationFields: [],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual([]);
			expect(options.privacy.hiddenInvitationFields).toEqual([]);
		});

		it("should default hiddenMemberFields when only hiddenInvitationFields is provided", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenInvitationFields: ["email"],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual(["email"]);
			expect(options.privacy.hiddenInvitationFields).toEqual(["email"]);
		});

		it("should default hiddenInvitationFields when only hiddenMemberFields is provided", () => {
			const options = resolveOrgOptions({
				privacy: {
					hiddenMemberFields: ["name"],
				},
			});

			expect(options.privacy.enabled).toBe(true);
			expect(options.privacy.hiddenMemberFields).toEqual(["name"]);
			expect(options.privacy.hiddenInvitationFields).toEqual(["email"]);
		});
	});

	describe("other options defaults", () => {
		it("should set default creator role", () => {
			const options = resolveOrgOptions({});

			expect(options.creatorRole).toBe("owner");
		});

		it("should set default disableSlugs", () => {
			const options = resolveOrgOptions({});

			expect(options.disableSlugs).toBe(false);
		});

		it("should set default defaultOrganizationIdField", () => {
			const options = resolveOrgOptions({});

			expect(options.defaultOrganizationIdField).toBe("id");
		});

		it("should set default invitationExpiresIn", () => {
			const options = resolveOrgOptions({});

			expect(options.invitationExpiresIn).toBe(60 * 60 * 48);
		});

		it("should respect custom creatorRole", () => {
			const options = resolveOrgOptions({ creatorRole: "admin" });

			expect(options.creatorRole).toBe("admin");
		});

		it("should respect custom disableSlugs", () => {
			const options = resolveOrgOptions({ disableSlugs: true });

			expect(options.disableSlugs).toBe(true);
		});
	});

	describe("validation", () => {
		it("should throw error when disableSlugs is true and defaultOrganizationIdField is slug", () => {
			expect(() =>
				resolveOrgOptions({
					disableSlugs: true,
					defaultOrganizationIdField: "slug",
				}),
			).toThrow(
				"[Organization Plugin] Cannot use `slug` as the `defaultOrganizationIdField` when slugs are disabled",
			);
		});

		it("should not throw when disableSlugs is true and defaultOrganizationIdField is id", () => {
			expect(() =>
				resolveOrgOptions({
					disableSlugs: true,
					defaultOrganizationIdField: "id",
				}),
			).not.toThrow();
		});
	});
});
