import {
	avatar,
	badge,
	button,
	dataTable,
	dialog,
	dropdown,
	escapeAttr,
	escapeHtml,
	input,
	select,
	svgIcon,
} from "../../../../ui/components";
import type { PluginUIHandlerContext } from "../../../../ui/handler";

const PAGE_SIZE = 20;

export async function renderUsersPage(
	ctx: PluginUIHandlerContext,
): Promise<string> {
	const url = new URL(ctx.request.url);
	const search = url.searchParams.get("search") || "";
	const page = Number(url.searchParams.get("page") || "1");
	const offset = (page - 1) * PAGE_SIZE;

	let users: Record<string, unknown>[] = [];
	let total = 0;

	try {
		const where = search
			? [
					{
						field: "email" as const,
						operator: "contains" as const,
						value: search,
					},
				]
			: undefined;
		users =
			(await ctx.context.internalAdapter.listUsers(
				PAGE_SIZE,
				offset,
				{ field: "createdAt", direction: "desc" as const },
				where,
			)) || [];
		total = await ctx.context.internalAdapter.countTotalUsers(where);
	} catch {
		// fallback
	}

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const uiBasePath = (ctx.context.options.ui?.basePath || "/auth") + "/admin";

	const toolbar = `
		<div class="ba-flex ba-items-center ba-gap-2" style="flex:1;max-width:320px">
			${input({
				placeholder: "Search by email...",
				value: search,
				size: "sm",
				attrs: `data-param="search"`,
			})}
		</div>
		<div class="ba-flex ba-items-center ba-gap-2">
			${button({
				label: "Add User",
				variant: "primary",
				size: "sm",
				attrs: `data-ba-dialog-trigger="dlg-create"`,
			})}
		</div>
	`;

	const prevUrl =
		page > 1
			? `${uiBasePath}/users?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`
			: "";
	const nextUrl =
		page < totalPages
			? `${uiBasePath}/users?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`
			: "";

	const footer = `
		<span>Showing ${users.length} of ${total} users</span>
		<div class="ba-flex ba-items-center ba-gap-2">
			${button({ label: "Previous", size: "sm", disabled: page <= 1, attrs: prevUrl ? `data-nav="${prevUrl}"` : "" })}
			<span class="ba-text-xs">Page ${page} of ${totalPages}</span>
			${button({ label: "Next", size: "sm", disabled: page >= totalPages, attrs: nextUrl ? `data-nav="${nextUrl}"` : "" })}
		</div>
	`;

	const table = dataTable({
		columns: [
			{
				key: "user",
				label: "User",
				render: (_val, row) => {
					const name = String(row.name || "Unknown");
					const email = String(row.email || "");
					const image = row.image as string | null;
					return `<div class="ba-flex ba-items-center ba-gap-2">
						${avatar(name, image)}
						<div>
							<div style="font-weight:500;font-size:0.8125rem">${escapeHtml(name)}</div>
							<div class="ba-text-xs ba-text-muted">${escapeHtml(email)}</div>
						</div>
					</div>`;
				},
			},
			{
				key: "role",
				label: "Role",
				render: (val) =>
					badge({
						text: String(val || "user"),
						variant: val === "admin" ? "warning" : "default",
					}),
			},
			{
				key: "banned",
				label: "Status",
				render: (val) =>
					badge({
						text: val ? "Banned" : "Active",
						variant: val ? "danger" : "success",
					}),
			},
			{
				key: "createdAt",
				label: "Joined",
				render: (val) => {
					if (!val) return "-";
					return `<span class="ba-text-xs ba-text-muted">${new Date(val as string).toLocaleDateString()}</span>`;
				},
			},
			{
				key: "id",
				label: "",
				align: "right",
				render: (_val, row) => renderUserActions(row),
			},
		],
		rows: users,
		toolbar,
		footer,
		emptyMessage: "No users found",
	});

	const createDialog = dialog({
		id: "dlg-create",
		title: "Create User",
		body: `
			<form data-action="/admin/create-user" id="form-create">
				<div class="ba-field">
					<label class="ba-label">Name</label>
					${input({ name: "name", placeholder: "Full name" })}
				</div>
				<div class="ba-field">
					<label class="ba-label">Email</label>
					${input({ name: "email", placeholder: "email@example.com", type: "email" })}
				</div>
				<div class="ba-field">
					<label class="ba-label">Password</label>
					${input({ name: "password", placeholder: "Password", type: "password" })}
				</div>
				<div class="ba-field">
					<label class="ba-label">Role</label>
					${select(
						[
							{ value: "user", label: "User" },
							{ value: "admin", label: "Admin" },
						],
						"user",
						`name="role"`,
					)}
				</div>
				<div class="ba-modal-footer" style="padding:0;border:0;margin-top:0.75rem">
					${button({ label: "Cancel", attrs: `type="button" data-ba-dialog-close` })}
					${button({ label: "Create", variant: "primary", attrs: `type="submit"` })}
				</div>
			</form>
		`,
	});

	const roleDialog = dialog({
		id: "dlg-role",
		title: "Change Role",
		body: `
			<form data-action="/admin/set-role" id="form-role">
				<input type="hidden" name="userId" id="role-userId" />
				<div class="ba-field">
					<label class="ba-label">New Role</label>
					${select(
						[
							{ value: "user", label: "User" },
							{ value: "admin", label: "Admin" },
						],
						"user",
						`name="role" id="role-select"`,
					)}
				</div>
				<div class="ba-modal-footer" style="padding:0;border:0;margin-top:0.75rem">
					${button({ label: "Cancel", attrs: `type="button" data-ba-dialog-close` })}
					${button({ label: "Save", variant: "primary", attrs: `type="submit"` })}
				</div>
			</form>
		`,
	});

	const banDialog = dialog({
		id: "dlg-ban",
		title: "Ban User",
		body: `
			<form data-action="/admin/ban-user" data-confirm="Are you sure you want to ban this user?">
				<input type="hidden" name="userId" id="ban-userId" />
				<p class="ba-text-xs ba-text-muted">This user will be signed out and unable to sign in.</p>
				<div class="ba-modal-footer" style="padding:0;border:0;margin-top:0.75rem">
					${button({ label: "Cancel", attrs: `type="button" data-ba-dialog-close` })}
					${button({ label: "Ban User", variant: "danger", attrs: `type="submit"` })}
				</div>
			</form>
		`,
	});

	const deleteDialog = dialog({
		id: "dlg-delete",
		title: "Delete User",
		body: `
			<form data-action="/admin/remove-user" data-confirm="Permanently delete this user? This cannot be undone.">
				<input type="hidden" name="userId" id="delete-userId" />
				<p class="ba-text-xs ba-text-muted">All data for this user will be permanently removed.</p>
				<div class="ba-modal-footer" style="padding:0;border:0;margin-top:0.75rem">
					${button({ label: "Cancel", attrs: `type="button" data-ba-dialog-close` })}
					${button({ label: "Delete", variant: "danger", attrs: `type="submit"` })}
				</div>
			</form>
		`,
	});

	return `
<div class="ba-page-header">
	<div>
		<h1 class="ba-page-title">Users</h1>
		<p class="ba-page-desc">Manage your application's users.</p>
	</div>
</div>
${table}
${createDialog}
${roleDialog}
${banDialog}
${deleteDialog}
<script>
function openRoleDialog(id,role){
document.getElementById("role-userId").value=id;
document.getElementById("role-select").value=role;
var d=document.querySelector('[data-ba-dialog="dlg-role"]');if(d&&d.__ba_open)d.__ba_open();
}
function openBanDialog(id){
document.getElementById("ban-userId").value=id;
var d=document.querySelector('[data-ba-dialog="dlg-ban"]');if(d&&d.__ba_open)d.__ba_open();
}
function openDeleteDialog(id){
document.getElementById("delete-userId").value=id;
var d=document.querySelector('[data-ba-dialog="dlg-delete"]');if(d&&d.__ba_open)d.__ba_open();
}
function unbanUser(id){
fetch(__ba.basePath+"/admin/unban-user",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:id})})
.then(function(){return fetch(location.href,{credentials:"include",headers:{"X-BA-Partial":"true"}}).then(function(r){return r.text()})})
.then(function(html){document.getElementById("ba-main").innerHTML=html;document.dispatchEvent(new CustomEvent("ba:navigated"));});
}
</script>`;
}

function renderUserActions(user: Record<string, unknown>): string {
	const id = escapeAttr(String(user.id));
	const role = escapeAttr(String(user.role || "user"));
	const banned = !!user.banned;

	const items = [
		{
			label: "Change Role",
			attrs: `onclick="openRoleDialog('${id}','${role}')"`,
		},
		...(banned
			? [{ label: "Unban", attrs: `onclick="unbanUser('${id}')"` }]
			: [{ label: "Ban", attrs: `onclick="openBanDialog('${id}')"` }]),
		{ separator: true } as const,
		{
			label: "Delete",
			danger: true,
			attrs: `onclick="openDeleteDialog('${id}')"`,
		},
	];

	return dropdown(
		`<button class="ba-btn ba-btn-ghost ba-btn-icon">${svgIcon("moreVertical", 14)}</button>`,
		items as Array<{
			label: string;
			attrs?: string;
			danger?: boolean;
			separator?: boolean;
		}>,
	);
}
