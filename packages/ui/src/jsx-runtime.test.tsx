/** @jsxImportSource @better-auth/ui */

import { describe, expect, it } from "vitest";
import {
	Button,
	backgrounds,
	Card,
	createRoute,
	Dialog,
	effects,
	Form,
	Input,
	routes,
} from ".";

describe("jsx runtime", () => {
	it("compiles JSX to UIComponent IR", () => {
		const tree = (
			<Card>
				<Form
					action={routes.signUp.email}
					success={effects.toast({
						level: "success",
						message: "Created",
					})}
				>
					<Input name="email" label="Email" />
					<Button type="submit">Sign up</Button>
				</Form>
			</Card>
		);

		expect(tree).toMatchObject({
			tag: "card",
			children: [
				{
					tag: "form",
					props: {
						action: "/sign-up/email",
						method: "post",
						"data-ba-action-kind": "auth-route",
					},
				},
			],
		});
	});

	it("creates route descriptors and staged flow effects", () => {
		const tree = (
			<Form
				action={createRoute({
					path: "/custom/action",
					method: "POST",
				})}
				success={effects.show("next-panel")}
			>
				<Button type="submit">Continue</Button>
			</Form>
		);

		expect(tree).toMatchObject({
			tag: "form",
			props: {
				action: "/custom/action",
				method: "post",
				"data-ba-action-kind": "auth-route",
				"data-ba-success-effects": JSON.stringify([
					{
						type: "show",
						target: "next-panel",
					},
				]),
			},
		});
	});

	it("compiles dialogs to modal components", () => {
		const tree = (
			<Dialog
				id="two-factor-dialog"
				title="Two-factor"
				description="Verify code"
			>
				<Form success={effects.closeDialog("two-factor-dialog")}>
					<Input name="code" label="Code" />
					<Button type="submit">Verify</Button>
				</Form>
			</Dialog>
		);

		expect(tree).toMatchObject({
			tag: "modal",
			props: {
				id: "two-factor-dialog",
				hidden: true,
			},
			children: [
				{
					tag: "div",
					props: {
						class: "ba-modal-panel",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "two-factor-dialog-title",
						"aria-describedby": "two-factor-dialog-description",
					},
					children: [
						{
							tag: "button",
							props: {
								"data-ba-dialog-close": "two-factor-dialog",
							},
						},
						{
							tag: "h2",
							props: {
								id: "two-factor-dialog-title",
							},
						},
						{
							tag: "p",
							props: {
								id: "two-factor-dialog-description",
							},
						},
						{
							tag: "form",
						},
					],
				},
			],
		});
	});

	it("exports UI background presets", () => {
		expect(backgrounds.blank).toBe("");
		expect(backgrounds.squaredGrid).toContain(
			'data-ba-background="squared-grid"',
		);
		expect(backgrounds.squaredGrid).toContain("background-size:3.5rem 3.5rem");
		expect(backgrounds.squaredGrid).toContain(
			"radial-gradient(circle at center",
		);
		expect(backgrounds.squaredGrid).toContain(
			"color-mix(in srgb,currentColor 50%,transparent)",
		);
		expect(backgrounds.dotGrid).toContain('data-ba-background="dot-grid"');
		expect(backgrounds.dotGrid).toContain("radial-gradient(circle");
		expect(backgrounds.dotGrid).toContain("currentColor");
		expect(backgrounds.dotGrid).toContain(
			"color-mix(in srgb,currentColor 70%,transparent)",
		);
	});
});
