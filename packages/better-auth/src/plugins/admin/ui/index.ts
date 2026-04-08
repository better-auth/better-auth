import { avatar, escapeHtml, svgIcon } from "../../../ui/components";
import type {
	PluginUIConfig,
	PluginUIHandlerContext,
} from "../../../ui/handler";
import { htmlResponse, renderPage } from "../../../ui/page";
import { renderDashboardPage } from "./pages/dashboard";
import { renderUsersPage } from "./pages/users";

export function createAdminUI(): PluginUIConfig {
	return {
		path: "/admin",
		handler: async (ctx) => {
			if (!ctx.session) {
				return htmlResponse(renderLoginRequired(ctx), 401);
			}

			const role = ctx.session.user.role as string | undefined;
			const adminRoles = ctx.context.options.plugins?.find(
				(p) => p.id === "admin",
			)?.options?.adminRoles ?? ["admin"];
			const roles = Array.isArray(adminRoles)
				? adminRoles
				: (adminRoles as string).split(",");

			if (
				!role ||
				!role.split(",").some((r: string) => roles.includes(r.trim()))
			) {
				return htmlResponse(renderForbidden(ctx), 403);
			}

			const route = ctx.path === "" ? "/" : ctx.path;
			const content = await renderRoute(route, ctx);

			if (ctx.partial) {
				return htmlResponse(content);
			}

			const apiBasePath = ctx.context.options.basePath || "/api/auth";
			const uiBasePath =
				(ctx.context.options.ui?.basePath || "/auth") + "/admin";

			return htmlResponse(
				renderPage({
					title: "Admin",
					apiBasePath,
					body: adminShell(uiBasePath, route, content, ctx.session, ctx),
				}),
			);
		},
	};
}

async function renderRoute(
	route: string,
	ctx: PluginUIHandlerContext,
): Promise<string> {
	switch (true) {
		case route === "/" || route === "/dashboard":
			return renderDashboardPage(ctx);
		case route === "/users":
			return renderUsersPage(ctx);
		default:
			return `<div class="ba-content"><h2>Not Found</h2><p class="ba-text-muted ba-text-sm">Page not found: ${route}</p></div>`;
	}
}

function adminShell(
	uiBasePath: string,
	currentRoute: string,
	content: string,
	session: NonNullable<PluginUIHandlerContext["session"]>,
	ctx: PluginUIHandlerContext,
): string {
	const plugins = ctx.context.options.plugins || [];
	const pluginIds = new Set(plugins.map((p) => p.id));

	const navItems: { path: string; label: string }[] = [
		{ path: "/dashboard", label: "Overview" },
		{ path: "/users", label: "Users" },
	];

	if (pluginIds.has("organization")) {
		navItems.push({ path: "/organizations", label: "Organizations" });
	}

	const bottomNav = navItems
		.map((item, i) => {
			const fullPath = uiBasePath + item.path;
			const isActive =
				currentRoute === item.path ||
				(item.path === "/dashboard" && currentRoute === "/");
			return `<a class="ba-bottomnav-item" data-active="${isActive}" data-nav="${fullPath}">
				<span class="ba-bottomnav-num">0${i + 1}</span>
				<span>${item.label}</span>
			</a>`;
		})
		.join("");

	const userName = escapeHtml(
		String(session.user.name || session.user.email || "Admin"),
	);
	const userEmail = escapeHtml(String(session.user.email || ""));
	const userImage = session.user.image as string | null;

	const themeSwitcher = `
<div class="ba-flex ba-items-center ba-gap-2">
	<button class="ba-btn ba-btn-ghost ba-btn-icon" onclick="
		var d=document.documentElement;
		var isDark=d.getAttribute('data-theme')==='dark';
		if(!isDark&&!d.getAttribute('data-theme')){isDark=window.matchMedia('(prefers-color-scheme:dark)').matches}
		d.setAttribute('data-theme',isDark?'light':'dark');
		d.style.colorScheme=isDark?'light':'dark';
	" aria-label="Toggle theme">
		<svg class="ba-theme-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
	</button>
</div>`;

	return `
<div class="ba-shell">
	<header class="ba-topbar">
		<div class="ba-topbar-brand">
			${svgIcon("shield", 16)}
			<span>BETTER-AUTH.</span>
		</div>
		${themeSwitcher}
	</header>
	<div class="ba-body">
		<div class="ba-content" id="ba-main">${content}</div>
	</div>
	<nav class="ba-bottomnav">
		<div class="ba-bottomnav-items">${bottomNav}</div>
		<div class="ba-bottomnav-profile">
			${avatar(userName, userImage)}
			<div>
				<div class="ba-bottomnav-profile-name">${userName}</div>
				${userEmail ? `<div class="ba-bottomnav-profile-email">${userEmail}</div>` : ""}
			</div>
		</div>
	</nav>
</div>
<script>
document.addEventListener("ba:navigated",function(){
var p=location.pathname;
document.querySelectorAll(".ba-bottomnav-item[data-nav]").forEach(function(el){
var h=el.getAttribute("data-nav");
el.setAttribute("data-active",String(p===h||p.startsWith(h+"/")));
});
});
</script>`;
}

function renderLoginRequired(ctx: PluginUIHandlerContext): string {
	return renderPage({
		title: "Login Required",
		apiBasePath: ctx.context.options.basePath || "/api/auth",
		body: `
<div style="display:flex;align-items:center;justify-content:center;min-height:100vh">
	<div class="ba-card" style="max-width:22rem;text-align:center">
		<div class="ba-card-header"><span class="ba-card-title">Authentication</span></div>
		<div class="ba-card-body" style="padding:1.5rem">
			<h2 style="font-size:1rem;font-weight:500;margin-bottom:0.25rem">Sign in required</h2>
			<p class="ba-text-muted ba-text-xs">You must be signed in to access the admin panel.</p>
		</div>
	</div>
</div>`,
	});
}

function renderForbidden(ctx: PluginUIHandlerContext): string {
	return renderPage({
		title: "Access Denied",
		apiBasePath: ctx.context.options.basePath || "/api/auth",
		body: `
<div style="display:flex;align-items:center;justify-content:center;min-height:100vh">
	<div class="ba-card" style="max-width:22rem;text-align:center">
		<div class="ba-card-header"><span class="ba-card-title">Access Denied</span></div>
		<div class="ba-card-body" style="padding:1.5rem">
			<h2 style="font-size:1rem;font-weight:500;margin-bottom:0.25rem">Forbidden</h2>
			<p class="ba-text-muted ba-text-xs">You don't have permission to access the admin panel.</p>
		</div>
	</div>
</div>`,
	});
}
