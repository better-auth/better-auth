"use client";
import { useEffectEvent } from "fumadocs-core/utils/use-effect-event";
import type { MouseEventHandler } from "react";
import { useEffect, useRef, useState } from "react";

export function useCopyButton(
	onCopy: () => void | Promise<void>,
): [checked: boolean, onClick: MouseEventHandler] {
	const [checked, setChecked] = useState(false);
	const timeoutRef = useRef<number | null>(null);

	const onClick: MouseEventHandler = useEffectEvent(() => {
		if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
		const res = Promise.resolve(onCopy());

		void res.then(() => {
			setChecked(true);
			timeoutRef.current = window.setTimeout(() => {
				setChecked(false);
			}, 1500);
		});
	});

	// Avoid updates after being unmounted
	useEffect(() => {
		return () => {
			if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
		};
	}, []);

	return [checked, onClick];
}
