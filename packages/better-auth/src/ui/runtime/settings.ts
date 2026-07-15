/**
 * BROWSER RUNTIME - BUNDLED SEPARATELY.
 *
 * Settings page runtime: session gate, accounts list, passkeys list.
 *
 * After editing, regenerate the bundle:
 *   pnpm --filter better-auth build:ui-runtime
 */

import { getBase, joinPath, readPayload, showToast } from "./forms";

function apiURL(path: string): string {
	return joinPath(getBase("data-ba-api-base"), path);
}

function uiURL(path: string): string {
	return joinPath(getBase("data-ba-ui-base"), path);
}

function clearChildren(el: HTMLElement): void {
	while (el.firstChild) el.removeChild(el.firstChild);
}

function descriptionParagraph(text: string): HTMLParagraphElement {
	const p = document.createElement("p");
	p.className = "ba-auth-description";
	p.textContent = text;
	return p;
}

export function initSessionGate(): void {
	const gate = document.querySelector<HTMLElement>("[data-ba-require-session]");
	if (!gate) return;
	void fetch(apiURL("/get-session"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then((res) => readPayload(res).then((data) => ({ ok: res.ok, data })))
		.then(({ ok, data }) => {
			if (!ok || !data || typeof data !== "object") {
				window.location.href = uiURL("/sign-in");
			}
		})
		.catch(() => {
			window.location.href = uiURL("/sign-in");
		});
}

export function initSettingsSession(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-session]",
	);
	if (!host) return;
	void fetch(apiURL("/get-session"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then((res) => readPayload(res))
		.then((data) => {
			if (!data || typeof data !== "object") return;
			const session = data as Record<string, unknown>;
			const user = session.user as Record<string, unknown> | undefined;
			if (!user) return;
			const name = typeof user.name === "string" ? user.name : "";
			const email = typeof user.email === "string" ? user.email : "";
			const lines: string[] = [];
			if (name) lines.push(name);
			if (email) lines.push(email);
			if (lines.length > 0) {
				clearChildren(host);
				for (const line of lines) {
					host.appendChild(descriptionParagraph(line));
				}
			}
		})
		.catch(() => {});
}

export function initSettingsAccounts(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-accounts]",
	);
	if (!host) return;
	void fetch(apiURL("/list-accounts"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			if (!res.ok || !Array.isArray(payload)) {
				clearChildren(host);
				host.appendChild(
					descriptionParagraph("Could not load linked accounts."),
				);
				return;
			}
			if (payload.length === 0) {
				clearChildren(host);
				host.appendChild(descriptionParagraph("No linked accounts."));
				return;
			}
			clearChildren(host);
			for (const account of payload) {
				if (!account || typeof account !== "object") continue;
				const acc = account as Record<string, unknown>;
				const provider =
					typeof acc.provider === "string" ? acc.provider : "unknown";
				const accountId =
					typeof acc.accountId === "string" ? acc.accountId : "";

				const row = document.createElement("div");
				row.className = "ba-settings-account-row";

				const label = document.createElement("span");
				label.className = "ba-settings-account-label";
				label.textContent = provider + (accountId ? ` (${accountId})` : "");
				row.appendChild(label);

				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "ba-button ba-button-outline ba-button-sm";
				btn.textContent = "Unlink";
				btn.addEventListener("click", () => {
					btn.disabled = true;
					void fetch(apiURL("/unlink-account"), {
						method: "POST",
						credentials: "include",
						headers: {
							accept: "application/json",
							"content-type": "application/json",
						},
						body: JSON.stringify({ providerId: provider }),
					})
						.then(async (unlinkRes) => {
							if (unlinkRes.ok) {
								row.remove();
								showToast("success", `Unlinked ${provider}.`);
							} else {
								const errPayload = await readPayload(unlinkRes);
								const msg =
									errPayload &&
									typeof errPayload === "object" &&
									typeof (errPayload as Record<string, unknown>).message ===
										"string"
										? ((errPayload as Record<string, unknown>)
												.message as string)
										: `Could not unlink ${provider}.`;
								showToast("error", msg);
								btn.disabled = false;
							}
						})
						.catch(() => {
							showToast("error", `Could not unlink ${provider}.`);
							btn.disabled = false;
						});
				});
				row.appendChild(btn);
				host.appendChild(row);
			}
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(descriptionParagraph("Could not load linked accounts."));
		});
}

export function initSettingsPasskeys(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-passkeys]",
	);
	if (!host) return;
	void fetch(apiURL("/passkey/list-user-passkeys"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			if (!res.ok || !Array.isArray(payload)) {
				clearChildren(host);
				host.appendChild(descriptionParagraph("Could not load passkeys."));
				return;
			}
			if (payload.length === 0) {
				clearChildren(host);
				host.appendChild(descriptionParagraph("No passkeys registered."));
				return;
			}
			clearChildren(host);
			for (const passkey of payload) {
				if (!passkey || typeof passkey !== "object") continue;
				const pk = passkey as Record<string, unknown>;
				const id = typeof pk.id === "string" ? pk.id : "";
				const name =
					typeof pk.name === "string"
						? pk.name
						: typeof pk.deviceType === "string"
							? pk.deviceType
							: "Passkey";
				const created =
					typeof pk.createdAt === "string"
						? new Date(pk.createdAt).toLocaleDateString()
						: "";

				const row = document.createElement("div");
				row.className = "ba-settings-account-row";

				const label = document.createElement("span");
				label.className = "ba-settings-account-label";
				label.textContent = name + (created ? ` \u2014 ${created}` : "");
				row.appendChild(label);

				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "ba-button ba-button-outline ba-button-sm";
				btn.textContent = "Delete";
				btn.addEventListener("click", () => {
					btn.disabled = true;
					void fetch(apiURL("/passkey/delete-passkey"), {
						method: "POST",
						credentials: "include",
						headers: {
							accept: "application/json",
							"content-type": "application/json",
						},
						body: JSON.stringify({ id }),
					})
						.then(async (delRes) => {
							if (delRes.ok) {
								row.remove();
								showToast("success", "Passkey deleted.");
							} else {
								const errPayload = await readPayload(delRes);
								const msg =
									errPayload &&
									typeof errPayload === "object" &&
									typeof (errPayload as Record<string, unknown>).message ===
										"string"
										? ((errPayload as Record<string, unknown>)
												.message as string)
										: "Could not delete passkey.";
								showToast("error", msg);
								btn.disabled = false;
							}
						})
						.catch(() => {
							showToast("error", "Could not delete passkey.");
							btn.disabled = false;
						});
				});
				row.appendChild(btn);
				host.appendChild(row);
			}
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(descriptionParagraph("Could not load passkeys."));
		});
}
