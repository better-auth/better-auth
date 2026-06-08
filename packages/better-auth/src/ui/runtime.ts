export const uiRuntime = `
const read = (el) => el.type === "checkbox" ? el.checked : el.value;
const state = new Map();
let toastRegion;

function ensureToastRegion() {
  if (toastRegion) return toastRegion;
  toastRegion = document.createElement("div");
  toastRegion.className = "ba-toast-region";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-atomic", "true");
  document.body.appendChild(toastRegion);
  return toastRegion;
}

function showToast(type, message) {
  if (!message) return;
  const region = ensureToastRegion();
  const toast = document.createElement("div");
  toast.className = "ba-toast";
  toast.dataset.type = type || "info";
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "ba-toast-icon";
  icon.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "ba-toast-message";
  body.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(body);
  region.appendChild(toast);

  requestAnimationFrame(() => {
    toast.dataset.visible = "true";
  });

  let removed = false;
  const dismiss = () => {
    if (removed) return;
    removed = true;
    toast.dataset.visible = "false";
    window.setTimeout(() => toast.remove(), 220);
  };
  toast.addEventListener("click", dismiss);
  window.setTimeout(dismiss, 5000);
}

function getBase(name) {
  return document.documentElement.getAttribute(name) || "";
}

function joinPath(base, path) {
  if (!base) return path;
  if (/^https?:\\/\\//.test(path)) return path;
  return base.replace(/\\/$/, "") + "/" + path.replace(/^\\//, "");
}

function restoreDescribedBy(input) {
  const original = input.getAttribute("data-ba-describedby-original");
  if (original === null) {
    input.removeAttribute("aria-describedby");
    return;
  }
  if (original) input.setAttribute("aria-describedby", original);
  else input.removeAttribute("aria-describedby");
}

function clearFieldError(input) {
  const id = input.getAttribute("data-ba-field-error-id");
  if (id) {
    document.getElementById(id)?.remove();
  }
  input.removeAttribute("data-ba-field-error-id");
  input.removeAttribute("aria-invalid");
  restoreDescribedBy(input);
}

function clearFieldErrors(form) {
  form.querySelectorAll(".ba-field-error").forEach((el) => el.remove());
  form.querySelectorAll("[data-ba-field-error-id]").forEach((input) => {
    input.removeAttribute("data-ba-field-error-id");
    input.removeAttribute("aria-invalid");
    restoreDescribedBy(input);
  });
}

function clearLegacyFormStatus(form) {
  form.querySelectorAll(".ba-form-status,[data-ba-form-status]").forEach((el) => {
    el.remove();
  });
}

function setFieldError(input, message) {
  clearFieldError(input);
  const fieldName = input.getAttribute("name") || input.id || "field";
  const id = "ba-field-error-" + fieldName.replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + Math.random().toString(36).slice(2);
  const error = document.createElement("div");
  error.id = id;
  error.className = "ba-field-error";
  error.textContent = message;
  input.insertAdjacentElement("afterend", error);
  if (!input.hasAttribute("data-ba-describedby-original")) {
    input.setAttribute("data-ba-describedby-original", input.getAttribute("aria-describedby") || "");
  }
  const describedBy = [input.getAttribute("data-ba-describedby-original"), id].filter(Boolean).join(" ");
  input.setAttribute("aria-describedby", describedBy);
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("data-ba-field-error-id", id);
}

function isValidatableControl(el) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return false;
  if (el.disabled) return false;
  if (el instanceof HTMLInputElement && ["button", "submit", "reset", "hidden"].includes(el.type)) return false;
  return typeof el.checkValidity === "function";
}

function getValidationMessage(control) {
  const validity = control.validity;
  if (validity.valueMissing) return "This field is required.";
  if (validity.tooShort && control.minLength > -1) return "Must be at least " + control.minLength + " characters.";
  if (validity.tooLong && control.maxLength > -1) return "Must be at most " + control.maxLength + " characters.";
  if (validity.typeMismatch && control.type === "email") return "Enter a valid email address.";
  if (validity.rangeUnderflow) return "Value is too low.";
  if (validity.rangeOverflow) return "Value is too high.";
  if (validity.stepMismatch) return "Enter a valid value.";
  if (validity.patternMismatch) return "Enter a valid value.";
  return control.validationMessage || "Please check this field.";
}

function validateForm(form) {
  clearFieldErrors(form);
  let firstInvalid = null;
  for (const control of form.querySelectorAll("input,select,textarea")) {
    if (!isValidatableControl(control)) continue;
    if (control.checkValidity()) continue;
    if (!firstInvalid) firstInvalid = control;
    setFieldError(control, getValidationMessage(control));
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  return true;
}

function coerceFormValue(input, value) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") return value === "" ? undefined : Number(value);
  return value;
}

function formToJSON(form) {
  const body = {};
  const data = new FormData(form);
  for (const [key, value] of data.entries()) {
    const input = form.elements.namedItem(key);
    if (value instanceof File) continue;
    if (input instanceof RadioNodeList) {
      body[key] = value;
      continue;
    }
    body[key] = input instanceof HTMLInputElement ? coerceFormValue(input, value) : value;
  }
  for (const input of form.querySelectorAll("input[type='checkbox'][name]")) {
    if (!data.has(input.name)) body[input.name] = false;
  }
  return body;
}

function getMessage(payload, fallback) {
  if (!payload) return fallback;
	if (typeof payload === "string") return fallback;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error.message === "string") return payload.error.message;
  if (typeof payload.code === "string") return payload.code;
  return fallback;
}

async function readPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) return null;
  if (!contentType.includes("json")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseEffects(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function getEffectTarget(target) {
  if (typeof target !== "string" || !target) return null;
  return document.getElementById(target) || document.querySelector("[data-ba-panel='" + CSS.escape(target) + "']");
}

function openDialog(target) {
  const dialog = getEffectTarget(target);
  if (!dialog) return;
  dialog.hidden = false;
  if (dialog instanceof HTMLDialogElement && typeof dialog.showModal === "function" && !dialog.open) {
    dialog.showModal();
  }
}

function closeDialog(target) {
  const dialog = getEffectTarget(target);
  if (!dialog) return;
  if (dialog instanceof HTMLDialogElement && typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  }
  dialog.hidden = true;
}

async function executeEffects(effects, payload, fallbackType, fallbackMessage) {
  if (!effects.length) {
    showToast(fallbackType, getMessage(payload, fallbackMessage));
    return;
  }
  for (const effect of effects) {
    if (!effect || typeof effect !== "object") continue;
    if (effect.type === "toast") {
      showToast(effect.level || fallbackType || "info", effect.message || fallbackMessage);
    }
    if (effect.type === "toastFromError") {
      showToast("error", getMessage(payload, effect.fallback || fallbackMessage));
    }
    if (effect.type === "redirect" || effect.type === "navigate") {
      window.location.href = effect.url || effect.to;
      return;
    }
    if (effect.type === "reload") {
      window.location.reload();
      return;
    }
    if (effect.type === "show") {
      const target = getEffectTarget(effect.target);
      if (target) target.hidden = false;
    }
    if (effect.type === "hide") {
      const target = getEffectTarget(effect.target);
      if (target) target.hidden = true;
    }
    if (effect.type === "openDialog") {
      openDialog(effect.target);
    }
    if (effect.type === "closeDialog") {
      closeDialog(effect.target);
    }
    if (effect.type === "set" && typeof effect.key === "string") {
      updateBindings(effect.key, effect.value);
    }
    if (effect.type === "replace" && typeof effect.target === "string" && typeof effect.html === "string") {
      const target = document.querySelector(effect.target);
      if (target) target.innerHTML = effect.html;
    }
  }
}

function resolveActionURL(form) {
  const action = form.getAttribute("action") || window.location.href;
  const kind = form.getAttribute("data-ba-action-kind");
  if (kind === "auth-route") {
    return joinPath(getBase("data-ba-api-base"), action);
  }
  if (kind === "server-action") {
    return joinPath(getBase("data-ba-ui-base"), action);
  }
  return action;
}

function appendFormQuery(url, form) {
  const next = new URL(url, window.location.href);
  const body = formToJSON(form);
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) next.searchParams.set(key, String(value));
  }
  return next;
}

function base64URLToBuffer(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64URL(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

function publicKeyCredentialRequestOptions(options) {
  return {
    ...options,
    challenge: base64URLToBuffer(options.challenge),
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((credential) => ({
          ...credential,
          id: base64URLToBuffer(credential.id),
        }))
      : undefined,
  };
}

function authenticationCredentialToJSON(credential) {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferToBase64URL(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    response: {
      authenticatorData: bufferToBase64URL(response.authenticatorData),
      clientDataJSON: bufferToBase64URL(response.clientDataJSON),
      signature: bufferToBase64URL(response.signature),
      userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : undefined,
    },
  };
}

async function handlePasskeySubmit(form, submitter, successEffects, errorEffects, pendingMessage, errorMessage) {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    const message = "Passkeys are not supported in this browser.";
    await executeEffects(errorEffects, { message }, "error", message);
    return;
  }

  const verifyPath = form.getAttribute("data-ba-passkey-verify");
  if (!verifyPath) {
    const message = "Passkey verification route is not configured.";
    await executeEffects(errorEffects, { message }, "error", message);
    return;
  }

  form.setAttribute("aria-busy", "true");
  if (submitter && "disabled" in submitter) submitter.disabled = true;

  try {
    const generateURL = appendFormQuery(resolveActionURL(form), form);
    const optionsResponse = await fetch(generateURL, {
      method: "GET",
      credentials: "include",
      headers: { "accept": "application/json" },
    });
    const options = await readPayload(optionsResponse);
    if (!optionsResponse.ok || !options) {
      const message = getMessage(options, errorMessage);
      await executeEffects(errorEffects, options, "error", message);
      return;
    }

    const credential = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions(options),
    });
    if (!credential) {
      const message = "Passkey sign in was cancelled.";
      await executeEffects(errorEffects, { message }, "error", message);
      return;
    }

    const { clientExtensionResults, ...response } = authenticationCredentialToJSON(credential);
    void clientExtensionResults;
    const verifyResponse = await fetch(joinPath(getBase("data-ba-api-base"), verifyPath), {
      method: "POST",
      credentials: "include",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ response }),
    });
    const payload = await readPayload(verifyResponse);
    if (!verifyResponse.ok) {
      const message = getMessage(payload, errorMessage);
      await executeEffects(errorEffects, payload, "error", message);
      return;
    }

    await executeEffects(successEffects, payload, "success", "Passkey verified.");
  } catch (error) {
    const message = error instanceof Error ? error.message : errorMessage;
    await executeEffects(errorEffects, { message }, "error", message);
  } finally {
    form.removeAttribute("aria-busy");
    if (submitter && "disabled" in submitter) submitter.disabled = false;
  }
}

function updateBindings(key, value) {
  state.set(key, value);
  document.querySelectorAll("[data-ba-bind='" + CSS.escape(key) + "']").forEach((el) => {
    if (el.type === "checkbox") el.checked = Boolean(value);
    else if ("value" in el) el.value = value == null ? "" : String(value);
  });
  document.querySelectorAll("[data-ba-when]").forEach((el) => {
    try {
      const condition = JSON.parse(el.getAttribute("data-ba-when") || "false");
      if (typeof condition === "boolean") {
        el.hidden = !condition;
        return;
      }
      const current = state.get(condition.bind);
      el.hidden = condition.equals !== undefined ? current !== condition.equals : current === condition.not;
    } catch {
      el.hidden = false;
    }
  });
}

document.querySelectorAll("[data-ba-bind]").forEach((el) => {
  const key = el.getAttribute("data-ba-bind");
  if (!key) return;
  state.set(key, read(el));
  el.addEventListener("input", () => updateBindings(key, read(el)));
  el.addEventListener("change", () => updateBindings(key, read(el)));
});

document.querySelectorAll("form[data-ba-enhanced]").forEach((form) => {
  form.noValidate = true;
  clearLegacyFormStatus(form);
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!isValidatableControl(target)) return;
  if (!target.closest("form[data-ba-enhanced]")) return;
  if (target.checkValidity()) clearFieldError(target);
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!isValidatableControl(target)) return;
  if (!target.closest("form[data-ba-enhanced]")) return;
  if (target.checkValidity()) clearFieldError(target);
});

document.addEventListener("click", async (event) => {
  const closeTarget = event.target instanceof Element ? event.target.closest("[data-ba-dialog-close]") : null;
  if (closeTarget) {
    event.preventDefault();
    closeDialog(closeTarget.getAttribute("data-ba-dialog-close"));
    return;
  }
  const target = event.target instanceof Element ? event.target.closest("[data-ba-on-click]") : null;
  if (!target) return;
  const action = JSON.parse(target.getAttribute("data-ba-on-click") || "{}");
  if (action.type === "navigate") {
    window.location.href = action.to;
  }
  if (action.type !== "server") return;
  event.preventDefault();
  const response = await fetch(window.location.pathname.replace(/\\/$/, "") + "/_ba/action/" + encodeURIComponent(action.id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ params: action.params || {} }),
  });
  const effects = await response.json().catch(() => []);
  await executeEffects(Array.isArray(effects) ? effects : [effects], null, "info", "Completed successfully.");
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-ba-enhanced]")) return;
  event.preventDefault();
  form.noValidate = true;
  clearLegacyFormStatus(form);

  const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
  const method = (form.getAttribute("method") || "GET").toUpperCase();
  const action = resolveActionURL(form);
  const successMessage = form.getAttribute("data-ba-success") || "Completed successfully.";
  const pendingMessage = form.getAttribute("data-ba-pending") || "Submitting...";
  const errorMessage = form.getAttribute("data-ba-error") || "Something went wrong.";
  const successEffects = parseEffects(form.getAttribute("data-ba-success-effects"));
  const errorEffects = parseEffects(form.getAttribute("data-ba-error-effects"));

  if (!validateForm(form)) {
    return;
  }

  if (form.matches("[data-ba-passkey-auth]")) {
    await handlePasskeySubmit(form, submitter, successEffects, errorEffects, pendingMessage, errorMessage);
    return;
  }

  form.setAttribute("aria-busy", "true");
  if (submitter && "disabled" in submitter) submitter.disabled = true;

  try {
    const url = new URL(action, window.location.href);
    const init = {
      method,
      credentials: "include",
      headers: {
        "accept": "application/json",
      },
    };

    if (method === "GET") {
      const body = formToJSON(form);
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    } else {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(formToJSON(form));
    }

    const response = await fetch(url, init);
    const payload = await readPayload(response);

    if (!response.ok) {
      const message = getMessage(payload, errorMessage);
      await executeEffects(errorEffects, payload, "error", message);
      return;
    }

    if (payload && payload.redirect === true && typeof payload.url === "string") {
      window.location.href = payload.url;
      return;
    }

    if (payload && payload.twoFactorRedirect === true) {
      openDialog("two-factor-challenge");
      form.dispatchEvent(new CustomEvent("better-auth:two-factor-required", { bubbles: true, detail: payload }));
      return;
    }

    const message = getMessage(payload, successMessage);
    await executeEffects(successEffects, payload, "success", message);
    form.dispatchEvent(new CustomEvent("better-auth:form-success", { bubbles: true, detail: payload }));
  } catch (error) {
    const message = error instanceof Error ? error.message : errorMessage;
    showToast("error", message);
  } finally {
    form.removeAttribute("aria-busy");
    if (submitter && "disabled" in submitter) submitter.disabled = false;
  }
});
`;
