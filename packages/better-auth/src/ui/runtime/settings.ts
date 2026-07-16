/**
 * BROWSER RUNTIME - BUNDLED SEPARATELY.
 *
 * Settings page runtime: session gate, profile, 2FA, phone, accounts,
 * passkeys, and active sessions.
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

function mutedText(text: string): HTMLParagraphElement {
	const p = document.createElement("p");
	p.className = "ba-settings-muted";
	p.textContent = text;
	return p;
}

function renderUserAvatar(
	image: string | null | undefined,
	name: string,
	email: string,
): HTMLElement {
	const avatar = document.createElement("div");
	avatar.className = "ba-settings-avatar";
	avatar.setAttribute("aria-hidden", "true");

	const label = (name || email || "?").trim();
	const initial = label ? label.charAt(0).toUpperCase() : "?";

	if (typeof image === "string" && image) {
		const img = document.createElement("img");
		img.className = "ba-settings-avatar-img";
		img.src = image;
		img.alt = "";
		img.referrerPolicy = "no-referrer";
		img.addEventListener("error", () => {
			img.remove();
			avatar.textContent = initial;
		});
		avatar.appendChild(img);
	} else {
		avatar.textContent = initial;
	}

	return avatar;
}

function formatMemberSince(value: unknown): string | null {
	if (typeof value !== "string" && !(value instanceof Date)) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function formatRole(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function parseUserAgent(userAgent: string | null | undefined): string {
	if (!userAgent) return "Unknown device";
	const ua = userAgent;
	let os = "Unknown OS";
	if (/Windows NT/i.test(ua)) os = "Windows";
	else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
	else if (/Android/i.test(ua)) os = "Android";
	else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
	else if (/Linux/i.test(ua)) os = "Linux";

	let browser = "Unknown browser";
	if (/Edg\//i.test(ua)) browser = "Edge";
	else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
	else if (/Firefox\//i.test(ua)) browser = "Firefox";
	else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
	else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";

	return `${os}, ${browser}`;
}

function setInputValue(selector: string, value: string): void {
	const input = document.querySelector<HTMLInputElement>(selector);
	if (input) input.value = value;
}

function renderProfile(host: HTMLElement, user: Record<string, unknown>): void {
	const name = typeof user.name === "string" ? user.name : "";
	const email = typeof user.email === "string" ? user.email : "";
	const image = typeof user.image === "string" ? user.image : null;
	const emailVerified = user.emailVerified === true;
	const role = formatRole(user.role);
	const memberSince = formatMemberSince(user.createdAt);

	clearChildren(host);
	host.classList.add("ba-settings-account");
	host.appendChild(renderUserAvatar(image, name, email));

	const meta = document.createElement("div");
	meta.className = "ba-settings-account-meta";
	if (name) {
		const nameEl = document.createElement("p");
		nameEl.className = "ba-settings-account-name";
		nameEl.textContent = name;
		meta.appendChild(nameEl);
	}
	if (email) {
		const emailRow = document.createElement("div");
		emailRow.className = "ba-settings-account-email-row";
		const emailEl = document.createElement("p");
		emailEl.className = "ba-settings-account-email";
		emailEl.textContent = email;
		emailRow.appendChild(emailEl);
		if (emailVerified) {
			const badge = document.createElement("span");
			badge.className = "ba-settings-badge ba-settings-badge-success";
			badge.textContent = "Verified";
			emailRow.appendChild(badge);
		}
		meta.appendChild(emailRow);
	}
	if (!name && !email) {
		meta.appendChild(mutedText("Signed in"));
	}
	host.appendChild(meta);

	const infraHost = document.querySelector<HTMLElement>(
		"[data-ba-settings-profile-infra]",
	);
	if (infraHost) {
		clearChildren(infraHost);
		if (role || memberSince) {
			infraHost.hidden = false;
			infraHost.className = "ba-settings-infra";
			if (role) {
				const item = document.createElement("div");
				item.className = "ba-settings-infra-item";
				const label = document.createElement("p");
				label.className = "ba-settings-infra-label";
				label.textContent = "Role";
				const value = document.createElement("p");
				value.className = "ba-settings-infra-value";
				value.textContent = role;
				item.appendChild(label);
				item.appendChild(value);
				infraHost.appendChild(item);
			}
			if (memberSince) {
				const item = document.createElement("div");
				item.className = "ba-settings-infra-item";
				const label = document.createElement("p");
				label.className = "ba-settings-infra-label";
				label.textContent = "Member Since";
				const value = document.createElement("p");
				value.className = "ba-settings-infra-value";
				value.textContent = memberSince;
				item.appendChild(label);
				item.appendChild(value);
				infraHost.appendChild(item);
			}
		} else {
			infraHost.hidden = true;
		}
	}

	setInputValue("[data-ba-settings-profile-name]", name);
	setInputValue("[data-ba-settings-profile-image]", image ?? "");

	const deleteForm = document.querySelector<HTMLFormElement>(
		"[data-ba-delete-account]",
	);
	if (deleteForm && email) {
		deleteForm.dataset.baExpectedEmail = email;
	}

	const actions = document.querySelector<HTMLElement>(
		"[data-ba-settings-profile-actions]",
	);
	if (actions) actions.hidden = false;
}

function applyTwoFactorState(enabled: boolean): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-two-factor]",
	);
	if (!host) return;
	const disabled = host.querySelector<HTMLElement>(
		'[data-ba-2fa-state="disabled"]',
	);
	const enabledEl = host.querySelector<HTMLElement>(
		'[data-ba-2fa-state="enabled"]',
	);
	if (disabled) disabled.hidden = enabled;
	if (enabledEl) enabledEl.hidden = !enabled;
}

function renderPhone(host: HTMLElement, phone: string | null): void {
	clearChildren(host);
	if (phone) {
		const number = document.createElement("p");
		number.className = "ba-settings-account-name";
		number.textContent = phone;
		host.appendChild(number);
		const hint = mutedText(
			"SMS verification codes can be sent to this number.",
		);
		host.appendChild(hint);
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "ba-button ba-button-outline";
		btn.textContent = "Update Phone Number";
		btn.setAttribute("data-ba-open-dialog", "settings-add-phone");
		host.appendChild(btn);
		setInputValue("[data-ba-settings-phone-input]", phone);
		setInputValue("[data-ba-settings-phone-confirm]", phone);
		return;
	}
	host.appendChild(mutedText("No phone number configured"));
	const add = document.createElement("button");
	add.type = "button";
	add.className = "ba-button ba-button-outline";
	add.setAttribute("data-ba-open-dialog", "settings-add-phone");
	add.textContent = "+ Add Phone Number";
	host.appendChild(add);
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
	const profileHost = document.querySelector<HTMLElement>(
		"[data-ba-settings-profile]",
	);
	const legacyHost = document.querySelector<HTMLElement>(
		"[data-ba-settings-session]",
	);
	const host = profileHost ?? legacyHost;
	if (!host) return;

	void fetch(apiURL("/get-session"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const data = await readPayload(res);
			if (!res.ok || !data || typeof data !== "object") {
				clearChildren(host);
				host.appendChild(mutedText("Could not load account."));
				return;
			}
			const payload = data as Record<string, unknown>;
			const user =
				payload.user && typeof payload.user === "object"
					? (payload.user as Record<string, unknown>)
					: null;
			const session =
				payload.session && typeof payload.session === "object"
					? (payload.session as Record<string, unknown>)
					: null;
			if (!user) {
				clearChildren(host);
				host.appendChild(mutedText("Could not load account."));
				return;
			}

			if (profileHost) {
				renderProfile(profileHost, user);
			} else {
				clearChildren(host);
				host.classList.add("ba-settings-account");
				host.appendChild(
					renderUserAvatar(
						typeof user.image === "string" ? user.image : null,
						typeof user.name === "string" ? user.name : "",
						typeof user.email === "string" ? user.email : "",
					),
				);
				const meta = document.createElement("div");
				meta.className = "ba-settings-account-meta";
				if (typeof user.name === "string" && user.name) {
					const nameEl = document.createElement("p");
					nameEl.className = "ba-settings-account-name";
					nameEl.textContent = user.name;
					meta.appendChild(nameEl);
				}
				if (typeof user.email === "string" && user.email) {
					const emailEl = document.createElement("p");
					emailEl.className = "ba-settings-account-email";
					emailEl.textContent = user.email;
					meta.appendChild(emailEl);
				}
				host.appendChild(meta);
			}

			applyTwoFactorState(user.twoFactorEnabled === true);

			const phoneHost = document.querySelector<HTMLElement>(
				"[data-ba-settings-phone]",
			);
			if (phoneHost) {
				const phone =
					typeof user.phoneNumber === "string" ? user.phoneNumber : null;
				renderPhone(phoneHost, phone);
			}

			const usernameHost = document.querySelector<HTMLElement>(
				"[data-ba-settings-username]",
			);
			if (usernameHost) {
				renderUsername(usernameHost, user);
			}

			const currentSessionId =
				session && typeof session.id === "string" ? session.id : null;
			initSettingsSessions(currentSessionId);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load account."));
		});
}

function renderUsername(
	host: HTMLElement,
	user: Record<string, unknown>,
): void {
	const username = typeof user.username === "string" ? user.username : "";
	const displayUsername =
		typeof user.displayUsername === "string" ? user.displayUsername : "";
	clearChildren(host);
	if (username) {
		const nameEl = document.createElement("p");
		nameEl.className = "ba-settings-account-name";
		nameEl.textContent = `@${username}`;
		host.appendChild(nameEl);
	} else {
		host.appendChild(mutedText("No username set"));
	}
	if (displayUsername && displayUsername !== username) {
		const display = document.createElement("p");
		display.className = "ba-settings-muted";
		display.textContent = displayUsername;
		host.appendChild(display);
	}
	setInputValue("[data-ba-settings-username-input]", username);
	setInputValue("[data-ba-settings-display-username-input]", displayUsername);
}

export function initSettingsAccounts(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-accounts]",
	);
	if (!host) return;

	const rows = Array.from(
		host.querySelectorAll<HTMLElement>("[data-ba-provider-id]"),
	);
	if (rows.length === 0) return;

	void fetch(apiURL("/list-accounts"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			if (!res.ok || !Array.isArray(payload)) {
				showToast("error", "Could not load linked accounts.");
				return;
			}
			const linked = new Set<string>();
			for (const account of payload) {
				if (!account || typeof account !== "object") continue;
				const acc = account as Record<string, unknown>;
				const providerId =
					typeof acc.providerId === "string"
						? acc.providerId
						: typeof acc.provider === "string"
							? acc.provider
							: null;
				if (providerId && providerId !== "credential") {
					linked.add(providerId);
				}
			}

			for (const row of rows) {
				const providerId = row.getAttribute("data-ba-provider-id");
				if (!providerId) continue;
				const isLinked = linked.has(providerId);
				row.setAttribute("data-ba-linked", isLinked ? "true" : "false");
				const status = row.querySelector<HTMLElement>(
					"[data-ba-provider-status]",
				);
				const linkForm = row.querySelector<HTMLElement>(
					"[data-ba-provider-link]",
				);
				const unlinkBtn = row.querySelector<HTMLButtonElement>(
					"[data-ba-provider-unlink]",
				);
				const label =
					row
						.querySelector(".ba-settings-provider-name")
						?.textContent?.trim() || providerId;
				if (status) {
					status.textContent = isLinked ? "Connected" : `Sign in with ${label}`;
				}
				if (linkForm) linkForm.hidden = isLinked;
				if (unlinkBtn) {
					unlinkBtn.hidden = !isLinked;
					unlinkBtn.onclick = () => {
						unlinkBtn.disabled = true;
						void fetch(apiURL("/unlink-account"), {
							method: "POST",
							credentials: "include",
							headers: {
								accept: "application/json",
								"content-type": "application/json",
							},
							body: JSON.stringify({ providerId }),
						})
							.then(async (unlinkRes) => {
								if (unlinkRes.ok) {
									row.setAttribute("data-ba-linked", "false");
									if (status) {
										status.textContent = `Sign in with ${label}`;
									}
									if (linkForm) linkForm.hidden = false;
									unlinkBtn.hidden = true;
									unlinkBtn.disabled = false;
									showToast("success", `Unlinked ${label}.`);
								} else {
									const errPayload = await readPayload(unlinkRes);
									const msg =
										errPayload &&
										typeof errPayload === "object" &&
										typeof (errPayload as Record<string, unknown>).message ===
											"string"
											? ((errPayload as Record<string, unknown>)
													.message as string)
											: `Could not unlink ${label}.`;
									showToast("error", msg);
									unlinkBtn.disabled = false;
								}
							})
							.catch(() => {
								showToast("error", `Could not unlink ${label}.`);
								unlinkBtn.disabled = false;
							});
					};
				}
			}
		})
		.catch(() => {
			showToast("error", "Could not load linked accounts.");
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
				host.appendChild(mutedText("Could not load passkeys."));
				return;
			}
			if (payload.length === 0) {
				clearChildren(host);
				host.appendChild(mutedText("No passkeys registered."));
				return;
			}
			clearChildren(host);
			const list = document.createElement("div");
			list.className = "ba-settings-item-list";

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
				const deviceType =
					typeof pk.deviceType === "string" ? pk.deviceType : null;

				const row = document.createElement("div");
				row.className = "ba-settings-session-row";

				const meta = document.createElement("div");
				meta.className = "ba-settings-session-meta";

				const copy = document.createElement("div");
				copy.className = "ba-settings-session-copy";

				const titleRow = document.createElement("div");
				titleRow.className = "ba-settings-session-title-row";
				const title = document.createElement("p");
				title.className = "ba-settings-session-title";
				title.textContent = name;
				titleRow.appendChild(title);
				if (deviceType && deviceType !== name) {
					const badge = document.createElement("span");
					badge.className = "ba-settings-badge ba-settings-badge-muted";
					badge.textContent = deviceType;
					titleRow.appendChild(badge);
				}
				copy.appendChild(titleRow);

				if (created) {
					const sub = document.createElement("p");
					sub.className = "ba-settings-session-sub";
					sub.textContent = `Added: ${created}`;
					copy.appendChild(sub);
				}
				meta.appendChild(copy);
				row.appendChild(meta);

				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "ba-settings-text-btn ba-settings-text-btn-danger";
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
								if (!host.querySelector(".ba-settings-session-row")) {
									clearChildren(host);
									host.appendChild(mutedText("No passkeys registered."));
								}
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
				list.appendChild(row);
			}
			host.appendChild(list);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load passkeys."));
		});
}

export function initSettingsPhoneSync(): void {
	const sendInput = document.querySelector<HTMLInputElement>(
		"[data-ba-settings-phone-input]",
	);
	const confirmInput = document.querySelector<HTMLInputElement>(
		"[data-ba-settings-phone-confirm]",
	);
	if (!sendInput || !confirmInput) return;
	const sync = () => {
		confirmInput.value = sendInput.value;
	};
	sendInput.addEventListener("input", sync);
	sendInput.addEventListener("change", sync);
	sync();
}

function initSettingsSessions(currentSessionId: string | null): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-sessions]",
	);
	if (!host) return;

	void fetch(apiURL("/list-sessions"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			if (!res.ok || !Array.isArray(payload)) {
				clearChildren(host);
				host.appendChild(mutedText("Could not load sessions."));
				return;
			}
			if (payload.length === 0) {
				clearChildren(host);
				host.appendChild(mutedText("No active sessions."));
				return;
			}
			clearChildren(host);
			const list = document.createElement("div");
			list.className = "ba-settings-item-list";

			for (const item of payload) {
				if (!item || typeof item !== "object") continue;
				const session = item as Record<string, unknown>;
				const id = typeof session.id === "string" ? session.id : "";
				const token = typeof session.token === "string" ? session.token : "";
				const userAgent =
					typeof session.userAgent === "string" ? session.userAgent : null;
				const updatedAt =
					typeof session.updatedAt === "string"
						? session.updatedAt
						: typeof session.createdAt === "string"
							? session.createdAt
							: null;
				const isCurrent = Boolean(currentSessionId && id === currentSessionId);

				const row = document.createElement("div");
				row.className = "ba-settings-session-row";

				const meta = document.createElement("div");
				meta.className = "ba-settings-session-meta";

				const copy = document.createElement("div");
				copy.className = "ba-settings-session-copy";

				const titleRow = document.createElement("div");
				titleRow.className = "ba-settings-session-title-row";
				const title = document.createElement("p");
				title.className = "ba-settings-session-title";
				title.textContent = parseUserAgent(userAgent);
				titleRow.appendChild(title);
				if (isCurrent) {
					const badge = document.createElement("span");
					badge.className = "ba-settings-badge ba-settings-badge-muted";
					badge.textContent = "Current";
					titleRow.appendChild(badge);
				}
				copy.appendChild(titleRow);

				if (updatedAt) {
					const sub = document.createElement("p");
					sub.className = "ba-settings-session-sub";
					const date = new Date(updatedAt);
					sub.textContent = `Last active: ${
						Number.isNaN(date.getTime()) ? updatedAt : date.toLocaleDateString()
					}`;
					copy.appendChild(sub);
				}
				meta.appendChild(copy);
				row.appendChild(meta);

				if (token) {
					const btn = document.createElement("button");
					btn.type = "button";
					btn.className = "ba-settings-text-btn ba-settings-text-btn-danger";
					btn.textContent = isCurrent ? "Sign Out" : "Revoke";
					btn.addEventListener("click", () => {
						btn.disabled = true;
						void fetch(apiURL("/revoke-session"), {
							method: "POST",
							credentials: "include",
							headers: {
								accept: "application/json",
								"content-type": "application/json",
							},
							body: JSON.stringify({ token }),
						})
							.then(async (revokeRes) => {
								if (!revokeRes.ok) {
									const errPayload = await readPayload(revokeRes);
									const msg =
										errPayload &&
										typeof errPayload === "object" &&
										typeof (errPayload as Record<string, unknown>).message ===
											"string"
											? ((errPayload as Record<string, unknown>)
													.message as string)
											: "Could not revoke session.";
									showToast("error", msg);
									btn.disabled = false;
									return;
								}
								if (isCurrent) {
									window.location.href = uiURL("/sign-in");
									return;
								}
								row.remove();
								showToast("success", "Session revoked.");
							})
							.catch(() => {
								showToast("error", "Could not revoke session.");
								btn.disabled = false;
							});
					});
					row.appendChild(btn);
				}

				list.appendChild(row);
			}
			host.appendChild(list);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load sessions."));
		});
}

function renderItemList(
	host: HTMLElement,
	emptyMessage: string,
	rows: Array<{
		title: string;
		subtitle?: string;
		badge?: string;
		onDanger?: () => void;
		dangerLabel?: string;
	}>,
): void {
	clearChildren(host);
	if (rows.length === 0) {
		host.appendChild(mutedText(emptyMessage));
		return;
	}
	const list = document.createElement("div");
	list.className = "ba-settings-item-list";
	for (const item of rows) {
		const row = document.createElement("div");
		row.className = "ba-settings-session-row";
		const meta = document.createElement("div");
		meta.className = "ba-settings-session-meta";
		const copy = document.createElement("div");
		copy.className = "ba-settings-session-copy";
		const titleRow = document.createElement("div");
		titleRow.className = "ba-settings-session-title-row";
		const title = document.createElement("p");
		title.className = "ba-settings-session-title";
		title.textContent = item.title;
		titleRow.appendChild(title);
		if (item.badge) {
			const badge = document.createElement("span");
			badge.className = "ba-settings-badge ba-settings-badge-muted";
			badge.textContent = item.badge;
			titleRow.appendChild(badge);
		}
		copy.appendChild(titleRow);
		if (item.subtitle) {
			const sub = document.createElement("p");
			sub.className = "ba-settings-session-sub";
			sub.textContent = item.subtitle;
			copy.appendChild(sub);
		}
		meta.appendChild(copy);
		row.appendChild(meta);
		if (item.onDanger) {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "ba-settings-text-btn ba-settings-text-btn-danger";
			btn.textContent = item.dangerLabel ?? "Remove";
			btn.addEventListener("click", () => {
				btn.disabled = true;
				item.onDanger?.();
			});
			row.appendChild(btn);
		}
		list.appendChild(row);
	}
	host.appendChild(list);
}

export function initSettingsApiKeys(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-api-keys]",
	);
	if (!host) return;
	void fetch(apiURL("/api-key/list"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			if (!res.ok || !Array.isArray(payload)) {
				clearChildren(host);
				host.appendChild(mutedText("Could not load API keys."));
				return;
			}
			renderItemList(
				host,
				"No API keys yet.",
				payload.flatMap((item) => {
					if (!item || typeof item !== "object") return [];
					const key = item as Record<string, unknown>;
					const id = typeof key.id === "string" ? key.id : "";
					const name =
						typeof key.name === "string" && key.name ? key.name : "API key";
					const created =
						typeof key.createdAt === "string"
							? new Date(key.createdAt).toLocaleDateString()
							: "";
					return [
						{
							title: name,
							subtitle: created ? `Created: ${created}` : undefined,
							onDanger: () => {
								void fetch(apiURL("/api-key/delete"), {
									method: "POST",
									credentials: "include",
									headers: {
										accept: "application/json",
										"content-type": "application/json",
									},
									body: JSON.stringify({ keyId: id }),
								})
									.then(async (delRes) => {
										if (delRes.ok) {
											showToast("success", "API key revoked.");
											initSettingsApiKeys();
										} else {
											showToast("error", "Could not revoke API key.");
										}
									})
									.catch(() => {
										showToast("error", "Could not revoke API key.");
									});
							},
							dangerLabel: "Revoke",
						},
					];
				}),
			);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load API keys."));
		});
}

export function initSettingsOAuthConsents(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-oauth-consents]",
	);
	if (!host) return;
	void fetch(apiURL("/oauth2/get-consents"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			const list = Array.isArray(payload)
				? payload
				: payload &&
						typeof payload === "object" &&
						Array.isArray((payload as Record<string, unknown>).consents)
					? ((payload as Record<string, unknown>).consents as unknown[])
					: null;
			if (!res.ok || !list) {
				clearChildren(host);
				host.appendChild(mutedText("Could not load authorized applications."));
				return;
			}
			renderItemList(
				host,
				"No authorized applications.",
				list.flatMap((item) => {
					if (!item || typeof item !== "object") return [];
					const consent = item as Record<string, unknown>;
					const consentId = typeof consent.id === "string" ? consent.id : "";
					const clientId =
						typeof consent.clientId === "string"
							? consent.clientId
							: typeof consent.client_id === "string"
								? consent.client_id
								: "";
					const name =
						typeof consent.clientName === "string"
							? consent.clientName
							: typeof consent.name === "string"
								? consent.name
								: clientId || "Application";
					return [
						{
							title: name,
							subtitle: clientId && clientId !== name ? clientId : undefined,
							onDanger: () => {
								void fetch(apiURL("/oauth2/delete-consent"), {
									method: "POST",
									credentials: "include",
									headers: {
										accept: "application/json",
										"content-type": "application/json",
									},
									body: JSON.stringify({ id: consentId }),
								})
									.then(async (delRes) => {
										if (delRes.ok) {
											showToast("success", "Access revoked.");
											initSettingsOAuthConsents();
										} else {
											showToast("error", "Could not revoke access.");
										}
									})
									.catch(() => {
										showToast("error", "Could not revoke access.");
									});
							},
							dangerLabel: "Revoke",
						},
					];
				}),
			);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load authorized applications."));
		});
}

export function initSettingsMultiSession(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-multi-session]",
	);
	if (!host) return;
	void fetch(apiURL("/multi-session/list-device-sessions"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			if (!res.ok || !Array.isArray(payload)) {
				clearChildren(host);
				host.appendChild(mutedText("Could not load device accounts."));
				return;
			}
			clearChildren(host);
			if (payload.length === 0) {
				host.appendChild(mutedText("No other accounts on this device."));
				return;
			}
			const list = document.createElement("div");
			list.className = "ba-settings-item-list";
			for (const item of payload) {
				if (!item || typeof item !== "object") continue;
				const entry = item as Record<string, unknown>;
				const user =
					entry.user && typeof entry.user === "object"
						? (entry.user as Record<string, unknown>)
						: null;
				const session =
					entry.session && typeof entry.session === "object"
						? (entry.session as Record<string, unknown>)
						: null;
				const token =
					session && typeof session.token === "string" ? session.token : "";
				const label =
					(user && typeof user.email === "string" && user.email) ||
					(user && typeof user.name === "string" && user.name) ||
					"Account";

				const row = document.createElement("div");
				row.className = "ba-settings-session-row";
				const meta = document.createElement("div");
				meta.className = "ba-settings-session-meta";
				const title = document.createElement("p");
				title.className = "ba-settings-session-title";
				title.textContent = label;
				meta.appendChild(title);
				row.appendChild(meta);

				const actions = document.createElement("div");
				actions.className = "ba-settings-profile-actions";
				actions.hidden = false;

				if (token) {
					const switchBtn = document.createElement("button");
					switchBtn.type = "button";
					switchBtn.className = "ba-button ba-button-outline ba-button-sm";
					switchBtn.textContent = "Switch";
					switchBtn.addEventListener("click", () => {
						switchBtn.disabled = true;
						void fetch(apiURL("/multi-session/set-active"), {
							method: "POST",
							credentials: "include",
							headers: {
								accept: "application/json",
								"content-type": "application/json",
							},
							body: JSON.stringify({ sessionToken: token }),
						})
							.then((setRes) => {
								if (setRes.ok) {
									window.location.reload();
								} else {
									showToast("error", "Could not switch account.");
									switchBtn.disabled = false;
								}
							})
							.catch(() => {
								showToast("error", "Could not switch account.");
								switchBtn.disabled = false;
							});
					});
					actions.appendChild(switchBtn);

					const revokeBtn = document.createElement("button");
					revokeBtn.type = "button";
					revokeBtn.className =
						"ba-settings-text-btn ba-settings-text-btn-danger";
					revokeBtn.textContent = "Remove";
					revokeBtn.addEventListener("click", () => {
						revokeBtn.disabled = true;
						void fetch(apiURL("/multi-session/revoke"), {
							method: "POST",
							credentials: "include",
							headers: {
								accept: "application/json",
								"content-type": "application/json",
							},
							body: JSON.stringify({ sessionToken: token }),
						})
							.then((revokeRes) => {
								if (revokeRes.ok) {
									row.remove();
									showToast("success", "Account removed from this device.");
								} else {
									showToast("error", "Could not remove account.");
									revokeBtn.disabled = false;
								}
							})
							.catch(() => {
								showToast("error", "Could not remove account.");
								revokeBtn.disabled = false;
							});
					});
					actions.appendChild(revokeBtn);
				}
				row.appendChild(actions);
				list.appendChild(row);
			}
			host.appendChild(list);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load device accounts."));
		});
}

export function initSettingsOrganizations(): void {
	const orgHost = document.querySelector<HTMLElement>(
		"[data-ba-settings-organizations]",
	);
	const inviteHost = document.querySelector<HTMLElement>(
		"[data-ba-settings-org-invitations]",
	);
	if (orgHost) {
		void fetch(apiURL("/organization/list"), {
			method: "GET",
			credentials: "include",
			headers: { accept: "application/json" },
		})
			.then(async (res) => {
				const payload = await readPayload(res);
				if (!res.ok || !Array.isArray(payload)) {
					clearChildren(orgHost);
					orgHost.appendChild(mutedText("Could not load organizations."));
					return;
				}
				renderItemList(
					orgHost,
					"You are not a member of any organizations.",
					payload.flatMap((item) => {
						if (!item || typeof item !== "object") return [];
						const org = item as Record<string, unknown>;
						const id = typeof org.id === "string" ? org.id : "";
						const name =
							typeof org.name === "string" ? org.name : "Organization";
						const slug = typeof org.slug === "string" ? org.slug : "";
						return [
							{
								title: name,
								subtitle: slug || undefined,
								onDanger: () => {
									void fetch(apiURL("/organization/leave"), {
										method: "POST",
										credentials: "include",
										headers: {
											accept: "application/json",
											"content-type": "application/json",
										},
										body: JSON.stringify({ organizationId: id }),
									})
										.then((leaveRes) => {
											if (leaveRes.ok) {
												showToast("success", "Left organization.");
												initSettingsOrganizations();
											} else {
												showToast("error", "Could not leave organization.");
											}
										})
										.catch(() => {
											showToast("error", "Could not leave organization.");
										});
								},
								dangerLabel: "Leave",
							},
						];
					}),
				);
			})
			.catch(() => {
				clearChildren(orgHost);
				orgHost.appendChild(mutedText("Could not load organizations."));
			});
	}

	if (inviteHost) {
		void fetch(apiURL("/organization/list-user-invitations"), {
			method: "GET",
			credentials: "include",
			headers: { accept: "application/json" },
		})
			.then(async (res) => {
				const payload = await readPayload(res);
				if (!res.ok || !Array.isArray(payload)) {
					clearChildren(inviteHost);
					inviteHost.appendChild(mutedText("Could not load invitations."));
					return;
				}
				clearChildren(inviteHost);
				if (payload.length === 0) {
					inviteHost.appendChild(mutedText("No pending invitations."));
					return;
				}
				const list = document.createElement("div");
				list.className = "ba-settings-item-list";
				for (const item of payload) {
					if (!item || typeof item !== "object") continue;
					const invite = item as Record<string, unknown>;
					const id =
						typeof invite.id === "string"
							? invite.id
							: typeof invite.invitationId === "string"
								? invite.invitationId
								: "";
					const orgName =
						typeof invite.organizationName === "string"
							? invite.organizationName
							: invite.organization &&
									typeof invite.organization === "object" &&
									typeof (invite.organization as Record<string, unknown>)
										.name === "string"
								? ((invite.organization as Record<string, unknown>)
										.name as string)
								: "Organization";
					const row = document.createElement("div");
					row.className = "ba-settings-session-row";
					const title = document.createElement("p");
					title.className = "ba-settings-session-title";
					title.textContent = orgName;
					row.appendChild(title);
					const actions = document.createElement("div");
					actions.className = "ba-settings-profile-actions";
					actions.hidden = false;
					const accept = document.createElement("button");
					accept.type = "button";
					accept.className = "ba-button ba-button-sm ba-settings-btn-primary";
					accept.textContent = "Accept";
					accept.addEventListener("click", () => {
						accept.disabled = true;
						void fetch(apiURL("/organization/accept-invitation"), {
							method: "POST",
							credentials: "include",
							headers: {
								accept: "application/json",
								"content-type": "application/json",
							},
							body: JSON.stringify({ invitationId: id }),
						})
							.then((acceptRes) => {
								if (acceptRes.ok) {
									showToast("success", "Invitation accepted.");
									initSettingsOrganizations();
								} else {
									showToast("error", "Could not accept invitation.");
									accept.disabled = false;
								}
							})
							.catch(() => {
								showToast("error", "Could not accept invitation.");
								accept.disabled = false;
							});
					});
					const reject = document.createElement("button");
					reject.type = "button";
					reject.className = "ba-settings-text-btn ba-settings-text-btn-danger";
					reject.textContent = "Decline";
					reject.addEventListener("click", () => {
						reject.disabled = true;
						void fetch(apiURL("/organization/reject-invitation"), {
							method: "POST",
							credentials: "include",
							headers: {
								accept: "application/json",
								"content-type": "application/json",
							},
							body: JSON.stringify({ invitationId: id }),
						})
							.then((rejectRes) => {
								if (rejectRes.ok) {
									showToast("success", "Invitation declined.");
									initSettingsOrganizations();
								} else {
									showToast("error", "Could not decline invitation.");
									reject.disabled = false;
								}
							})
							.catch(() => {
								showToast("error", "Could not decline invitation.");
								reject.disabled = false;
							});
					});
					actions.appendChild(accept);
					actions.appendChild(reject);
					row.appendChild(actions);
					list.appendChild(row);
				}
				inviteHost.appendChild(list);
			})
			.catch(() => {
				clearChildren(inviteHost);
				inviteHost.appendChild(mutedText("Could not load invitations."));
			});
	}
}

export function initSettingsStripe(): void {
	const host = document.querySelector<HTMLElement>(
		"[data-ba-settings-stripe-subscription]",
	);
	const returnInput = document.querySelector<HTMLInputElement>(
		"[data-ba-stripe-return-url]",
	);
	if (returnInput) {
		returnInput.value = window.location.href;
	}
	if (!host) return;
	void fetch(apiURL("/subscription/list"), {
		method: "GET",
		credentials: "include",
		headers: { accept: "application/json" },
	})
		.then(async (res) => {
			const payload = await readPayload(res);
			clearChildren(host);
			if (!res.ok) {
				host.appendChild(mutedText("Could not load subscription."));
				return;
			}
			const list = Array.isArray(payload)
				? payload
				: payload &&
						typeof payload === "object" &&
						Array.isArray((payload as Record<string, unknown>).subscriptions)
					? ((payload as Record<string, unknown>).subscriptions as unknown[])
					: [];
			const active = list.find((item) => {
				if (!item || typeof item !== "object") return false;
				const sub = item as Record<string, unknown>;
				return (
					sub.status === "active" ||
					sub.status === "trialing" ||
					sub.status === "past_due"
				);
			}) as Record<string, unknown> | undefined;
			if (!active) {
				host.appendChild(mutedText("No active subscription."));
				return;
			}
			const plan =
				typeof active.plan === "string"
					? active.plan
					: typeof active.planName === "string"
						? active.planName
						: "Subscription";
			const status =
				typeof active.status === "string" ? active.status : "active";
			const title = document.createElement("p");
			title.className = "ba-settings-account-name";
			title.textContent = plan;
			host.appendChild(title);
			const sub = mutedText(`Status: ${status}`);
			host.appendChild(sub);
		})
		.catch(() => {
			clearChildren(host);
			host.appendChild(mutedText("Could not load subscription."));
		});
}
