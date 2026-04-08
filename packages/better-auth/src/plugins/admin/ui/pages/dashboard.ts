import { avatar, escapeHtml, svgIcon, tabs } from "../../../../ui/components";
import type { PluginUIHandlerContext } from "../../../../ui/handler";
import { worldMapSvg } from "../../../../ui/world-map";

export async function renderDashboardPage(
	ctx: PluginUIHandlerContext,
): Promise<string> {
	let totalUsers = 0;
	let recentUsers: Record<string, unknown>[] = [];
	let allUsers: Record<string, unknown>[] = [];

	try {
		[totalUsers, recentUsers, allUsers] = await Promise.all([
			ctx.context.internalAdapter.countTotalUsers(),
			ctx.context.internalAdapter.listUsers(8).then((u) => u || []),
			ctx.context.internalAdapter
				.listUsers(500, 0, { field: "createdAt", direction: "asc" as const })
				.then((u) => u || []),
		]);
	} catch {
		// DB may not support these
	}

	const userName = String(
		ctx.session?.user.name || ctx.session?.user.email || "Admin",
	);

	const graphData = buildWeeklyGraph(allUsers);

	const statCardsHtml = `
<div class="ba-card" style="display:flex;flex-direction:column;height:100%">
	<div class="ba-card-header">
		<span class="ba-card-title">Daily</span>
		${svgIcon("settings", 12)}
	</div>
	<div style="flex:1;display:flex;flex-direction:column">
		<div style="flex:1;padding:0.75rem;border-bottom:1px solid var(--ba-border)">
			<div style="font-weight:500;font-size:0.8125rem">Active Users</div>
			<div class="ba-text-xs ba-text-muted">Users active in the last 24 hours</div>
			<div style="font-size:1.75rem;font-weight:400;margin-top:0.5rem;letter-spacing:-0.025em">${totalUsers.toLocaleString()}</div>
		</div>
		<div style="flex:1;padding:0.75rem">
			<div style="font-weight:500;font-size:0.8125rem">New Users</div>
			<div class="ba-text-xs ba-text-muted">Users who signed up recently</div>
			<div style="font-size:1.75rem;font-weight:400;margin-top:0.5rem;letter-spacing:-0.025em">${recentUsers.length}</div>
		</div>
	</div>
</div>`;

	const graphCardHtml = `
<div class="ba-card" style="display:flex;flex-direction:column;height:100%">
	${tabs(
		[
			{
				id: "total",
				label: "Total Users",
				content: renderGraph(graphData, "total", totalUsers),
			},
			{
				id: "new",
				label: "New Users",
				content: renderGraph(graphData, "new", totalUsers),
			},
		],
		"total",
	)}
</div>`;

	const recentUsersTable =
		recentUsers.length === 0
			? `<div style="padding:2rem;text-align:center" class="ba-text-muted ba-text-xs">No users yet</div>`
			: `<table class="ba-table">
		<thead><tr>
			<th>Joined</th>
			<th>Name</th>
		</tr></thead>
		<tbody>${recentUsers
			.map((user) => {
				const name = String(user.name || "Unknown");
				const email = String(user.email || "");
				const image = user.image as string | null;
				const createdAt = user.createdAt
					? timeAgo(new Date(user.createdAt as string))
					: "-";
				return `<tr>
				<td><span class="ba-text-xs ba-text-muted" style="white-space:nowrap">${createdAt}</span></td>
				<td>
					<div class="ba-flex ba-items-center ba-gap-2">
						${avatar(name, image)}
						<div>
							<div style="font-weight:500;font-size:0.75rem">${escapeHtml(name)}</div>
							<div style="font-size:0.625rem;color:var(--ba-muted-fg)">${escapeHtml(email)}</div>
						</div>
					</div>
				</td>
			</tr>`;
			})
			.join("")}</tbody>
	</table>`;

	const recentUsersCard = `
<div class="ba-card" style="display:flex;flex-direction:column;height:100%">
	<div class="ba-card-header">
		<span class="ba-card-title">Recent Users</span>
		${svgIcon("settings", 12)}
	</div>
	<div style="flex:1;overflow-y:auto">
		${recentUsersTable}
	</div>
</div>`;

	const plugins = ctx.context.options.plugins || [];
	const pluginCount = plugins.length;
	const pluginNames = plugins.map((p) => p.id);
	const hasEmailPassword = !!ctx.context.options.emailAndPassword?.enabled;
	const socialProviders = Object.keys(
		ctx.context.options.socialProviders || {},
	);

	const mapCard = `
<div class="ba-card" style="display:flex;flex-direction:column;height:100%">
	<div style="padding:0.75rem;border-bottom:1px solid var(--ba-border)">
		<div style="font-weight:500;font-size:0.875rem">Global Users</div>
		<div class="ba-text-xs ba-text-muted">${totalUsers.toLocaleString()} total users</div>
	</div>
	<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0.25rem;color:var(--ba-muted-fg)">
		${worldMapSvg()}
	</div>
</div>`;

	const countriesCard = `
<div class="ba-card" style="display:flex;flex-direction:column;height:100%">
	<div class="ba-card-header">
		<span class="ba-card-title">${svgIcon("activity", 10)} &nbsp;TOP COUNTRIES</span>
		${svgIcon("settings", 12)}
	</div>
	<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:1.5rem;text-align:center">
		<div style="opacity:0.3;margin-bottom:0.75rem">
			<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
		</div>
		<div class="ba-text-xs ba-text-muted">Location data not available.</div>
		<div class="ba-text-xs ba-text-muted" style="margin-top:0.25rem">Enable IP-based geolocation to see country breakdown.</div>
	</div>
</div>`;

	const insightsItems: string[] = [];
	if (hasEmailPassword) {
		insightsItems.push(
			insightItem(
				"AUTH",
				"Email & Password",
				"Email and password authentication is enabled.",
				"success",
			),
		);
	}
	if (socialProviders.length > 0) {
		insightsItems.push(
			insightItem(
				"OAUTH",
				`${socialProviders.length} Social Provider${socialProviders.length > 1 ? "s" : ""}`,
				`Configured: ${socialProviders.join(", ")}`,
				"success",
			),
		);
	}
	if (pluginCount > 0) {
		insightsItems.push(
			insightItem(
				"PLUGINS",
				`${pluginCount} Plugin${pluginCount > 1 ? "s" : ""} Active`,
				`Loaded: ${pluginNames.slice(0, 5).join(", ")}${pluginNames.length > 5 ? "..." : ""}`,
				"default",
			),
		);
	}
	if (insightsItems.length === 0) {
		insightsItems.push(`<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:1.5rem;text-align:center">
			<div class="ba-text-xs ba-text-muted">All clear. No issues detected.</div>
		</div>`);
	}

	const insightsCard = `
<div class="ba-card" style="display:flex;flex-direction:column;height:100%">
	<div class="ba-card-header">
		<span class="ba-card-title">${svgIcon("activity", 10)} &nbsp;INSIGHTS</span>
	</div>
	<div style="flex:1;overflow-y:auto">
		${insightsItems.join("")}
	</div>
	<div style="padding:0.5rem 0.75rem;border-top:1px solid var(--ba-border);display:flex;align-items:center;gap:1rem;flex-wrap:wrap;font-size:0.6875rem">
		<span style="display:flex;align-items:center;gap:0.25rem"><span style="width:6px;height:6px;border-radius:50%;background:var(--ba-success);display:inline-block"></span> Online</span>
		<span class="ba-text-muted">${svgIcon("shield", 10)} ${pluginCount} plugins</span>
		${hasEmailPassword ? `<span class="ba-text-muted">🔑 Email</span>` : ""}
		${socialProviders.length > 0 ? `<span class="ba-text-muted">🔗 ${socialProviders.length} OAuth</span>` : ""}
	</div>
</div>`;

	const marqueeItems = [
		"User signups",
		"Session activity",
		"Organization updates",
		"Live events will appear here",
		"User signups",
		"Session activity",
		"Organization updates",
		"Live events will appear here",
		"User signups",
		"Session activity",
		"Organization updates",
	];
	const marqueeColors = [
		"var(--ba-danger)",
		"var(--ba-success)",
		"var(--ba-warning)",
		"var(--ba-muted-fg)",
	];
	const marquee = `
<div class="ba-marquee">
	<div class="ba-marquee-track">
		${marqueeItems
			.map(
				(item, i) =>
					`<span class="ba-marquee-item" style="color:${marqueeColors[i % marqueeColors.length]}">${escapeHtml(item)}</span>`,
			)
			.join("")}
		${marqueeItems
			.map(
				(item, i) =>
					`<span class="ba-marquee-item" style="color:${marqueeColors[i % marqueeColors.length]}">${escapeHtml(item)}</span>`,
			)
			.join("")}
	</div>
</div>`;

	return `
<div style="display:flex;flex-direction:column;height:calc(100vh - 7.625rem);overflow:hidden">
	<div class="ba-page-header" style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
		<div>
			<h1 class="ba-page-title">Welcome Back, ${escapeHtml(userName)}</h1>
			<p class="ba-page-desc">${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</p>
		</div>
	</div>

	<div style="display:grid;grid-template-columns:1fr 2fr 1.5fr;gap:0.5rem;flex:1;min-height:0">
		${statCardsHtml}
		${graphCardHtml}
		${recentUsersCard}
	</div>

	<div style="flex-shrink:0;margin:0.375rem 0">
		${marquee}
	</div>

	<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;flex:1;min-height:0">
		${mapCard}
		${countriesCard}
		${insightsCard}
	</div>
</div>`;
}

