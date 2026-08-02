import type { UIComponent } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { renderComponent } from "./render";

describe("renderComponent", () => {
	it("should hide a statically false condition before the runtime loads", () => {
		const html = renderComponent({
			tag: "div",
			when: false,
			children: ["secret"],
		});
		expect(html).toContain('data-ba-when="false"');
		expect(html).toContain("hidden");
		expect(html).toBe('<div data-ba-when="false" hidden>secret</div>');
	});

	it("should render a statically true condition visible", () => {
		const html = renderComponent({
			tag: "div",
			when: true,
			children: ["visible"],
		});
		expect(html).toBe('<div data-ba-when="true">visible</div>');
	});

	it("should serialize a bound condition to data-ba-when", () => {
		const html = renderComponent({
			tag: "div",
			when: { bind: "step", equals: "verify" },
			children: ["panel"],
		});
		expect(html).toContain(
			'data-ba-when="{&quot;bind&quot;:&quot;step&quot;,&quot;equals&quot;:&quot;verify&quot;}"',
		);
		expect(html).not.toContain("data-data-ba-when");
	});

	it("should serialize event actions to data-ba-on-*", () => {
		const component: UIComponent = {
			tag: "button",
			on: {
				click: { type: "server", id: "revoke", params: { id: "1" } },
			},
			children: ["Revoke"],
		};
		const html = renderComponent(component);
		expect(html).toContain("data-ba-on-click=");
		expect(html).not.toContain("data-data-ba-on-click");
		const match = html.match(/data-ba-on-click="([^"]*)"/);
		const decoded = JSON.parse(
			(match?.[1] ?? "")
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&amp;/g, "&"),
		);
		expect(decoded).toEqual({
			type: "server",
			id: "revoke",
			params: { id: "1" },
		});
	});

	it("should serialize bind without mangling the attribute name", () => {
		const html = renderComponent({ tag: "input", bind: "email" });
		expect(html).toContain('data-ba-bind="email"');
		expect(html).not.toContain("data-data-ba-bind");
	});
});
