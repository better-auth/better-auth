"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

function scrollToHash(behavior: ScrollBehavior) {
	const hash = window.location.hash;
	if (!hash || hash === "#") return false;
	const id = decodeURIComponent(hash.slice(1));
	if (!id) return false;
	const el = document.getElementById(id);
	if (!el) return false;
	el.scrollIntoView({ behavior, block: "start" });
	return true;
}

/**
 * Hash navigation helpers.
 *
 * CSS `scroll-behavior: smooth` on `html` is avoided because Framer Motion's
 * measureAllKeyframes calls `window.scrollTo` and cancels in-progress browser
 * hash scrolls (especially from external links / reloads).
 */
export function HashSmoothScroll() {
	const pathname = usePathname();

	// Land on the hash target after load/reload (instant).
	useLayoutEffect(() => {
		if (!window.location.hash) return;

		if ("scrollRestoration" in history) {
			history.scrollRestoration = "manual";
		}

		const go = () => {
			scrollToHash("instant");
		};

		go();
		const raf = requestAnimationFrame(() => {
			requestAnimationFrame(go);
		});
		const onLoad = () => go();
		const onPageShow = () => go();
		window.addEventListener("load", onLoad);
		window.addEventListener("pageshow", onPageShow);
		if (document.readyState === "complete") go();

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("load", onLoad);
			window.removeEventListener("pageshow", onPageShow);
		};
	}, [pathname]);

	// Same-page hash clicks keep smooth scrolling via JS.
	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			if (
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			) {
				return;
			}

			const target = event.target;
			if (!(target instanceof Element)) return;

			const anchor = target.closest("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) return;
			if (anchor.target && anchor.target !== "_self") return;

			const url = new URL(anchor.href, window.location.href);
			if (url.origin !== window.location.origin) return;
			if (url.pathname !== window.location.pathname) return;
			if (url.search !== window.location.search) return;
			if (!url.hash || url.hash === "#") return;

			const id = decodeURIComponent(url.hash.slice(1));
			const el = document.getElementById(id);
			if (!el) return;

			event.preventDefault();
			el.scrollIntoView({ behavior: "smooth", block: "start" });
			if (window.location.hash !== url.hash) {
				window.history.pushState(null, "", url.hash);
			}
		};

		document.addEventListener("click", onClick);
		return () => document.removeEventListener("click", onClick);
	}, []);

	return null;
}
