"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function UpgradeButton() {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<motion.button
			className="relative overflow-hidden px-6 py-3 rounded-md bg-gradient-to-r from-gray-900 to-black text-white font-bold text-lg shadow-lg transition-all duration-300 ease-out transform hover:scale-105 hover:shadow-xl"
			onHoverStart={() => setIsHovered(true)}
			onHoverEnd={() => setIsHovered(false)}
			whileHover={{ scale: 1.05 }}
			whileTap={{ scale: 0.95 }}
		>
			<span className="relative z-10 flex items-center justify-center">
				<Sparkles className="w-5 h-5 mr-2" />
				Upgrade to Pro
			</span>
			<motion.div
				className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-700"
				initial={{ opacity: 0 }}
				animate={{ opacity: isHovered ? 1 : 0 }}
				transition={{ duration: 0.3 }}
			/>
			<motion.div
				className="absolute inset-0 bg-white opacity-10"
				initial={{ scale: 0, x: "100%", y: "100%" }}
				animate={{ scale: isHovered ? 2 : 0, x: "0%", y: "0%" }}
				transition={{ duration: 0.4, ease: "easeOut" }}
				style={{ borderRadius: "2px" }}
			/>
		</motion.button>
	);
}
