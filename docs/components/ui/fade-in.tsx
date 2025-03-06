"use client";

import {
	AnimatePresence as PrimitiveAnimatePresence,
	motion,
	useReducedMotion,
} from "framer-motion";
import { createContext, useContext } from "react";

const FadeInStaggerContext = createContext(false);

const viewport = { once: true, margin: "0px 0px -200px" };

export const FadeIn = ({
	fromtoptobottom,
	...props // Destructure fromtoptobottom and collect remaining props
}: React.ComponentPropsWithoutRef<typeof motion.div> & {
	fromtoptobottom?: boolean;
}) => {
	const shouldReduceMotion = useReducedMotion();
	const isInStaggerGroup = useContext(FadeInStaggerContext);

	return (
		<motion.div
			variants={{
				hidden: {
					opacity: 0,
					y: shouldReduceMotion ? 0 : fromtoptobottom ? -24 : 2,
				},
				visible: { opacity: 1, y: 0 },
			}}
			transition={{ duration: 0.3 }}
			{...(isInStaggerGroup
				? {}
				: {
						initial: "hidden",
						whileInView: "visible",
						viewport,
					})}
			{...props} // Spread the remaining props, excluding fromtoptobottom
		/>
	);
};

// Rest of the code remains the same
export const FadeInStagger = ({
	faster = false,
	...props
}: React.ComponentPropsWithoutRef<typeof motion.div> & {
	faster?: boolean;
}) => {
	return (
		<FadeInStaggerContext.Provider value={true}>
			<motion.div
				initial="hidden"
				whileInView="visible"
				viewport={viewport}
				transition={{ staggerChildren: faster ? 0.08 : 0.2 }}
				{...props}
			/>
		</FadeInStaggerContext.Provider>
	);
};

export const AnimatePresence = (
	props: React.ComponentPropsWithoutRef<typeof PrimitiveAnimatePresence>,
) => {
	return <PrimitiveAnimatePresence {...props} />;
};
