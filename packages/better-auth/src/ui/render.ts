import type { ThemeConfig, UIComponent, UIProps } from "@better-auth/core";

const voidTags = new Set([
	"input",
	"br",
	"hr",
	"img",
	"meta",
	"link",
	"source",
]);

const tagMap: Record<string, string> = {
	alert: "div",
	badge: "span",
	card: "section",
	"empty-state": "section",
	modal: "div",
	stat: "div",
	tabs: "div",
};

const defaultClasses: Record<string, string> = {
	alert: "ba-alert",
	badge: "ba-badge",
	button: "ba-button",
	card: "ba-card",
	"empty-state": "ba-empty-state",
	form: "ba-form",
	input: "ba-input",
	modal: "ba-modal",
	stat: "ba-stat",
	table: "ba-table",
	tabs: "ba-tabs",
};

const booleanAttributes = new Set([
	"checked",
	"disabled",
	"hidden",
	"multiple",
	"readonly",
	"required",
	"selected",
]);

export function escapeHTML(value: unknown): string {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function toKebabCase(value: string) {
	return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function renderStyleObject(value: Record<string, unknown>) {
	return Object.entries(value)
		.filter(([, styleValue]) => styleValue !== undefined && styleValue !== null)
		.map(([key, styleValue]) => `${toKebabCase(key)}:${String(styleValue)}`)
		.join(";");
}

function renderAttribute(name: string, value: unknown) {
	if (value === undefined || value === null || value === false) {
		return "";
	}
	if (booleanAttributes.has(name)) {
		return value ? ` ${name}` : "";
	}
	if (name === "className") {
		return ` class="${escapeHTML(value)}"`;
	}
	if (name === "style" && typeof value === "object" && !Array.isArray(value)) {
		return ` style="${escapeHTML(renderStyleObject(value as Record<string, unknown>))}"`;
	}
	if (typeof value === "object") {
		return ` data-${escapeHTML(name)}="${escapeHTML(JSON.stringify(value))}"`;
	}
	return ` ${escapeHTML(name)}="${escapeHTML(value)}"`;
}

function mergeClassName(tag: string, props: UIProps | undefined) {
	if (props?.["data-ba-unstyled"]) return props;
	const defaultClass = defaultClasses[tag];
	if (!defaultClass) return props;
	const current = props?.class ?? props?.className;
	return {
		...(props ?? {}),
		class: current ? `${defaultClass} ${String(current)}` : defaultClass,
	};
}

function renderAttributes(component: UIComponent) {
	const props = mergeClassName(component.tag, component.props);
	const attributes: string[] = [];
	for (const [key, value] of Object.entries(props ?? {})) {
		if (key === "children" || key === "dangerouslySetInnerHTML") continue;
		if (key === "enhance") continue;
		if (key === "data-ba-unstyled") continue;
		attributes.push(renderAttribute(key, value));
	}
	if (component.tag === "form" && props?.enhance !== false) {
		attributes.push(renderAttribute("data-ba-enhanced", true));
	}
	if (component.bind) {
		attributes.push(renderAttribute("data-ba-bind", component.bind));
	}
	if (component.when !== undefined) {
		attributes.push(renderAttribute("data-ba-when", component.when));
	}
	if (component.on) {
		for (const [event, action] of Object.entries(component.on)) {
			attributes.push(renderAttribute(`data-ba-on-${event}`, action));
		}
	}
	if (component.tag === "alert" && !props?.role) {
		attributes.push(' role="status"');
	}
	return attributes.join("");
}

export function renderComponent(
	component: UIComponent | string | number | boolean | null | undefined,
): string {
	if (component === undefined || component === null || component === false) {
		return "";
	}
	if (
		typeof component === "string" ||
		typeof component === "number" ||
		typeof component === "boolean"
	) {
		return escapeHTML(component);
	}
	if (component.tag === "fragment") {
		return component.children?.map(renderComponent).join("") ?? "";
	}
	const tag = tagMap[component.tag] ?? component.tag;
	const attrs = renderAttributes(component);
	if (voidTags.has(tag)) {
		return `<${tag}${attrs}>`;
	}
	const children = component.children?.map(renderComponent).join("") ?? "";
	return `<${tag}${attrs}>${children}</${tag}>`;
}

function themeVariables(theme: ThemeConfig) {
	const radius = {
		none: "0",
		sm: "0.25rem",
		md: "0.5rem",
		lg: "0.75rem",
		full: "9999px",
	}[theme.borderRadius ?? "md"];
	// Card/container radius is capped at 1.5rem so containers never become pill-shaped
	// even when the user sets `borderRadius: "full"` for buttons and inputs.
	const radiusCard = {
		none: "0",
		sm: "0.5rem",
		md: "0.75rem",
		lg: "1rem",
		full: "1.5rem",
	}[theme.borderRadius ?? "md"];
	const fontSize = {
		sm: "14px",
		md: "16px",
		lg: "18px",
	}[theme.fontSize ?? "md"];
	return [
		`--ba-primary:${theme.primary}`,
		`--ba-background:${theme.background}`,
		`--ba-surface:${theme.surface}`,
		`--ba-text:${theme.text}`,
		`--ba-text-secondary:${theme.textSecondary}`,
		`--ba-border:${theme.border}`,
		`--ba-error:${theme.error}`,
		`--ba-success:${theme.success}`,
		`--ba-radius:${radius}`,
		`--ba-radius-card:${radiusCard}`,
		`--ba-font-size:${fontSize}`,
		theme.fontFamily ? `--ba-font-family:${theme.fontFamily}` : undefined,
	]
		.filter(Boolean)
		.join(";");
}

function themeStyles(theme: ThemeConfig) {
	const dark = {
		...theme,
		...theme.dark,
	};
	const lightVariables = themeVariables(theme);
	const darkVariables = themeVariables(dark);
	return `
:root{${lightVariables}}
@media (prefers-color-scheme:dark){:root{${darkVariables}}}
`;
}

function faviconLinks(theme: ThemeConfig) {
	const logoUrl = theme.logoUrl;
	if (!logoUrl) return "";
	if (typeof logoUrl === "string") {
		return `<link rel="icon" href="${escapeHTML(logoUrl)}">`;
	}
	return [
		`<link rel="icon" media="(prefers-color-scheme: light)" href="${escapeHTML(logoUrl.light)}">`,
		`<link rel="icon" media="(prefers-color-scheme: dark)" href="${escapeHTML(logoUrl.dark)}">`,
	].join("\n");
}

function baseStyles() {
	return `
*{box-sizing:border-box}
html{font-family:var(--ba-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--ba-font-size);background:var(--ba-background);color:var(--ba-text);color-scheme:light dark}
body{margin:0;min-height:100vh;background:var(--ba-background);color:var(--ba-text)}
a{color:var(--ba-primary);text-decoration:none}
a:hover{text-decoration:underline}
label{display:grid;gap:.5rem;color:var(--ba-text);font-size:.875rem;font-weight:500}
.ba-ui-background{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;isolation:isolate;color:color-mix(in srgb,var(--ba-text-secondary) 42%,transparent)}@media (prefers-color-scheme:dark){.ba-ui-background{color:color-mix(in srgb,var(--ba-border) 65%,transparent)}}
.ba-ui-background *{pointer-events:none!important}
.ba-ui-background>*{position:absolute;inset:0;width:100%;height:100%}
.ba-ui-root{position:relative;z-index:1;min-height:100vh}
.ba-page{min-height:100vh;padding:2rem;display:flex;align-items:center;justify-content:center}
.ba-auth-page{position:relative;isolation:isolate;min-height:100vh;padding:2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;overflow:hidden}
.ba-card{width:100%;max-width:28rem;border:1px solid color-mix(in srgb,var(--ba-border) 88%,transparent);border-radius:var(--ba-radius-card);background:color-mix(in srgb,var(--ba-surface) 96%,transparent);padding:1.5rem;box-shadow:0 18px 60px rgba(0,0,0,.12);filter:drop-shadow(0 16px 32px rgba(0,0,0,.10));backdrop-filter:blur(16px)}
.ba-auth-card{display:grid;gap:1.5rem;max-width:30rem;padding:2rem;border-radius:var(--ba-radius-card);transform:scale(.9);transform-origin:center}
.ba-auth-brand-placement{width:100%;max-width:30rem;display:flex}
.ba-auth-brand-position-top-left,.ba-auth-brand-position-top-right,.ba-auth-brand-position-bottom-left,.ba-auth-brand-position-bottom-right{position:absolute;z-index:2;width:auto;max-width:calc(100vw - 4rem)}
.ba-auth-brand-position-top-left{top:2rem;left:2rem;justify-content:flex-start}
.ba-auth-brand-position-top-right{top:2rem;right:2rem;justify-content:flex-end}
.ba-auth-brand-position-bottom-left{bottom:2rem;left:2rem;justify-content:flex-start}
.ba-auth-brand-position-bottom-right{right:2rem;bottom:2rem;justify-content:flex-end}
.ba-auth-brand-position-top-center,.ba-auth-brand-position-bottom-center{justify-content:center}
.ba-auth-brand{display:flex;align-items:center;justify-content:center;gap:.75rem;font-size:1.125rem;font-weight:700;color:var(--ba-text);cursor:pointer;user-select:none;text-decoration:none}
.ba-auth-brand:hover{text-decoration:none}
.ba-auth-logo{display:inline-flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto}
.ba-auth-logo picture{display:block;width:100%;height:100%}
.ba-auth-logo img{display:block;width:100%;height:100%;object-fit:contain}
.ba-auth-logo[data-size="small"]{width:2rem;height:2rem}
.ba-auth-logo[data-size="medium"]{width:3rem;height:3rem}
.ba-auth-logo[data-size="large"]{width:4rem;height:4rem}
.ba-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.45);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.ba-modal[hidden]{display:none}
.ba-modal-panel{position:relative;display:grid;gap:1rem;width:min(calc(100vw - 2rem),28rem);max-height:calc(100vh - 2rem);overflow:auto;border:1px solid color-mix(in srgb,var(--ba-border) 88%,transparent);border-radius:var(--ba-radius-card);background:var(--ba-surface);color:var(--ba-text);padding:1.5rem;box-shadow:0 24px 80px rgba(0,0,0,.24)}
.ba-dialog-close{position:absolute;top:.875rem;right:.875rem;display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border:0;border-radius:9999px;background:transparent;color:var(--ba-text-secondary);font:inherit;font-size:.875rem;line-height:1;cursor:pointer}
.ba-dialog-close:hover{background:color-mix(in srgb,var(--ba-border) 34%,transparent);color:var(--ba-text)}
.ba-dialog-title{margin:0;padding-right:2rem;font-size:1.125rem;line-height:1.25}
.ba-dialog-description{margin:0;color:var(--ba-text-secondary);font-size:.875rem;line-height:1.5}
.ba-dialog-actions{display:grid;gap:.75rem;margin-top:.25rem}
.ba-auth-header{text-align:center;display:grid;gap:.5rem}
.ba-auth-title{margin:0;font-size:1.35rem;line-height:1.2;letter-spacing:-.02em}
.ba-auth-description{margin:0;color:var(--ba-text-secondary);font-size:.875rem}
.ba-auth-footer{margin:0;text-align:center;color:var(--ba-text-secondary);font-size:.875rem}
.ba-auth-links{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:-.25rem;color:var(--ba-text-secondary);font-size:.8125rem}
.ba-auth-links a{color:inherit}
.ba-auth-credentials{display:grid;gap:.75rem}
.ba-auth-providers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.625rem}
.ba-auth-providers .ba-button{width:100%}
.ba-auth-providers .ba-button:hover{border-color:color-mix(in srgb,var(--ba-primary) 38%,var(--ba-border));background:color-mix(in srgb,var(--ba-primary) 8%,var(--ba-surface));opacity:1}
.ba-form.ba-provider-form{display:contents}
.ba-form.ba-passkey-form{display:grid}
.ba-auth-divider{display:flex;align-items:center;gap:.75rem;color:var(--ba-text-secondary);font-size:.8125rem}
.ba-auth-divider:before,.ba-auth-divider:after{content:"";height:1px;flex:1;background:var(--ba-border)}
.ba-provider-icon{width:1.125rem;height:1.125rem;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
.ba-provider-icon svg,.ba-provider-icon img{display:block;width:100%;height:100%;object-fit:contain}
.ba-provider-icon-light,.ba-provider-icon-dark{display:block;width:100%;height:100%}
.ba-provider-icon-dark{display:none}
@media (prefers-color-scheme:dark){.ba-provider-icon-light{display:none}.ba-provider-icon-dark{display:block}}
.ba-form{display:grid;gap:1rem}
.ba-input,select,textarea{width:100%;border:1px solid color-mix(in srgb,var(--ba-border) 82%,transparent);border-radius:var(--ba-radius);padding:.75rem 1rem;background:color-mix(in srgb,var(--ba-background) 78%,var(--ba-surface));color:var(--ba-text);font:inherit;outline:none;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
.ba-input:focus,select:focus,textarea:focus{border-color:var(--ba-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--ba-primary) 18%,transparent)}
.ba-input[aria-invalid="true"],select[aria-invalid="true"],textarea[aria-invalid="true"]{border-color:var(--ba-error)}
.ba-input[aria-invalid="true"]:focus,select[aria-invalid="true"]:focus,textarea[aria-invalid="true"]:focus{border-color:var(--ba-error);box-shadow:0 0 0 3px color-mix(in srgb,var(--ba-error) 18%,transparent)}
.ba-input::placeholder{color:color-mix(in srgb,var(--ba-text-secondary) 82%,transparent)}
.ba-field-error{margin-top:-.25rem;font-size:.8125rem;line-height:1.35;color:var(--ba-error)}
.ba-button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:1px solid var(--ba-primary);border-radius:var(--ba-radius);background:var(--ba-primary);color:var(--ba-background);padding:.75rem 1rem;font:inherit;font-weight:600;line-height:1;cursor:pointer;text-decoration:none;transition:opacity .15s ease,transform .15s ease,background .15s ease,border-color .15s ease}
.ba-button:hover{opacity:.92;text-decoration:none}
.ba-button:active{transform:translateY(1px)}
.ba-button:disabled{cursor:not-allowed;opacity:.6}
.ba-button-outline{border-color:color-mix(in srgb,var(--ba-border) 58%,transparent);background:transparent;color:var(--ba-text-secondary);font-weight:400}
.ba-button-outline:hover{border-color:color-mix(in srgb,var(--ba-border) 60%,transparent);background:color-mix(in srgb,var(--ba-border) 7%,transparent);color:color-mix(in srgb,var(--ba-text) 82%,var(--ba-text-secondary));opacity:1}
.ba-button-secondary{border-color:var(--ba-border);background:color-mix(in srgb,var(--ba-border) 42%,var(--ba-surface));color:var(--ba-text);font-weight:400}
.ba-button-secondary:hover{border-color:color-mix(in srgb,var(--ba-primary) 10%,var(--ba-border));background:color-mix(in srgb,var(--ba-primary) 3%,var(--ba-border));opacity:1}
.ba-button-full{width:100%}
.ba-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ba-alert{border:1px solid var(--ba-border);border-radius:var(--ba-radius);padding:.75rem 1rem;background:var(--ba-background);color:var(--ba-text)}
.ba-badge{display:inline-flex;border:1px solid var(--ba-border);border-radius:var(--ba-radius);padding:.125rem .5rem;font-size:.75rem;color:var(--ba-text-secondary)}
.ba-table{width:100%;border-collapse:collapse}
.ba-table th,.ba-table td{border-bottom:1px solid var(--ba-border);padding:.75rem;text-align:left}
.ba-empty-state{text-align:center;color:var(--ba-text-secondary);padding:2rem}
.ba-toast-region{position:fixed;inset:auto 1rem 1rem auto;z-index:9999;margin:0;border:0;padding:0;overflow:visible;background:transparent;display:flex;flex-direction:column;gap:.625rem;width:min(22rem,calc(100vw - 2rem));pointer-events:none}
.ba-toast{display:flex;align-items:flex-start;gap:.625rem;border:1px solid color-mix(in srgb,var(--ba-border) 90%,transparent);border-radius:var(--ba-radius-card);background:color-mix(in srgb,var(--ba-surface) 92%,transparent);color:var(--ba-text);box-shadow:0 12px 40px rgba(0,0,0,.22);padding:.75rem .875rem;font-size:.875rem;line-height:1.45;cursor:pointer;-webkit-backdrop-filter:blur(12px) saturate(140%);backdrop-filter:blur(12px) saturate(140%);opacity:0;transform:translateY(.5rem) scale(.98);transition:opacity .2s ease,transform .2s ease}
.ba-toast[data-visible="true"]{opacity:1;transform:translateY(0) scale(1)}
.ba-toast-icon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:1.25rem;height:1.25rem;margin-top:.05rem;border-radius:9999px;font-size:.7rem;font-weight:700;line-height:1;color:#fff;background:var(--ba-text-secondary)}
.ba-toast-icon::before{content:"i"}
.ba-toast-message{flex:1;min-width:0;overflow-wrap:anywhere}
.ba-toast[data-type="error"] .ba-toast-icon{background:var(--ba-error)}
.ba-toast[data-type="error"] .ba-toast-icon::before{content:"\\2715"}
.ba-toast[data-type="success"] .ba-toast-icon{background:var(--ba-success)}
.ba-toast[data-type="success"] .ba-toast-icon::before{content:"\\2713"}
.ba-toast[data-type="warning"] .ba-toast-icon{background:#d97706}
.ba-toast[data-type="warning"] .ba-toast-icon::before{content:"!"}
.ba-form-status,[data-ba-form-status]{display:none!important}
@media (max-width:34rem){.ba-auth-page{padding:1rem}.ba-auth-card{padding:1.25rem}.ba-auth-providers{grid-template-columns:1fr}.ba-auth-links{align-items:flex-start;flex-direction:column}}
`;
}

function usesRuntime(component: UIComponent): boolean {
	if (
		component.tag === "form" ||
		component.bind ||
		component.when ||
		component.on
	) {
		return true;
	}
	return (
		component.children?.some((child) => {
			return typeof child === "object" && child !== null && usesRuntime(child);
		}) ?? false
	);
}

export function renderDocument(options: {
	component: UIComponent;
	title: string;
	theme: ThemeConfig;
	runtimePath: string;
	apiBaseURL?: string | undefined;
	uiBasePath?: string | undefined;
	background?: string | undefined;
}) {
	const runtimeScript = usesRuntime(options.component)
		? `<script type="module" src="${escapeHTML(options.runtimePath)}"></script>`
		: "";
	const background = options.background
		? `<div class="ba-ui-background" aria-hidden="true">${options.background}</div>`
		: "";
	const favicon = faviconLinks(options.theme);
	const title = options.theme.appName
		? `${options.title} - ${options.theme.appName}`
		: options.title;
	return `<!doctype html>
<html lang="en" data-ba-theme-mode="system" data-ba-api-base="${escapeHTML(options.apiBaseURL ?? "")}" data-ba-ui-base="${escapeHTML(options.uiBasePath ?? "")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
${favicon}
<style>${themeStyles(options.theme)}${baseStyles()}</style>
${runtimeScript}
</head>
<body>${background}<div class="ba-ui-root">${renderComponent(options.component)}</div></body>
</html>`;
}
