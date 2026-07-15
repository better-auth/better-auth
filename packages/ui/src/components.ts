import type { UIComponent, UICondition, UIProps } from "@better-auth/core";
import type {
	ComponentProps,
	EffectInput,
	UIActionDescriptor,
	UIChild,
} from "./types";

type UIComponentChild =
	| string
	| number
	| boolean
	| UIComponent
	| null
	| undefined;

function asArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function childrenArray(children: UIChild | undefined): UIComponentChild[] {
	if (children === undefined) return [];
	if (Array.isArray(children)) {
		return children.flatMap((child) => childrenArray(child));
	}
	return [children];
}

function serializableProps(
	props: Record<string, unknown> | undefined,
): UIProps {
	return (props ?? {}) as UIProps;
}

function component(
	tag: string,
	props: Record<string, unknown> | undefined,
	children: UIChild | undefined,
): UIComponent {
	return {
		tag,
		props: serializableProps(props),
		children: childrenArray(children),
	};
}

function serializeEffects(effects: EffectInput) {
	const list = asArray(effects);
	return list.length > 0 ? JSON.stringify(list) : undefined;
}

function actionProps(action: UIActionDescriptor | undefined) {
	if (!action) return {};
	if (typeof action === "string") {
		return {
			action,
		};
	}
	if (action.type === "auth-route") {
		return {
			action: action.path,
			method: action.method.toLowerCase(),
			"data-ba-action-kind": "auth-route",
		};
	}
	return {
		action: `/_ba/action/${encodeURIComponent(action.id)}`,
		method: action.method.toLowerCase(),
		"data-ba-action-kind": "server-action",
	};
}

export function Card(props: ComponentProps) {
	return component("card", props, props.children);
}

export function Button(
	props: ComponentProps & { type?: "button" | "submit" | "reset" },
) {
	return component("button", props, props.children);
}

export function Text(props: ComponentProps) {
	return component("p", props, props.children);
}

export function Dialog(
	props: ComponentProps & {
		id: string;
		title?: string | undefined;
		description?: string | undefined;
		closeLabel?: string | undefined;
	},
) {
	const { title, description, closeLabel, children, ...rest } = props;
	return component(
		"modal",
		{
			...rest,
			// Rendered as a plain z-index overlay (not a native <dialog>) so that
			// browser extension UIs — e.g. 1Password's passkey account picker —
			// can layer above it. Native dialogs render in the top layer, which
			// covers extension overlays. Hidden until opened via the runtime.
			hidden: true,
		},
		[
			component(
				"div",
				{
					class: "ba-modal-panel",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": title ? `${props.id}-title` : undefined,
					"aria-describedby": description
						? `${props.id}-description`
						: undefined,
				},
				[
					{
						tag: "button",
						props: {
							type: "button",
							class: "ba-dialog-close",
							"data-ba-unstyled": true,
							"data-ba-dialog-close": props.id,
							"aria-label": closeLabel ?? "Close dialog",
						},
						children: ["\u00d7"],
					},
					title
						? {
								tag: "h2",
								props: {
									id: `${props.id}-title`,
									class: "ba-dialog-title",
								},
								children: [title],
							}
						: null,
					description
						? {
								tag: "p",
								props: {
									id: `${props.id}-description`,
									class: "ba-dialog-description",
								},
								children: [description],
							}
						: null,
					children,
				],
			),
		],
	);
}

export function Link(props: ComponentProps & { href: string }) {
	return component("a", props, props.children);
}

export function Show(props: ComponentProps & { when: UICondition }) {
	const { when, children, ...rest } = props;
	return {
		tag: "div",
		props: serializableProps(rest),
		when,
		children: childrenArray(children),
	} satisfies UIComponent;
}

export function Input(
	props: ComponentProps & {
		name: string;
		label?: string | undefined;
		type?: string | undefined;
		bind?: string | { key: string } | undefined;
	},
) {
	const { label, children: _children, bind, ...inputProps } = props;
	const input = {
		tag: "input",
		props: serializableProps(inputProps),
		bind: typeof bind === "string" ? bind : bind?.key,
	} satisfies UIComponent;
	if (!label) return input;
	return {
		tag: "label",
		children: [label, input],
	} satisfies UIComponent;
}

export function Form(
	props: ComponentProps & {
		action?: UIActionDescriptor | undefined;
		method?: "GET" | "POST" | "get" | "post" | undefined;
		success?: EffectInput;
		error?: EffectInput;
		pending?: string | undefined;
	},
) {
	const { action, success, error, pending, children, ...rest } = props;
	return component(
		"form",
		{
			...rest,
			...actionProps(action),
			"data-ba-success-effects": serializeEffects(success),
			"data-ba-error-effects": serializeEffects(error),
			"data-ba-pending": pending,
		},
		children,
	);
}
