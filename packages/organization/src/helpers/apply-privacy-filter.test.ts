import { describe, expect, it } from "vitest";
import type { ResolvedPrivacyOptions } from "../types";
import {
	applyInvitationPrivacyFilter,
	applyMemberPrivacyFilter,
} from "./apply-privacy-filter";

describe("applyMemberPrivacyFilter", () => {
	const disabledPrivacy: ResolvedPrivacyOptions = {
		enabled: false,
		hiddenMemberFields: [],
		hiddenInvitationFields: [],
	};

	const emailOnlyPrivacy: ResolvedPrivacyOptions = {
		enabled: true,
		hiddenMemberFields: ["email"],
		hiddenInvitationFields: ["email"],
	};

	const allFieldsPrivacy: ResolvedPrivacyOptions = {
		enabled: true,
		hiddenMemberFields: ["email", "name", "image"],
		hiddenInvitationFields: ["email"],
	};

	const emptyFieldsPrivacy: ResolvedPrivacyOptions = {
		enabled: true,
		hiddenMemberFields: [],
		hiddenInvitationFields: [],
	};

	it("should return data unchanged when privacy is disabled", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: "https://example.com/image.jpg",
		};

		const result = applyMemberPrivacyFilter(data, disabledPrivacy);

		expect(result).toEqual(data);
		expect(result.email).toBe("test@example.com");
		expect(result.name).toBe("Test User");
		expect(result.image).toBe("https://example.com/image.jpg");
	});

	it("should return data unchanged when hiddenMemberFields is empty", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: "https://example.com/image.jpg",
		};

		const result = applyMemberPrivacyFilter(data, emptyFieldsPrivacy);

		expect(result).toEqual(data);
		expect(result.email).toBe("test@example.com");
	});

	it("should hide email when privacy is enabled with email field", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: "https://example.com/image.jpg",
		};

		const result = applyMemberPrivacyFilter(data, emailOnlyPrivacy);

		expect(result.id).toBe("user-1");
		expect(result.name).toBe("Test User");
		expect(result.image).toBe("https://example.com/image.jpg");
		expect("email" in result).toBe(false);
	});

	it("should hide all specified fields when privacy is enabled", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: "https://example.com/image.jpg",
		};

		const result = applyMemberPrivacyFilter(data, allFieldsPrivacy);

		expect(result.id).toBe("user-1");
		expect("email" in result).toBe(false);
		expect("name" in result).toBe(false);
		expect("image" in result).toBe(false);
	});

	it("should handle data with null image", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: null,
		};

		const result = applyMemberPrivacyFilter(data, emailOnlyPrivacy);

		expect(result.id).toBe("user-1");
		expect(result.name).toBe("Test User");
		expect(result.image).toBeNull();
		expect("email" in result).toBe(false);
	});

	it("should handle data with null name", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: null,
			image: "https://example.com/image.jpg",
		};

		const result = applyMemberPrivacyFilter(data, emailOnlyPrivacy);

		expect(result.id).toBe("user-1");
		expect(result.name).toBeNull();
		expect(result.image).toBe("https://example.com/image.jpg");
		expect("email" in result).toBe(false);
	});

	it("should not mutate the original data object", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: "https://example.com/image.jpg",
		};

		applyMemberPrivacyFilter(data, emailOnlyPrivacy);

		expect(data.email).toBe("test@example.com");
	});

	it("should handle missing optional fields gracefully", () => {
		const data = {
			id: "user-1",
		} as {
			id: string;
			email?: string;
			name?: string | null;
			image?: string | null;
		};

		const result = applyMemberPrivacyFilter(data, emailOnlyPrivacy);

		expect(result.id).toBe("user-1");
		expect("email" in result).toBe(false);
	});

	it("should preserve additional fields not in the privacy filter", () => {
		const data = {
			id: "user-1",
			email: "test@example.com",
			name: "Test User",
			image: "https://example.com/image.jpg",
			customField: "custom-value",
		} as {
			id: string;
			email: string;
			name: string;
			image: string;
			customField: string;
		};

		const result = applyMemberPrivacyFilter(data, emailOnlyPrivacy);

		expect(result.id).toBe("user-1");
		expect((result as typeof data).customField).toBe("custom-value");
		expect("email" in result).toBe(false);
	});
});

