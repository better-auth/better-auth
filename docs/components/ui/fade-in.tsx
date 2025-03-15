"use client";

import { AnimatePresence as PrimitiveAnimatePresence } from "framer-motion";

export const AnimatePresence = (
	props: React.ComponentPropsWithoutRef<typeof PrimitiveAnimatePresence>,
) => {
	return <PrimitiveAnimatePresence {...props} />;
};
