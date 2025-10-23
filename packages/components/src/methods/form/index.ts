import type { FormPlugin } from "./types";
import { createElement as h } from "../../utils";
import type { Element } from "../../hast";
import { specialFields } from "./types";
import type {
	Field,
	fieldTypes,
	Options,
	OTPSpecialInfo,
	SelectSpecialInfo,
} from "./types";

function getFieldElement(
	field: Field<(typeof fieldTypes)[number]>,
	plugins: FormPlugin[],
): Element<true> | Element<false> {
	const before = plugins
		.filter((p) => p.location.location === "before")
		.map((p) => {
			if (!p.node.element) throw new Error();
			return p.node.element;
		});
	const after = plugins
		.filter((p) => p.location.location === "after")
		.map((p) => {
			if (!p.node.element) throw new Error();
			return p.node.element;
		});
	const element = plugins
		.filter((p) => p.location.location === "element")
		.map((p) => {
			if (!p.node.element) throw new Error();
			return p.node.element;
		});

	if (field.field in specialFields) {
		return h("div", {}, [
			...before,
			element.length > 0
				? element[element.length - 1]!
				: h(
						field.field,
						{ ...(field.props ?? {}), id: field.id },
						(field.extra!.options ?? []).map((o) => {
							if (field.field === "otp") {
								const g = o as OTPSpecialInfo["options"][number];
								return h(
									g.type === "group"
										? specialFields["otpGroup"]
										: specialFields["otpSeparator"],
									{
										...(g.props ?? {}),
										id: g.id,
									},
									g.slots?.map((s, i) => {
										return h(
											specialFields["otpSlot"],
											{
												...(s.props ?? {}),
												id: s.id,
												index: s.id || i,
											},
											[],
										);
									}),
								);
							} else if (field.field === "select") {
								const g = o as SelectSpecialInfo["options"][number];
								if (g.type === "separator") {
									return h(
										specialFields.selectSeparator,
										{
											...(field.extra?.props?.separator ?? {}),
											...(o.props ?? {}),
											id: o.id,
										},
										[],
									);
								} else if (g.type === "group") {
									return h(
										specialFields.selectGroup,
										{
											...(field.extra?.props?.group ?? {}),
											...(g.props ?? {}),
											id: o.id,
										},
										g.items!.map((o) => {
											if (o.type === "separator") {
												return h(
													specialFields.selectSeparator,
													{
														...(field.extra?.props?.group?.separator ?? {}),
														...(o.props ?? {}),
														id: o.id,
													},
													[],
												);
											} else {
												return h(
													specialFields.selectItem,
													{
														...(field.extra?.props?.group?.item ?? {}),
														...(o.props ?? {}),
														id: o.id,
														value: o.id,
													},
													[],
												);
											}
										}),
									);
								} else {
									return h(
										specialFields.selectItem,
										{
											...(field.extra?.props?.item ?? {}),
											...(o.props ?? {}),
											id: o.id,
											value: o.id,
										},
										[],
									);
								}
							}

							return h(
								specialFields[field.field as keyof typeof specialFields],
								{
									...(field.extra?.props ?? {}),
									...(o.props ?? {}),
									id: o.id,
									value: o.id,
								},
								[],
							);
						}),
						true,
					),
			...after,
		]);
	} else {
		return h("div", {}, [
			...before,
			element.length > 0
				? element[element.length - 1]!
				: h(field.field, { ...(field.props ?? {}), id: field.id }, [], true),
			...after,
		]);
	}
}

export function form({ fields, button, plugins: extraPlugins = []}: Options, plugins: FormPlugin[]) {
	const allPlugins = [...plugins, ...extraPlugins];
	return h(
		"div",
		{
			className: "w-full",
		},
		[
			...fields.map((f) => {
				const plugin = allPlugins.filter((p) => p.field === f.id);
				const elementPlugins = plugin.filter(
					(p) => p.location.reference === "element",
				);
				const labelPlugins = plugin.filter(
					(p) => p.location.reference === "label",
				);
				const labelElementPlugins = plugin.filter(
					(p) => p.location.reference === "element",
				);
				const inputPlugins = plugin.filter(
					(p) => p.location.reference === "input",
				);
				const outsidePlugins = plugin.filter(
					(p) => p.location.reference === "outside",
				);
				const insidePlugins = plugin.filter(
					(p) => p.location.reference === "inside",
				);

				return h("div", {}, [
					h(
						"div",
						{},
						outsidePlugins
							.filter((p) => p.location.location === "before")
							.map((p) => {
								if (!p.node.element) throw new Error();
								return p.node.element;
							}),
					),
					h("div", { class: "grid gap-2" }, [
						elementPlugins.length > 0
							? elementPlugins[elementPlugins.length - 1]!.node.element!
							: h("fragment", {}, [
									...insidePlugins
										.filter((p) => p.location.location === "before")
										.map((p) => {
											if (!p.node.element) throw new Error();
											return p.node.element;
										}),
									h(
										"div",
										{ class: "flex items-center" },
										labelElementPlugins.length > 0
											? [
													labelElementPlugins[labelElementPlugins.length - 1]!
														.node.element!,
												]
											: [
													h(
														"div",
														{},
														labelPlugins
															.filter((p) => p.location.location === "before")
															.map((p) => {
																if (!p.node.element) throw new Error();
																return p.node.element;
															}),
													),
													h("label", { htmlFor: f.id }, [
														{ type: "text", value: f.label },
													]),
													h(
														"div",
														{},
														labelPlugins
															.filter((p) => p.location.location === "after")
															.map((p) => {
																if (!p.node.element) throw new Error();
																return p.node.element;
															}),
													),
												],
									),
									...insidePlugins
										.filter((p) => p.location.location === "between")
										.map((p) => {
											if (!p.node.element) throw new Error();
											return p.node.element;
										}),
									getFieldElement(f, inputPlugins),
									...insidePlugins
										.filter((p) => p.location.location === "after")
										.map((p) => {
											if (!p.node.element) throw new Error();
											return p.node.element;
										}),
								]),
					]),
					h(
						"div",
						{},
						outsidePlugins
							.filter((p) => p.location.location === "after")
							.map((p) => {
								if (!p.node.element) throw new Error();
								return p.node.element;
							}),
					),
				]);
			}),

			h(
				"button",
				{ type: "submit", endpoint: button.endpoint, ...button.props },
				[{ type: "text", value: button.label }],
			),
		],
	);
}

export type * from "./types";
