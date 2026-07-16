/** @jsxImportSource @better-auth/ui */

import type { UIContext, UISettingsCard } from "@better-auth/core";
import type { UIChild } from "@better-auth/ui";
import { getUIBasePath } from "../../ui/utils";

function Icon(props: { children: UIChild; class?: string }) {
	return (
		<svg
			class={props.class ?? "ba-settings-icon"}
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{props.children}
		</svg>
	);
}

function IconUserPlus() {
	return (
		<Icon>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<line x1="19" x2="19" y1="8" y2="14" />
			<line x1="22" x2="16" y1="11" y2="11" />
		</Icon>
	);
}

function uiHref(ctx: UIContext, path: string) {
	const base = getUIBasePath(ctx.context.options);
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${base}${normalized}`;
}

async function isAnonymousSession(ctx: UIContext) {
	try {
		const res = await fetch(`${ctx.context.baseURL}/get-session`, {
			headers: {
				cookie: ctx.request.headers.get("cookie") ?? "",
			},
		});
		if (!res.ok) return false;
		const data = (await res.json()) as {
			user?: { isAnonymous?: boolean | null };
		} | null;
		return Boolean(data?.user?.isAnonymous);
	} catch {
		return false;
	}
}

function AnonymousSettingsBody(props: { ctx: UIContext }) {
	return (
		<div data-ba-settings-anonymous>
			<p class="ba-settings-status-text">
				You are signed in anonymously. Create a permanent account to keep your
				data.
			</p>
			<a
				class="ba-button ba-button-outline"
				href={uiHref(props.ctx, "/sign-up")}
			>
				Create account
			</a>
		</div>
	);
}

export const anonymousSettingsCards: UISettingsCard[] = [
	{
		id: "anonymous",
		priority: 85,
		title: "Convert Anonymous Account",
		description: "Link this session to a permanent account",
		icon: () => <IconUserPlus />,
		visible: (ctx) =>
			ctx.plugins.has("anonymous") ? isAnonymousSession(ctx) : false,
		render: (ctx) => <AnonymousSettingsBody ctx={ctx} />,
	},
];
