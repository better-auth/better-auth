"use client";

import { useEffect, useRef } from "react";

export function AnchorScroll() {
	const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const isScrollingRef = useRef(false);

	useEffect(() => {
		function calculateScrollOffset() {
			const root = document.documentElement;
			const navHeight = parseInt(
				getComputedStyle(root).getPropertyValue("--fd-nav-height") || "56",
			);
			const bannerHeight = parseInt(
				getComputedStyle(root).getPropertyValue("--fd-banner-height") || "0",
			);
			const tocnavHeight = parseInt(
				getComputedStyle(root).getPropertyValue("--fd-tocnav-height") || "0",
			);

			return navHeight + bannerHeight + tocnavHeight + 24;
		}

		function smoothScrollToElement(element: HTMLElement) {
			if (isScrollingRef.current) return;

			isScrollingRef.current = true;
			document.documentElement.setAttribute("data-anchor-scrolling", "true");

			const elementRect = element.getBoundingClientRect();
			const scrollOffset = calculateScrollOffset();
			const targetPosition =
				window.pageYOffset + elementRect.top - scrollOffset;

			// Simple smooth scroll animation
			const startPosition = window.pageYOffset;
			const distance = targetPosition - startPosition;
			const duration = Math.min(500, Math.abs(distance) * 0.3);
			const startTime = performance.now();

			function animateScroll(currentTime: number) {
				const elapsed = currentTime - startTime;
				const progress = Math.min(elapsed / duration, 1);
				const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
				const currentPosition =
					startPosition + distance * easeOutCubic(progress);

				window.scrollTo(0, currentPosition);

				if (progress < 1) {
					requestAnimationFrame(animateScroll);
				} else {
					document.documentElement.removeAttribute("data-anchor-scrolling");
					isScrollingRef.current = false;
				}
			}

			requestAnimationFrame(animateScroll);
		}

		function handleAnchorScroll() {
			if (window.location.hash) {
				const element = document.getElementById(window.location.hash.slice(1));
				if (element) {
					scrollTimeoutRef.current = setTimeout(
						() => smoothScrollToElement(element),
						100,
					);
				}
			}
		}

		function handleHashChange() {
			const element = document.getElementById(window.location.hash.slice(1));
			if (element) smoothScrollToElement(element);
		}

		function handleAnchorClick(event: Event) {
			const link = (event.target as HTMLElement).closest(
				'a[href^="#"]',
			) as HTMLAnchorElement;

			if (link?.hash) {
				event.preventDefault();
				const element = document.getElementById(link.hash.slice(1));

				if (element) {
					history.pushState(null, "", link.hash);
					smoothScrollToElement(element);
				}
			}
		}

		handleAnchorScroll();
		window.addEventListener("hashchange", handleHashChange);
		document.addEventListener("click", handleAnchorClick);

		return () => {
			if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
			window.removeEventListener("hashchange", handleHashChange);
			document.removeEventListener("click", handleAnchorClick);
		};
	}, []);

	return null;
}
