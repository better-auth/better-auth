"use client";

import { useSyncExternalStore } from "react";

export type MobileNavigationView = "closed" | "docs" | "site";

let mobileNavigationView: MobileNavigationView = "closed";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot() {
	return mobileNavigationView;
}

function getServerSnapshot(): MobileNavigationView {
	return "closed";
}

export function setMobileNavigationView(view: MobileNavigationView) {
	if (mobileNavigationView === view) return;
	mobileNavigationView = view;
	for (const listener of listeners) listener();
}

export function useMobileNavigationView() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