describe("applyInvitationPrivacyFilter", () => {
	const disabledPrivacy: ResolvedPrivacyOptions = {
		enabled: false,
		hiddenMemberFields: [],
		hiddenInvitationFields: [],
	};

	const emailPrivacy: ResolvedPrivacyOptions = {
		enabled: true,
		hiddenMemberFields: ["email"],
		hiddenInvitationFields: ["email"],
	};

	const emptyInvitationFieldsPrivacy: ResolvedPrivacyOptions = {
		enabled: true,
		hiddenMemberFields: ["email"],
		hiddenInvitationFields: [],
	};

	it("should return null when input is null", () => {
		const result = applyInvitationPrivacyFilter(null, emailPrivacy);

		expect(result).toBeNull();
	});

	it("should return data unchanged when privacy is disabled", () => {
		const data = {
			id: "invitation-1",
			email: "invitee@example.com",
			role: "member",
			status: "pending",
			organizationId: "org-1",
		};

		const result = applyInvitationPrivacyFilter(data, disabledPrivacy);

		expect(result).toEqual(data);
		expect(result.email).toBe("invitee@example.com");
	});

	it("should return data unchanged when hiddenInvitationFields is empty", () => {
		const data = {
			id: "invitation-1",
			email: "invitee@example.com",
			role: "member",
			status: "pending",
		};

		const result = applyInvitationPrivacyFilter(
			data,
			emptyInvitationFieldsPrivacy,
		);

		expect(result).toEqual(data);
		expect(result.email).toBe("invitee@example.com");
	});

	it("should hide email when privacy is enabled", () => {
		const data = {
			id: "invitation-1",
			email: "invitee@example.com",
			role: "member",
			status: "pending",
			organizationId: "org-1",
		};

		const result = applyInvitationPrivacyFilter(data, emailPrivacy);

		expect(result.id).toBe("invitation-1");
		expect(result.role).toBe("member");
		expect(result.status).toBe("pending");
		expect(result.organizationId).toBe("org-1");
		expect("email" in result).toBe(false);
	});

	it("should not mutate the original data object", () => {
		const data = {
			id: "invitation-1",
			email: "invitee@example.com",
			role: "member",
		};

		applyInvitationPrivacyFilter(data, emailPrivacy);

		expect(data.email).toBe("invitee@example.com");
	});

	it("should handle invitation without email field", () => {
		const data = {
			id: "invitation-1",
			role: "member",
			status: "pending",
		} as { id: string; role: string; status: string; email?: string };

		const result = applyInvitationPrivacyFilter(data, emailPrivacy);

		expect(result.id).toBe("invitation-1");
		expect(result.role).toBe("member");
		expect("email" in result).toBe(false);
	});

	it("should preserve additional fields not in the privacy filter", () => {
		const data = {
			id: "invitation-1",
			email: "invitee@example.com",
			role: "member",
			status: "pending",
			expiresAt: new Date("2025-01-01"),
			createdAt: new Date("2024-01-01"),
			inviterId: "user-1",
		};

		const result = applyInvitationPrivacyFilter(data, emailPrivacy);

		expect(result.id).toBe("invitation-1");
		expect(result.role).toBe("member");
		expect(result.status).toBe("pending");
		expect(result.expiresAt).toEqual(new Date("2025-01-01"));
		expect(result.createdAt).toEqual(new Date("2024-01-01"));
		expect(result.inviterId).toBe("user-1");
		expect("email" in result).toBe(false);
	});
});
