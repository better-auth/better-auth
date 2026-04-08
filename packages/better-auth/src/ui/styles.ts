/**
 * Better Auth UI - Design System
 *
 * Inspired by the Better Auth infrastructure dashboard.
 * OKLCH color tokens, Geist typography, zero-radius technical aesthetic.
 */
export function getStyles(): string {
	return `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--ba-bg:#ffffff;--ba-fg:oklch(0.141 0.005 285.823);
--ba-card:oklch(1 0 0);--ba-card-fg:oklch(0.141 0.005 285.823);
--ba-muted:oklch(0.967 0.001 286.375);--ba-muted-fg:oklch(0.552 0.016 285.938);
--ba-border:oklch(0.92 0.004 286.32 / 50%);
--ba-border-strong:oklch(0.92 0.004 286.32);
--ba-primary:oklch(0.21 0.006 285.885);--ba-primary-fg:oklch(0.985 0 0);
--ba-danger:oklch(0.577 0.245 27.325);--ba-danger-fg:#fff;--ba-danger-bg:oklch(0.95 0.02 27);
--ba-success:#8EBC18;--ba-success-fg:#fff;--ba-success-bg:oklch(0.95 0.05 130);
--ba-warning:oklch(0.828 0.189 84.429);--ba-warning-fg:#000;--ba-warning-bg:oklch(0.95 0.05 84);
--ba-accent:oklch(0.967 0.001 286.375);
--ba-ring:oklch(0.705 0.015 286.067);
--ba-font:'Geist',ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
--ba-font-mono:'Geist Mono',ui-monospace,SFMono-Regular,monospace;
--ba-radius:0px;
--ba-shadow:0px 1px 2px 0px hsl(0 0% 0%/0.09);
--ba-shadow-md:0px 1px 2px 0px hsl(0 0% 0%/0.18),0px 2px 4px -1px hsl(0 0% 0%/0.18);
--ba-transition:150ms cubic-bezier(0.4,0,0.2,1);
}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){
--ba-bg:#000000;--ba-fg:oklch(0.985 0 0);
--ba-card:oklch(0.1 0.006 285.8);--ba-card-fg:oklch(0.985 0 0);
--ba-muted:oklch(0.274 0.006 286.033);--ba-muted-fg:oklch(0.705 0.015 286.067);
--ba-border:oklch(1 0 0 / 10%);--ba-border-strong:oklch(1 0 0 / 15%);
--ba-primary:oklch(0.92 0.004 286.32);--ba-primary-fg:oklch(0.21 0.006 285.885);
--ba-danger:oklch(0.704 0.191 22.216);--ba-danger-bg:oklch(0.15 0.03 22);
--ba-success:#8EBC18;--ba-success-bg:oklch(0.15 0.04 130);
--ba-warning:oklch(0.828 0.189 84.429);--ba-warning-bg:oklch(0.15 0.04 84);
--ba-accent:oklch(0.274 0.006 286.033);
--ba-ring:oklch(0.552 0.016 285.938);
--ba-shadow:0px 1px 2px 0px hsl(0 0% 0%/0.3);
--ba-shadow-md:0px 1px 2px 0px hsl(0 0% 0%/0.3),0px 2px 4px -1px hsl(0 0% 0%/0.3);
}}
:root[data-theme="dark"]{
--ba-bg:#000000;--ba-fg:oklch(0.985 0 0);
--ba-card:oklch(0.1 0.006 285.8);--ba-card-fg:oklch(0.985 0 0);
--ba-muted:oklch(0.274 0.006 286.033);--ba-muted-fg:oklch(0.705 0.015 286.067);
--ba-border:oklch(1 0 0 / 10%);--ba-border-strong:oklch(1 0 0 / 15%);
--ba-primary:oklch(0.92 0.004 286.32);--ba-primary-fg:oklch(0.21 0.006 285.885);
--ba-danger:oklch(0.704 0.191 22.216);--ba-danger-bg:oklch(0.15 0.03 22);
--ba-success:#8EBC18;--ba-success-bg:oklch(0.15 0.04 130);
--ba-warning:oklch(0.828 0.189 84.429);--ba-warning-bg:oklch(0.15 0.04 84);
--ba-accent:oklch(0.274 0.006 286.033);
--ba-ring:oklch(0.552 0.016 285.938);
--ba-shadow:0px 1px 2px 0px hsl(0 0% 0%/0.3);
--ba-shadow-md:0px 1px 2px 0px hsl(0 0% 0%/0.3),0px 2px 4px -1px hsl(0 0% 0%/0.3);
}
body{font-family:var(--ba-font);color:var(--ba-fg);background:var(--ba-bg);line-height:1.5;-webkit-font-smoothing:antialiased;font-size:14px}

/* Shell */
.ba-shell{display:flex;flex-direction:column;min-height:100vh}
.ba-topbar{
position:fixed;top:0;left:0;right:0;z-index:40;
height:3.125rem;display:flex;align-items:center;justify-content:space-between;
padding:0 1.5rem;border-bottom:1px solid var(--ba-border);
background:var(--ba-bg);backdrop-filter:blur(12px);
}
.ba-topbar-brand{display:flex;align-items:center;gap:0.5rem;font-weight:500;font-size:0.8125rem}
.ba-body{margin-top:3.125rem;margin-bottom:3.5rem;flex:1;padding:0 1.5rem;overflow-y:auto}
.ba-bottomnav{
position:fixed;bottom:0;left:0;right:0;z-index:40;
height:3.5rem;display:flex;align-items:stretch;
border-top:1px solid var(--ba-border);background:var(--ba-bg);
}
.ba-bottomnav-items{display:flex;align-items:stretch;flex:1;overflow-x:auto}
.ba-bottomnav-item{
display:flex;align-items:center;gap:0.5rem;
padding:0 1.25rem;font-family:var(--ba-font-mono);font-size:0.875rem;
color:var(--ba-muted-fg);text-decoration:none;cursor:pointer;
border-right:1px solid var(--ba-border);white-space:nowrap;
transition:color var(--ba-transition);
background:none;border-top:none;border-left:none;
border-bottom:2px solid transparent;position:relative;
}
.ba-bottomnav-item::after{
content:"";position:absolute;bottom:-1px;left:0;width:0;height:2px;
background:var(--ba-fg);transition:width 0.25s ease;
}
.ba-bottomnav-item:hover::after{width:100%}
.ba-bottomnav-item:hover{color:var(--ba-fg)}
.ba-bottomnav-item[data-active="true"]{color:var(--ba-fg)}
.ba-bottomnav-item[data-active="true"]::after{width:100%;left:0}
.ba-bottomnav-num{font-size:0.75rem;opacity:0.4;font-weight:300}
.ba-bottomnav-profile{
margin-left:auto;display:flex;align-items:center;gap:0.625rem;
padding:0 1rem;border-left:1px solid var(--ba-border);font-size:0.8125rem;
}
.ba-bottomnav-profile-name{font-weight:500;font-size:0.75rem}
.ba-bottomnav-profile-email{font-size:0.6875rem;color:var(--ba-muted-fg)}

/* Content */
.ba-content{padding:0.5rem 0}
.ba-page-header{padding:0.375rem 0;margin-bottom:0.5rem}
.ba-page-title{font-weight:500;font-size:1.125rem;letter-spacing:-0.01em}
.ba-page-desc{font-size:0.75rem;color:var(--ba-muted-fg);margin-top:0.0625rem}

/* Cards */
.ba-card{
background:var(--ba-card);border:1px solid var(--ba-border);
border-radius:var(--ba-radius);overflow:hidden;
}
.ba-card-header{
display:flex;align-items:center;justify-content:space-between;
padding:0 0.75rem;height:2.25rem;
border-bottom:1px solid var(--ba-border);
background:oklch(0.97 0.001 286 / 80%);
}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .ba-card-header{background:oklch(0.06 0.003 286 / 80%)}}
:root[data-theme="dark"] .ba-card-header{background:oklch(0.06 0.003 286 / 80%)}
.ba-card-title{font-weight:500;font-size:0.75rem;color:var(--ba-muted-fg)}
.ba-card-body{padding:0.75rem}

/* Stat cards (infra style) */
.ba-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.5rem;margin-bottom:1rem}
.ba-stat{
border:1px solid var(--ba-border);border-radius:var(--ba-radius);
display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;
}
.ba-stat-header{
display:flex;align-items:center;justify-content:space-between;
padding:0 0.75rem;height:2.25rem;
border-bottom:1px solid var(--ba-border);
background:oklch(0.97 0.001 286 / 80%);
}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .ba-stat-header{background:oklch(0.06 0.003 286 / 80%)}}
:root[data-theme="dark"] .ba-stat-header{background:oklch(0.06 0.003 286 / 80%)}
.ba-stat-label{font-size:0.75rem;font-weight:500;color:var(--ba-muted-fg)}
.ba-stat-body{padding:0.75rem}
.ba-stat-value{font-size:1.5rem;font-weight:400;letter-spacing:-0.025em;margin-top:0.25rem}
.ba-stat-desc{font-size:0.6875rem;color:var(--ba-muted-fg)}
.ba-stat-trend{
display:flex;align-items:center;justify-content:flex-end;
padding:0.5rem 0.75rem;font-size:0.6875rem;
}
.ba-stat-trend.positive{color:var(--ba-success)}
.ba-stat-trend.negative{color:var(--ba-danger)}

/* Table */
.ba-table-wrap{border:1px solid var(--ba-border);border-radius:var(--ba-radius);overflow:hidden}
.ba-table{width:100%;border-collapse:collapse;font-size:0.8125rem}
.ba-table th{
text-align:left;padding:0 0.75rem;height:2.25rem;font-weight:500;font-size:0.6875rem;
text-transform:uppercase;letter-spacing:0.05em;color:var(--ba-muted-fg);
background:oklch(0.97 0.001 286 / 80%);border-bottom:1px solid var(--ba-border);
white-space:nowrap;
}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .ba-table th{background:oklch(0.06 0.003 286 / 80%)}}
:root[data-theme="dark"] .ba-table th{background:oklch(0.06 0.003 286 / 80%)}
.ba-table td{padding:0.375rem 0.75rem;border-bottom:1px solid var(--ba-border);vertical-align:middle}
.ba-table tr:last-child td{border-bottom:none}
.ba-table tr:hover td{background:var(--ba-accent)}
.ba-table-empty{text-align:center;padding:2rem 0.75rem;color:var(--ba-muted-fg)}
.ba-table-toolbar{
display:flex;align-items:center;justify-content:space-between;gap:0.75rem;
padding:0.5rem 0.75rem;border-bottom:1px solid var(--ba-border);flex-wrap:wrap;
}
.ba-table-footer{
display:flex;align-items:center;justify-content:space-between;
padding:0.5rem 0.75rem;border-top:1px solid var(--ba-border);font-size:0.75rem;
color:var(--ba-muted-fg);
}

/* Buttons */
.ba-btn{
display:inline-flex;align-items:center;justify-content:center;gap:0.375rem;
padding:0.375rem 0.75rem;border-radius:var(--ba-radius);font-size:0.75rem;
font-weight:500;cursor:pointer;transition:all var(--ba-transition);
border:1px solid var(--ba-border);text-decoration:none;white-space:nowrap;
font-family:inherit;line-height:1.25;background:var(--ba-bg);color:var(--ba-fg);
}
.ba-btn:hover:not(:disabled){background:var(--ba-accent)}
.ba-btn:disabled{opacity:0.4;cursor:not-allowed}
.ba-btn-primary{background:var(--ba-primary);color:var(--ba-primary-fg);border-color:var(--ba-primary)}
.ba-btn-primary:hover:not(:disabled){opacity:0.9}
.ba-btn-secondary{background:var(--ba-bg);color:var(--ba-fg);border-color:var(--ba-border)}
.ba-btn-danger{background:var(--ba-danger);color:var(--ba-danger-fg);border-color:var(--ba-danger)}
.ba-btn-danger:hover:not(:disabled){opacity:0.9}
.ba-btn-ghost{background:transparent;color:var(--ba-muted-fg);border-color:transparent}
.ba-btn-ghost:hover:not(:disabled){background:var(--ba-accent);color:var(--ba-fg)}
.ba-btn-sm{padding:0.25rem 0.5rem;font-size:0.6875rem}
.ba-btn-icon{padding:0.25rem;width:1.75rem;height:1.75rem}

/* Badge */
.ba-badge{
display:inline-flex;align-items:center;padding:0.0625rem 0.375rem;
border-radius:9999px;font-size:0.6875rem;font-weight:500;
border:1px solid transparent;
}
.ba-badge-default{background:var(--ba-muted);color:var(--ba-muted-fg)}
.ba-badge-success{background:var(--ba-success-bg);color:var(--ba-success)}
.ba-badge-danger{background:var(--ba-danger-bg);color:var(--ba-danger)}
.ba-badge-warning{background:var(--ba-warning-bg);color:var(--ba-warning)}

/* Input */
.ba-input{
width:100%;padding:0.375rem 0.5rem;border:1px solid var(--ba-border-strong);
border-radius:var(--ba-radius);font-size:0.8125rem;background:var(--ba-bg);
color:var(--ba-fg);transition:border-color var(--ba-transition);
font-family:inherit;outline:none;
}
.ba-input:focus{border-color:var(--ba-ring)}
.ba-input::placeholder{color:var(--ba-muted-fg);opacity:0.6}
.ba-input-sm{padding:0.25rem 0.5rem;font-size:0.75rem}
.ba-select{
appearance:none;padding-right:1.75rem;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
background-repeat:no-repeat;background-position:right 0.4rem center;
}
.ba-label{display:block;font-size:0.75rem;font-weight:500;margin-bottom:0.25rem}
.ba-field{margin-bottom:0.75rem}

/* Dialog primitive */
.ba-dialog-root{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center}
.ba-dialog-root[data-state="open"]{display:flex}
.ba-dialog-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px)}
.ba-dialog-content{
position:relative;z-index:1;
background:var(--ba-bg);border:1px solid var(--ba-border);
border-radius:var(--ba-radius);box-shadow:var(--ba-shadow-md);
max-width:26rem;width:calc(100% - 2rem);max-height:90vh;overflow-y:auto;
}

/* Dropdown primitive */
.ba-dropdown-menu{
position:fixed;z-index:50;
background:var(--ba-bg);border:1px solid var(--ba-border);
border-radius:var(--ba-radius);box-shadow:var(--ba-shadow-md);
min-width:10rem;padding:0.25rem;
}
.ba-dropdown-menu[data-state="closed"]{display:none}
.ba-dropdown-item{
display:block;width:100%;text-align:left;padding:0.375rem 0.5rem;
font-size:0.75rem;border-radius:var(--ba-radius);cursor:pointer;
background:none;border:none;color:var(--ba-fg);font-family:inherit;
transition:background var(--ba-transition);outline:none;
}
.ba-dropdown-item:hover,.ba-dropdown-item:focus{background:var(--ba-accent)}
.ba-dropdown-item.danger{color:var(--ba-danger)}
.ba-dropdown-separator{border:none;border-top:1px solid var(--ba-border);margin:0.25rem 0}

/* Tabs primitive */
.ba-tablist{
display:flex;border-bottom:1px solid var(--ba-border);
}
.ba-tab{
padding:0.5rem 0.75rem;font-size:0.75rem;font-weight:500;
background:none;border:none;border-bottom:2px solid transparent;
color:var(--ba-muted-fg);cursor:pointer;font-family:inherit;
transition:all var(--ba-transition);outline:none;margin-bottom:-1px;
}
.ba-tab:hover{color:var(--ba-fg)}
.ba-tab[data-state="active"]{color:var(--ba-fg);border-bottom-color:var(--ba-fg)}
.ba-tabpanel{padding:0.75rem 0}
.ba-tabpanel[data-state="inactive"]{display:none}

/* Accordion primitive */
.ba-accordion{border:1px solid var(--ba-border);border-radius:var(--ba-radius);overflow:hidden}
.ba-accordion-item{border-bottom:1px solid var(--ba-border)}
.ba-accordion-item:last-child{border-bottom:none}
.ba-accordion-trigger{
display:flex;align-items:center;justify-content:space-between;width:100%;
padding:0.625rem 0.75rem;font-size:0.8125rem;font-weight:500;
background:none;border:none;color:var(--ba-fg);cursor:pointer;
font-family:inherit;text-align:left;transition:background var(--ba-transition);
}
.ba-accordion-trigger:hover{background:var(--ba-accent)}
.ba-accordion-chevron{transition:transform var(--ba-transition);color:var(--ba-muted-fg)}
.ba-accordion-trigger[aria-expanded="true"] .ba-accordion-chevron{transform:rotate(90deg)}
.ba-accordion-content{padding:0 0.75rem 0.75rem;font-size:0.8125rem;color:var(--ba-muted-fg)}
.ba-accordion-content[data-state="closed"]{display:none}

/* Popover primitive */
.ba-popover-content{
position:fixed;z-index:50;
background:var(--ba-bg);border:1px solid var(--ba-border);
border-radius:var(--ba-radius);box-shadow:var(--ba-shadow-md);
min-width:12rem;padding:0.75rem;
}
.ba-popover-content[data-state="closed"]{display:none}

/* Tooltip */
.ba-tooltip{
position:fixed;z-index:60;
background:var(--ba-primary);color:var(--ba-primary-fg);
padding:0.25rem 0.5rem;font-size:0.6875rem;font-family:var(--ba-font);
border-radius:var(--ba-radius);pointer-events:none;white-space:nowrap;
box-shadow:var(--ba-shadow);
}
.ba-tooltip[data-state="closed"],.ba-tooltip[hidden]{display:none}

/* Switch */
.ba-switch-label{display:inline-flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.8125rem}
.ba-switch{
position:relative;width:2.25rem;height:1.25rem;
border-radius:9999px;background:var(--ba-border-strong);
transition:background var(--ba-transition);flex-shrink:0;
}
.ba-switch[data-state="checked"]{background:var(--ba-primary)}
.ba-switch-input{position:absolute;opacity:0;width:0;height:0}
.ba-switch-thumb{
position:absolute;top:0.125rem;left:0.125rem;
width:1rem;height:1rem;border-radius:9999px;
background:var(--ba-bg);box-shadow:var(--ba-shadow);
transition:transform var(--ba-transition);
}
.ba-switch[data-state="checked"] .ba-switch-thumb{transform:translateX(1rem)}
.ba-switch-text{color:var(--ba-fg);user-select:none}

/* Custom Select */
.ba-custom-select{position:relative;display:inline-block}
.ba-select-trigger{
display:inline-flex;align-items:center;justify-content:space-between;gap:0.5rem;
width:100%;padding:0.375rem 0.5rem;border:1px solid var(--ba-border-strong);
border-radius:var(--ba-radius);font-size:0.8125rem;background:var(--ba-bg);
color:var(--ba-fg);cursor:pointer;font-family:inherit;text-align:left;
}
.ba-select-trigger:focus{border-color:var(--ba-ring);outline:none}
.ba-select-content{
position:fixed;z-index:50;
background:var(--ba-bg);border:1px solid var(--ba-border);
border-radius:var(--ba-radius);box-shadow:var(--ba-shadow-md);
min-width:10rem;padding:0.25rem;max-height:16rem;overflow-y:auto;
}
.ba-select-content[data-state="closed"]{display:none}
.ba-select-item{
padding:0.375rem 0.5rem;font-size:0.8125rem;cursor:pointer;
border-radius:var(--ba-radius);transition:background var(--ba-transition);outline:none;
}
.ba-select-item:hover,.ba-select-item:focus{background:var(--ba-accent)}
.ba-select-item[data-selected="true"]{font-weight:500}

/* Checkbox */
.ba-checkbox-label{display:inline-flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.8125rem}
.ba-checkbox{
position:relative;width:1rem;height:1rem;
border:1px solid var(--ba-border-strong);border-radius:var(--ba-radius);
background:var(--ba-bg);display:flex;align-items:center;justify-content:center;
transition:all var(--ba-transition);flex-shrink:0;
}
.ba-checkbox[data-state="checked"]{background:var(--ba-primary);border-color:var(--ba-primary)}
.ba-checkbox-input{position:absolute;opacity:0;width:0;height:0}
.ba-checkbox-indicator{color:var(--ba-primary-fg);display:flex;align-items:center;justify-content:center}
.ba-checkbox-text{color:var(--ba-fg);user-select:none}

/* Password */
.ba-password{position:relative;display:flex;align-items:center}
.ba-password-input{padding-right:2.25rem;width:100%}
.ba-password-toggle{
position:absolute;right:0.375rem;padding:0.25rem;
background:none;border:none;cursor:pointer;color:var(--ba-muted-fg);
display:flex;align-items:center;border-radius:var(--ba-radius);
}
.ba-password-toggle:hover{color:var(--ba-fg)}
.ba-password[data-state="hidden"] .ba-password-eye-off{display:none}
.ba-password[data-state="visible"] .ba-password-eye{display:none}

/* OTP */
.ba-otp{display:flex;gap:0.375rem}
.ba-otp-slot{
width:2.25rem;height:2.5rem;text-align:center;
font-size:1rem;font-family:var(--ba-font-mono);font-weight:500;
}

/* Toast */
.ba-toast-container{
position:fixed;bottom:1rem;right:1rem;z-index:100;
display:flex;flex-direction:column-reverse;gap:0.5rem;
pointer-events:none;max-width:22rem;
}
.ba-toast{
pointer-events:auto;
background:var(--ba-card);border:1px solid var(--ba-border);
border-radius:var(--ba-radius);box-shadow:var(--ba-shadow-md);
padding:0.625rem 0.75rem;font-size:0.8125rem;
display:flex;align-items:center;justify-content:space-between;gap:0.5rem;
transform:translateX(100%);opacity:0;
transition:transform 0.2s ease,opacity 0.2s ease;
}
.ba-toast[data-state="open"]{transform:translateX(0);opacity:1}
.ba-toast[data-state="closed"]{transform:translateX(100%);opacity:0}
.ba-toast-success{border-left:3px solid var(--ba-success)}
.ba-toast-danger{border-left:3px solid var(--ba-danger)}
.ba-toast-warning{border-left:3px solid var(--ba-warning)}
.ba-toast-close{
background:none;border:none;cursor:pointer;color:var(--ba-muted-fg);
font-size:1rem;padding:0;line-height:1;flex-shrink:0;
}
.ba-modal-header{
padding:0 0.75rem;height:2.5rem;border-bottom:1px solid var(--ba-border);
display:flex;align-items:center;justify-content:space-between;
}
.ba-modal-title{font-size:0.8125rem;font-weight:600}
.ba-modal-body{padding:0.75rem}
.ba-modal-footer{
padding:0.5rem 0.75rem;border-top:1px solid var(--ba-border);
display:flex;justify-content:flex-end;gap:0.375rem;
}

/* Avatar */
.ba-avatar{
width:1.75rem;height:1.75rem;border-radius:9999px;
background:var(--ba-muted);display:flex;align-items:center;
justify-content:center;font-size:0.625rem;font-weight:600;
color:var(--ba-muted-fg);overflow:hidden;flex-shrink:0;
}
.ba-avatar img{width:100%;height:100%;object-fit:cover}

/* Utilities */
.ba-flex{display:flex}.ba-items-center{align-items:center}.ba-gap-2{gap:0.5rem}.ba-gap-3{gap:0.75rem}
.ba-justify-between{justify-content:space-between}
.ba-text-sm{font-size:0.8125rem}.ba-text-xs{font-size:0.6875rem}
.ba-text-muted{color:var(--ba-muted-fg)}
.ba-font-mono{font-family:var(--ba-font-mono)}
.ba-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.ba-hidden{display:none}
.ba-text-right{text-align:right}
.ba-text-center{text-align:center}

/* Responsive */
@media(max-width:640px){
.ba-body{padding:0 0.75rem}
.ba-stats{grid-template-columns:1fr 1fr}
.ba-page-title{font-size:1.125rem}
.ba-bottomnav-num{display:none}
}

/* Marquee */
.ba-marquee{overflow:hidden;white-space:nowrap;border-top:1px solid var(--ba-border);border-bottom:1px solid var(--ba-border);padding:0.375rem 0;font-size:0.6875rem;position:relative}
.ba-marquee::before,.ba-marquee::after{content:"";position:absolute;top:0;bottom:0;width:3rem;z-index:1;pointer-events:none}
.ba-marquee::before{left:0;background:linear-gradient(to right,var(--ba-bg),transparent)}
.ba-marquee::after{right:0;background:linear-gradient(to left,var(--ba-bg),transparent)}
.ba-marquee-track{display:inline-flex;gap:1.5rem;animation:ba-marquee 30s linear infinite}
.ba-marquee-item{white-space:nowrap}
@keyframes ba-marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

/* Location list */
.ba-location-item{padding:0.625rem 0.75rem;transition:background var(--ba-transition)}
.ba-location-item:hover{background:var(--ba-accent)}
.ba-location-item.ba-location-placeholder{opacity:0.4}
.ba-location-row{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.25rem}
.ba-location-rank{font-size:0.625rem;font-weight:500;color:var(--ba-muted-fg);width:1.25rem;flex-shrink:0}
.ba-location-name{font-size:0.6875rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-location-value{font-size:0.6875rem;font-weight:600;font-variant-numeric:tabular-nums}
.ba-location-pct{font-size:0.625rem;font-variant-numeric:tabular-nums;color:var(--ba-muted-fg);width:2.5rem;text-align:right}
.ba-location-bar-track{margin-left:1.75rem;height:3px;background:var(--ba-muted);border-radius:9999px;overflow:hidden}
.ba-location-bar-fill{height:100%;border-radius:9999px;background:oklch(0.585 0.233 277);transition:width 0.3s ease}
.ba-location-bar-fill.placeholder{background:var(--ba-border-strong)}

/* Scrollbar */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--ba-border-strong);border-radius:2px}
`;
}
