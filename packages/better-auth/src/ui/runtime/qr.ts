/**
 * BROWSER RUNTIME - BUNDLED SEPARATELY.
 * Minimal TOTP QR rendering via `uqr`.
 */

import { renderSVG } from "uqr";

export function mountQr(target: HTMLElement, value: string, size = 180): void {
	const svgMarkup = renderSVG(value, {
		ecc: "M",
		border: 2,
		pixelSize: Math.max(2, Math.floor(size / 40)),
	});
	const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
	const svg = parsed.documentElement;
	if (!(svg instanceof SVGElement) || parsed.querySelector("parsererror")) {
		target.textContent = "Could not render QR code.";
		return;
	}
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", "Authenticator QR code");
	svg.style.color = "currentColor";
	while (target.firstChild) target.removeChild(target.firstChild);
	target.appendChild(document.importNode(svg, true));
}