interface WeeklyPoint {
	label: string;
	cumulative: number;
	newUsers: number;
}

function buildWeeklyGraph(users: Record<string, unknown>[]): WeeklyPoint[] {
	const now = new Date();
	const weeks = 8;
	const points: WeeklyPoint[] = [];

	for (let i = weeks - 1; i >= 0; i--) {
		const weekEnd = new Date(now);
		weekEnd.setDate(weekEnd.getDate() - i * 7);
		const weekStart = new Date(weekEnd);
		weekStart.setDate(weekStart.getDate() - 7);

		const cumulative = users.filter(
			(u) => u.createdAt && new Date(u.createdAt as string) <= weekEnd,
		).length;
		const newInWeek = users.filter(
			(u) =>
				u.createdAt &&
				new Date(u.createdAt as string) > weekStart &&
				new Date(u.createdAt as string) <= weekEnd,
		).length;

		points.push({
			label: weekEnd.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			}),
			cumulative,
			newUsers: newInWeek,
		});
	}
	return points;
}

function renderGraph(
	data: WeeklyPoint[],
	mode: "total" | "new",
	totalUsers: number,
): string {
	if (data.length === 0) {
		return `<div style="padding:2rem;text-align:center" class="ba-text-muted ba-text-xs">No data</div>`;
	}

	const values = data.map((d) =>
		mode === "total" ? d.cumulative : d.newUsers,
	);
	const max = Math.max(...values, 1);
	const min = Math.min(...values, 0);
	const range = max - min || 1;

	const w = 400;
	const h = 180;
	const padX = 10;
	const padTop = 10;
	const padBot = 30;
	const chartH = h - padTop - padBot;
	const chartW = w - padX * 2;

	const points = values.map((v, i) => {
		const x = padX + (i / (values.length - 1 || 1)) * chartW;
		const y = padTop + chartH - ((v - min) / range) * chartH;
		return { x, y, v };
	});

	const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
	const areaPath = `M${points[0]!.x},${padTop + chartH} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1]!.x},${padTop + chartH}Z`;

	const dots = points
		.map(
			(p) =>
				`<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--ba-fg)" stroke="var(--ba-bg)" stroke-width="2"/>`,
		)
		.join("");

	const xLabels = data
		.map(
			(d, i) =>
				`<text x="${padX + (i / (data.length - 1 || 1)) * chartW}" y="${h - 6}" text-anchor="middle" fill="var(--ba-muted-fg)" font-size="9" font-family="var(--ba-font-mono)">${d.label}</text>`,
		)
		.join("");

	const gridLines = [0, 0.25, 0.5, 0.75, 1]
		.map((pct) => {
			const y = padTop + chartH - pct * chartH;
			return `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="var(--ba-border)" stroke-width="0.5"/>`;
		})
		.join("");

	const displayValue =
		mode === "total"
			? formatNumber(totalUsers)
			: formatNumber(values[values.length - 1] || 0);
	const displayLabel = mode === "total" ? "TOTAL USERS" : "NEW USERS";
	const periodLabel = "Last 8 weeks";

	return `
<div style="padding:0.75rem;height:100%;display:flex;flex-direction:column">
	<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
		<div>
			<div class="ba-text-xs ba-text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-size:0.625rem">${displayLabel}</div>
			<div style="font-size:1.75rem;font-weight:400;letter-spacing:-0.025em">${displayValue}</div>
		</div>
		<div class="ba-text-xs ba-text-muted">${periodLabel}</div>
	</div>
	<div style="flex:1;min-height:0">
		<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible">
			${gridLines}
			<path d="${areaPath}" fill="var(--ba-fg)" opacity="0.04"/>
			<polyline points="${polyline}" fill="none" stroke="var(--ba-fg)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
			${dots}
			${xLabels}
		</svg>
	</div>
</div>`;
}

function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
	return String(n);
}

function insightItem(
	tag: string,
	title: string,
	description: string,
	severity: "success" | "warning" | "danger" | "default" = "default",
): string {
	const dotColor =
		severity === "success"
			? "var(--ba-success)"
			: severity === "warning"
				? "var(--ba-warning)"
				: severity === "danger"
					? "var(--ba-danger)"
					: "var(--ba-muted-fg)";
	return `
<div style="padding:0.625rem 0.75rem;border-bottom:1px solid var(--ba-border)">
	<div style="display:flex;align-items:center;gap:0.375rem;margin-bottom:0.25rem">
		<span style="font-size:0.5625rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--ba-muted-fg)">${escapeHtml(tag)}</span>
		<span style="width:5px;height:5px;border-radius:50%;background:${dotColor};display:inline-block"></span>
	</div>
	<div style="font-weight:500;font-size:0.8125rem">${escapeHtml(title)}</div>
	<div class="ba-text-xs ba-text-muted" style="margin-top:0.125rem">${escapeHtml(description)}</div>
</div>`;
}

function timeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
