/**
 * Better Auth UI - Server-side HTML component toolkit.
 * Design system primitives + Radix-style component generators.
 * No layout opinions -- plugins decide their own structure.
 */

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function escapeAttr(str: string): string {
	return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --- Stat Cards ---

export interface StatCardOptions {
	label: string;
	value: string | number;
	change?: string;
	positive?: boolean;
}

export function statsGrid(stats: StatCardOptions[]): string {
	return `<div class="ba-stats">${stats.map(statCard).join("")}</div>`;
}

export function statCard(stat: StatCardOptions): string {
	return `
<div class="ba-stat">
	<div class="ba-stat-label">${escapeHtml(stat.label)}</div>
	<div class="ba-stat-value">${escapeHtml(String(stat.value))}</div>
	${stat.change ? `<div class="ba-stat-change ${stat.positive ? "positive" : "negative"}">${escapeHtml(stat.change)}</div>` : ""}
</div>`;
}

// --- Data Table ---

export interface TableColumn {
	key: string;
	label: string;
	render?: (value: unknown, row: Record<string, unknown>) => string;
	align?: "left" | "center" | "right";
	width?: string;
}

export interface TableOptions {
	columns: TableColumn[];
	rows: Record<string, unknown>[];
	toolbar?: string;
	footer?: string;
	emptyMessage?: string;
}

export function dataTable(opts: TableOptions): string {
	const header = opts.columns
		.map(
			(col) =>
				`<th${col.width ? ` style="width:${col.width}"` : ""}${col.align ? ` style="text-align:${col.align}"` : ""}>${escapeHtml(col.label)}</th>`,
		)
		.join("");

	const rows =
		opts.rows.length === 0
			? `<tr><td colspan="${opts.columns.length}" class="ba-table-empty">${opts.emptyMessage || "No data"}</td></tr>`
			: opts.rows
					.map(
						(row) => `
		<tr>${opts.columns
			.map((col) => {
				const value = row[col.key];
				const rendered = col.render
					? col.render(value, row)
					: escapeHtml(String(value ?? ""));
				return `<td${col.align ? ` style="text-align:${col.align}"` : ""}>${rendered}</td>`;
			})
			.join("")}</tr>`,
					)
					.join("");

	return `
<div class="ba-table-wrap">
	${opts.toolbar ? `<div class="ba-table-toolbar">${opts.toolbar}</div>` : ""}
	<table class="ba-table">
		<thead><tr>${header}</tr></thead>
		<tbody>${rows}</tbody>
	</table>
	${opts.footer ? `<div class="ba-table-footer">${opts.footer}</div>` : ""}
</div>`;
}

// --- Buttons ---

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonOptions {
	label: string;
	variant?: ButtonVariant;
	size?: "sm" | "default";
	disabled?: boolean;
	attrs?: string;
}

export function button(opts: ButtonOptions): string {
	const cls = [
		"ba-btn",
		`ba-btn-${opts.variant || "secondary"}`,
		opts.size === "sm" ? "ba-btn-sm" : "",
	]
		.filter(Boolean)
		.join(" ");
	return `<button class="${cls}"${opts.disabled ? " disabled" : ""} ${opts.attrs || ""}>${escapeHtml(opts.label)}</button>`;
}

// --- Badge ---

export type BadgeVariant = "default" | "success" | "danger" | "warning";

export interface BadgeOptions {
	text: string;
	variant?: BadgeVariant;
}

export function badge(opts: BadgeOptions): string {
	return `<span class="ba-badge ba-badge-${opts.variant || "default"}">${escapeHtml(opts.text)}</span>`;
}

// --- Input ---

export interface InputOptions {
	name?: string;
	placeholder?: string;
	value?: string;
	type?: string;
	size?: "sm" | "default";
	attrs?: string;
}

export function input(opts: InputOptions): string {
	const cls = ["ba-input", opts.size === "sm" ? "ba-input-sm" : ""]
		.filter(Boolean)
		.join(" ");
	return `<input class="${cls}"${opts.name ? ` name="${escapeAttr(opts.name)}"` : ""} type="${opts.type || "text"}" placeholder="${escapeAttr(opts.placeholder || "")}" value="${escapeAttr(opts.value || "")}" ${opts.attrs || ""}/>`;
}

export function select(
	options: { value: string; label: string }[],
	selected?: string,
	attrs?: string,
): string {
	const optionsHtml = options
		.map(
			(o) =>
				`<option value="${escapeAttr(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
		)
		.join("");
	return `<select class="ba-input ba-select" ${attrs || ""}>${optionsHtml}</select>`;
}

// --- Dialog (Radix-style) ---

export interface DialogOptions {
	id: string;
	title: string;
	body: string;
	footer?: string;
}

/**
 * Radix-style Dialog. Trigger with `data-ba-dialog-trigger="id"`.
 * Features: focus trap, escape to close, overlay click to close, scroll lock.
 */
export function dialog(opts: DialogOptions): string {
	return `
<div data-ba-dialog="${escapeAttr(opts.id)}" role="dialog" aria-modal="true" aria-hidden="true" aria-label="${escapeAttr(opts.title)}" class="ba-dialog-root" data-state="closed">
	<div data-ba-dialog-overlay class="ba-dialog-overlay"></div>
	<div data-ba-dialog-content class="ba-dialog-content">
		<div class="ba-modal-header">
			<div class="ba-modal-title">${escapeHtml(opts.title)}</div>
			<button class="ba-btn ba-btn-ghost ba-btn-icon" data-ba-dialog-close aria-label="Close">${svgIcon("x", 14)}</button>
		</div>
		<div class="ba-modal-body">${opts.body}</div>
		${opts.footer ? `<div class="ba-modal-footer">${opts.footer}</div>` : ""}
	</div>
</div>`;
}

// --- Dropdown Menu (Radix-style) ---

export interface DropdownItem {
	label: string;
	attrs?: string;
	danger?: boolean;
	separator?: boolean;
}

/**
 * Radix-style Dropdown Menu.
 * Features: keyboard nav (arrow keys), escape to close, click outside to close.
 */
export function dropdown(trigger: string, items: DropdownItem[]): string {
	const itemsHtml = items
		.map((item) =>
			item.separator
				? `<hr class="ba-dropdown-separator"/>`
				: `<button role="menuitem" data-ba-dropdown-item class="ba-dropdown-item${item.danger ? " danger" : ""}" ${item.attrs || ""}>${escapeHtml(item.label)}</button>`,
		)
		.join("");
	return `
<div data-ba-dropdown>
	<div data-ba-dropdown-trigger>${trigger}</div>
	<div data-ba-dropdown-content role="menu" class="ba-dropdown-menu">${itemsHtml}</div>
</div>`;
}

// --- Tabs (Radix-style) ---

export interface TabItem {
	id: string;
	label: string;
	content: string;
}

/**
 * Radix-style Tabs.
 * Features: keyboard nav (arrow keys), ARIA tablist/tab/tabpanel.
 */
export function tabs(items: TabItem[], defaultTab?: string): string {
	const defaultId = defaultTab || items[0]?.id || "";
	const tabButtons = items
		.map(
			(t) =>
				`<button role="tab" data-ba-tab="${escapeAttr(t.id)}" class="ba-tab">${escapeHtml(t.label)}</button>`,
		)
		.join("");
	const panels = items
		.map(
			(t) =>
				`<div data-ba-tabpanel="${escapeAttr(t.id)}" class="ba-tabpanel">${t.content}</div>`,
		)
		.join("");
	return `
<div data-ba-tabs data-ba-tabs-default="${escapeAttr(defaultId)}">
	<div class="ba-tablist">${tabButtons}</div>
	${panels}
</div>`;
}

// --- Accordion (Radix-style) ---

export interface AccordionItem {
	id: string;
	title: string;
	content: string;
}

/**
 * Radix-style Accordion.
 * Features: single/multiple mode, keyboard accessible, animated.
 */
export function accordion(
	items: AccordionItem[],
	type: "single" | "multiple" = "single",
): string {
	const itemsHtml = items
		.map(
			(item) => `
<div data-ba-accordion-item="${escapeAttr(item.id)}" class="ba-accordion-item">
	<button data-ba-accordion-trigger class="ba-accordion-trigger" aria-expanded="false">
		<span>${escapeHtml(item.title)}</span>
		<span class="ba-accordion-chevron">${svgIcon("chevronRight", 14)}</span>
	</button>
	<div data-ba-accordion-content class="ba-accordion-content">${item.content}</div>
</div>`,
		)
		.join("");
	return `<div data-ba-accordion data-ba-accordion-type="${type}" class="ba-accordion">${itemsHtml}</div>`;
}

// --- Popover (Radix-style) ---

export interface PopoverOptions {
	trigger: string;
	content: string;
}

/**
 * Radix-style Popover.
 * Features: positioned, focus trap, escape to close, click outside to close.
 */
export function popover(opts: PopoverOptions): string {
	return `
<div data-ba-popover>
	<div data-ba-popover-trigger>${opts.trigger}</div>
	<div data-ba-popover-content class="ba-popover-content">${opts.content}</div>
</div>`;
}

// --- Tooltip ---

/**
 * Add `data-ba-tooltip="text"` to any element for a hover tooltip.
 * This is a helper to add the attribute programmatically.
 */
export function withTooltip(html: string, text: string): string {
	return html.replace(">", ` data-ba-tooltip="${escapeAttr(text)}">`);
}

// --- Alert Dialog (Radix-style) ---

export interface AlertDialogOptions {
	id: string;
	title: string;
	description: string;
	cancelLabel?: string;
	actionLabel?: string;
	actionVariant?: ButtonVariant;
	/** Extra attrs on the action button (e.g. form submit) */
	actionAttrs?: string;
}

/**
 * Radix-style Alert Dialog for confirmations.
 * Cannot be dismissed by clicking overlay or pressing Escape -- user must choose.
 * Trigger with `data-ba-alert-dialog-trigger="id"`.
 */
export function alertDialog(opts: AlertDialogOptions): string {
	return `
<div data-ba-alert-dialog="${escapeAttr(opts.id)}" role="alertdialog" aria-modal="true" aria-hidden="true" aria-label="${escapeAttr(opts.title)}" class="ba-dialog-root" data-state="closed">
	<div data-ba-alert-dialog-overlay class="ba-dialog-overlay"></div>
	<div data-ba-alert-dialog-content class="ba-dialog-content">
		<div class="ba-modal-body" style="padding:1rem">
			<div style="font-weight:600;font-size:0.875rem;margin-bottom:0.25rem">${escapeHtml(opts.title)}</div>
			<p class="ba-text-xs ba-text-muted">${escapeHtml(opts.description)}</p>
		</div>
		<div class="ba-modal-footer">
			<button class="ba-btn ba-btn-secondary" data-ba-alert-dialog-cancel>${escapeHtml(opts.cancelLabel || "Cancel")}</button>
			<button class="ba-btn ba-btn-${opts.actionVariant || "danger"}" data-ba-alert-dialog-action ${opts.actionAttrs || ""}>${escapeHtml(opts.actionLabel || "Continue")}</button>
		</div>
	</div>
</div>`;
}

// --- Switch ---

export interface SwitchOptions {
	name?: string;
	checked?: boolean;
	label?: string;
	attrs?: string;
}

/**
 * Toggle switch. Accessible, keyboard navigable (Space/Enter).
 */
export function switchInput(opts: SwitchOptions): string {
	const id = opts.name || `sw-${Math.random().toString(36).slice(2, 8)}`;
	return `
<label class="ba-switch-label" for="${escapeAttr(id)}">
	<div data-ba-switch class="ba-switch" role="switch" tabindex="0" data-state="${opts.checked ? "checked" : "unchecked"}" aria-checked="${opts.checked ? "true" : "false"}">
		<input type="checkbox" id="${escapeAttr(id)}" name="${escapeAttr(opts.name || "")}" ${opts.checked ? "checked" : ""} class="ba-switch-input" ${opts.attrs || ""}/>
		<span class="ba-switch-thumb"></span>
	</div>
	${opts.label ? `<span class="ba-switch-text">${escapeHtml(opts.label)}</span>` : ""}
</label>`;
}

// --- Custom Select (Radix-style) ---

export interface SelectOption {
	value: string;
	label: string;
}

export interface CustomSelectOptions {
	name: string;
	options: SelectOption[];
	selected?: string;
	placeholder?: string;
	attrs?: string;
}

/**
 * Radix-style custom Select. Keyboard navigable, styled consistently.
 */
export function customSelect(opts: CustomSelectOptions): string {
	const selectedOpt = opts.options.find((o) => o.value === opts.selected);
	const displayText = selectedOpt?.label || opts.placeholder || "Select...";
	const items = opts.options
		.map(
			(o) =>
				`<div data-ba-select-item data-value="${escapeAttr(o.value)}" class="ba-select-item" data-selected="${o.value === opts.selected}">${escapeHtml(o.label)}</div>`,
		)
		.join("");
	return `
<div data-ba-select class="ba-custom-select" ${opts.attrs || ""}>
	<input type="hidden" name="${escapeAttr(opts.name)}" value="${escapeAttr(opts.selected || "")}"/>
	<button type="button" data-ba-select-trigger class="ba-select-trigger">
		<span data-ba-select-value>${escapeHtml(displayText)}</span>
		${svgIcon("chevronDown", 12)}
	</button>
	<div data-ba-select-content class="ba-select-content">${items}</div>
</div>`;
}

// --- Checkbox (Radix-style) ---

export interface CheckboxOptions {
	name?: string;
	checked?: boolean;
	label?: string;
	attrs?: string;
}

/**
 * Styled checkbox with indicator. Accessible.
 */
export function checkbox(opts: CheckboxOptions): string {
	const id = opts.name || `cb-${Math.random().toString(36).slice(2, 8)}`;
	return `
<label class="ba-checkbox-label" for="${escapeAttr(id)}">
	<div data-ba-checkbox class="ba-checkbox" role="checkbox" tabindex="0" data-state="${opts.checked ? "checked" : "unchecked"}" aria-checked="${opts.checked ? "true" : "false"}">
		<input type="checkbox" id="${escapeAttr(id)}" name="${escapeAttr(opts.name || "")}" ${opts.checked ? "checked" : ""} class="ba-checkbox-input" ${opts.attrs || ""}/>
		<span data-ba-checkbox-indicator class="ba-checkbox-indicator" ${opts.checked ? "" : "hidden"}>
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
		</span>
	</div>
	${opts.label ? `<span class="ba-checkbox-text">${escapeHtml(opts.label)}</span>` : ""}
</label>`;
}

// --- Password Input with Toggle ---

export interface PasswordInputOptions {
	name?: string;
	placeholder?: string;
	value?: string;
	attrs?: string;
}

/**
 * Password input with show/hide toggle button.
 */
export function passwordInput(opts: PasswordInputOptions): string {
	return `
<div data-ba-password class="ba-password" data-state="hidden">
	<input class="ba-input ba-password-input" type="password" name="${escapeAttr(opts.name || "password")}" placeholder="${escapeAttr(opts.placeholder || "")}" value="${escapeAttr(opts.value || "")}" ${opts.attrs || ""}/>
	<button type="button" data-ba-password-toggle class="ba-password-toggle" aria-label="Show password">
		<svg class="ba-password-eye" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
		<svg class="ba-password-eye-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
	</button>
</div>`;
}

// --- OTP Input ---

export interface OtpInputOptions {
	name?: string;
	length?: number;
	attrs?: string;
}

/**
 * One-time password input with auto-focus between digits.
 */
export function otpInput(opts: OtpInputOptions): string {
	const len = opts.length || 6;
	const slots = Array.from({ length: len })
		.map(() => `<input type="text" class="ba-otp-slot ba-input" />`)
		.join("");
	return `
<div data-ba-otp class="ba-otp" ${opts.attrs || ""}>
	<input type="hidden" name="${escapeAttr(opts.name || "otp")}" />
	${slots}
</div>`;
}

// --- Avatar ---

export function avatar(name: string, imageUrl?: string | null): string {
	if (imageUrl) {
		return `<div class="ba-avatar"><img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(name)}"/></div>`;
	}
	const initials = name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
	return `<div class="ba-avatar">${escapeHtml(initials)}</div>`;
}

// --- Built-in SVG icons ---

const icons: Record<string, string> = {
	shield: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
	users: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
	home: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
	search: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
	moreVertical: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
	activity: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>`,
	settings: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
	x: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
	chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
	chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

export function svgIcon(name: string, size: number = 16): string {
	const svg = icons[name];
	if (!svg) return "";
	return svg.replace(/SIZE/g, String(size));
}
