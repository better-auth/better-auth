import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
	motion: {
		div: ({
			children,
			initial: _initial,
			animate: _animate,
			transition: _transition,
			...props
		}: Record<string, unknown>) =>
			createElement("div", props, children as ReactNode),
	},
}));

vi.mock("@/components/landing/footer", () => ({
	default: () => createElement("div", { "data-testid": "footer" }),
}));

vi.mock("@/components/landing/halftone-bg", () => ({
	HalftoneBackground: () => createElement("div", { "data-testid": "halftone" }),
}));

import { CareersPageClient } from "./careers-client";
import type { Job } from "./careers-data";

type GemJobFixture = Job & {
	first_published_at: string;
	internal_job_id: string;
	location_type: string;
	requisition_id: string;
	departments: Array<{
		id: string;
		name: string;
		parent_id: string | null;
		child_ids: string[];
	}>;
	offices: Array<{
		id: string;
		name: string;
		location: { name: string };
		parent_id: string | null;
		child_ids: string[];
		parent_office_external_id: string | null;
		child_office_external_ids: string[];
		deleted_at: string | null;
	}>;
};

describe("CareersPageClient", () => {
	it("renders realistic Gem job data", () => {
		const jobs: GemJobFixture[] = [
			{
				id: "am9icG9zdDox",
				title: "Product Manager",
				first_published_at: "2023-09-22T20:17:34.000Z",
				internal_job_id: "job-internal-product-manager-1",
				absolute_url: "https://jobs.gem.com/test-board/job-1",
				location: { name: "New York, United States" },
				location_type: "hybrid",
				employment_type: "full_time",
				requisition_id: "R16",
				departments: [
					{ id: "dept-1", name: "Engineering", parent_id: null, child_ids: [] },
				],
				roleParagraphs: [
					"Lead product direction across the auth platform.",
					"Partner closely with engineering and design.",
				],
				offices: [
					{
						id: "office-1",
						name: "NYC",
						location: { name: "New York, United States" },
						parent_id: null,
						child_ids: [],
						parent_office_external_id: null,
						child_office_external_ids: [],
						deleted_at: null,
					},
				],
			},
			{
				id: "am9icG9zdDoy",
				title: "Backend Engineer",
				first_published_at: "2024-01-10T12:00:00.000Z",
				internal_job_id: "job-internal-backend-2",
				absolute_url: "https://jobs.gem.com/test-board/job-2",
				location: { name: "San Francisco, United States" },
				location_type: "onsite",
				employment_type: "contract",
				requisition_id: "R17",
				departments: [
					{ id: "dept-2", name: "Platform", parent_id: null, child_ids: [] },
				],
				roleParagraphs: ["Build backend APIs and platform primitives."],
				offices: [
					{
						id: "office-2",
						name: "SF",
						location: { name: "San Francisco, United States" },
						parent_id: null,
						child_ids: [],
						parent_office_external_id: null,
						child_office_external_ids: [],
						deleted_at: null,
					},
				],
			},
			{
				id: "am9icG9zdDoz",
				title: "Staff Software Engineer — TypeScript",
				first_published_at: "2024-02-15T12:00:00.000Z",
				internal_job_id: "job-internal-staff-3",
				absolute_url: "https://jobs.gem.com/test-board/job-3",
				location: { name: "New York, United States" },
				location_type: "hybrid",
				employment_type: "full_time",
				requisition_id: "R18",
				departments: [
					{ id: "dept-3", name: "Engineering", parent_id: null, child_ids: [] },
				],
				roleParagraphs: ["Drive architecture across the TypeScript platform."],
				offices: [
					{
						id: "office-3",
						name: "NYC",
						location: { name: "New York, United States" },
						parent_id: null,
						child_ids: [],
						parent_office_external_id: null,
						child_office_external_ids: [],
						deleted_at: null,
					},
				],
			},
		];

		const html = renderToStaticMarkup(
			createElement(CareersPageClient, { jobs }),
		);

		expect(html).toContain("Product Manager");
		expect(html).toContain("Backend Engineer");
		expect(html).toContain("Staff Software Engineer — TypeScript");
		expect(html).toContain("Full-time");
		expect(html).toContain("Contract");
		expect(html).toContain("New York");
		expect(html).toContain("San Francisco");
		expect(html).toContain("Engineering");
		expect(html).toContain("Platform");
		expect(html).toContain("Location");
		expect(html).toContain("Department");
		expect(html).toContain("Open roles");
		expect(html).toContain("Lead product direction across the auth platform.");
		expect(html).toContain("Partner closely with engineering and design.");
		expect(html).toContain("Build backend APIs and platform primitives.");
		expect(html).toContain(
			"Drive architecture across the TypeScript platform.",
		);
		expect(html).toContain('href="https://jobs.gem.com/test-board/job-1"');
		expect(html).toContain('target="_blank"');
		expect(html).toMatch(
			/New York<\/span>\s*<span[^>]*>Engineering<\/span>\s*<span[^>]*>2<\/span>/,
		);
		expect(html).toMatch(
			/San Francisco<\/span>\s*<span[^>]*>Platform<\/span>\s*<span[^>]*>1<\/span>/,
		);
	});
});
