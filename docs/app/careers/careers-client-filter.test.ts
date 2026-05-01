// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const jobs: Job[] = [
	{
		id: "job-1",
		title: "Product Manager",
		absolute_url: "https://jobs.gem.com/test-board/job-1",
		location: { name: "New York, United States" },
		employment_type: "full_time",
		departments: [{ name: "Engineering" }],
		roleParagraphs: ["Lead product direction."],
	},
	{
		id: "job-2",
		title: "Backend Engineer",
		absolute_url: "https://jobs.gem.com/test-board/job-2",
		location: { name: "San Francisco, United States" },
		employment_type: "contract",
		departments: [{ name: "Platform" }],
		roleParagraphs: ["Build backend APIs."],
	},
	{
		id: "job-3",
		title: "Staff Software Engineer — TypeScript",
		absolute_url: "https://jobs.gem.com/test-board/job-3",
		location: { name: "New York, United States" },
		employment_type: "full_time",
		departments: [{ name: "Engineering" }],
		roleParagraphs: ["Drive TypeScript architecture."],
	},
];

describe("CareersPageClient filtering", () => {
	let container: HTMLDivElement;

	afterEach(() => {
		container?.remove();
	});

	it("filters the visible jobs by the selected location and department", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(createElement(CareersPageClient, { jobs }));
		});

		expect(container.textContent).toContain("Product Manager");
		expect(container.textContent).toContain("Backend Engineer");
		expect(container.textContent).toContain(
			"Staff Software Engineer — TypeScript",
		);

		const filterButton = container.querySelector(
			'[data-testid="filter-New York-Engineering"]',
		) as HTMLButtonElement | null;
		expect(filterButton).not.toBeNull();

		await act(async () => {
			filterButton?.click();
		});

		expect(container.textContent).toContain("Product Manager");
		expect(container.textContent).toContain(
			"Staff Software Engineer — TypeScript",
		);
		expect(container.textContent).not.toContain("Backend Engineer");
		expect(container.textContent).toContain("Showing New York / Engineering");

		await act(async () => {
			filterButton?.click();
		});

		expect(container.textContent).toContain("Product Manager");
		expect(container.textContent).toContain("Backend Engineer");
		expect(container.textContent).toContain(
			"Staff Software Engineer — TypeScript",
		);
		expect(container.textContent).not.toContain(
			"Showing New York / Engineering",
		);

		await act(async () => {
			filterButton?.click();
		});

		expect(container.textContent).toContain("Product Manager");
		expect(container.textContent).toContain(
			"Staff Software Engineer — TypeScript",
		);
		expect(container.textContent).not.toContain("Backend Engineer");
		expect(container.textContent).toContain("Showing New York / Engineering");

		const clearButton = container.querySelector(
			'[data-testid="clear-role-filter"]',
		) as HTMLButtonElement | null;
		expect(clearButton).not.toBeNull();

		await act(async () => {
			clearButton?.click();
		});

		expect(container.textContent).toContain("Product Manager");
		expect(container.textContent).toContain("Backend Engineer");
		expect(container.textContent).toContain(
			"Staff Software Engineer — TypeScript",
		);
	});
});
