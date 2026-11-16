"use client";

import { useEffect, useState } from "react";

/**
 * Marks the page once React has hydrated, so tests submit server-action forms
 * over RSC instead of as native form posts.
 */
export function Hydrated() {
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	return hydrated ? <span data-hydrated hidden /> : null;
}
