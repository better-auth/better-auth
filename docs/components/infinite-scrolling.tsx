"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { Testimonial } from "./testimonial";

export const InfiniteMovingCards = ({
	items,
	direction = "left",
	speed = "fast",
	pauseOnHover = true,
	className,
}: {
	items: Testimonial[];
	direction?: "left" | "right";
	speed?: "fast" | "normal" | "slow";
	pauseOnHover?: boolean;
	className?: string;
}) => {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const scrollerRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		addAnimation();
	}, []);
	const [start, setStart] = useState(false);
	function addAnimation() {
		if (containerRef.current && scrollerRef.current) {
			const scrollerContent = Array.from(scrollerRef.current.children);

			scrollerContent.forEach((item) => {
				const duplicatedItem = item.cloneNode(true);
				if (scrollerRef.current) {
					scrollerRef.current.appendChild(duplicatedItem);
				}
			});

			getDirection();
			getSpeed();
			setStart(true);
		}
	}
	const getDirection = () => {
		if (containerRef.current) {
			if (direction === "left") {
				containerRef.current.style.setProperty(
					"--animation-direction",
					"forwards",
				);
			} else {
				containerRef.current.style.setProperty(
					"--animation-direction",
					"reverse",
				);
			}
		}
	};
	const getSpeed = () => {
		if (containerRef.current) {
			if (speed === "fast") {
				containerRef.current.style.setProperty("--animation-duration", "20s");
			} else if (speed === "normal") {
				containerRef.current.style.setProperty("--animation-duration", "40s");
			} else {
				containerRef.current.style.setProperty("--animation-duration", "80s");
			}
		}
	};
	return (
		<div
			ref={containerRef}
			className={cn(
				"scroller relative z-20  max-w-7xl overflow-hidden  [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]",
				className,
			)}
		>
			<div
				ref={scrollerRef}
				className={cn(
					" flex min-w-full shrink-0 gap-4 py-4 w-max flex-nowrap",
					start && "animate-scroll ",
					pauseOnHover && "hover:[animation-play-state:paused]",
				)}
			>
				{items.map((item) => (
					<a
						key={item.id}
						href={item.link}
						target="_blank"
						className="bg-gray-50 max-w-sm shrink-0 border dark:bg-transparent rounded-lg p-4"
					>
						<span className="flex items-center gap-2">
							<span className="relative">
								<Image
									src={item.avatar}
									alt={item.from}
									width={40}
									height={40}
									className="rounded-full object-cover"
								/>
								<span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-black text-white p-1">
									{item.social === "x" ? (
										<svg
											stroke="currentColor"
											fill="currentColor"
											strokeWidth="0"
											viewBox="0 0 512 512"
											xmlns="http://www.w3.org/2000/svg"
											className="w-full"
										>
											<path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"></path>
										</svg>
									) : (
										<svg
											stroke="currentColor"
											fill="currentColor"
											strokeWidth="0"
											viewBox="0 0 448 512"
											xmlns="http://www.w3.org/2000/svg"
											className="w-full"
										>
											<path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z"></path>
										</svg>
									)}
								</span>
							</span>
							<span>{item.from}</span>
						</span>
						<p className="mt-3 text-neutral-600 dark:text-neutral-200">
							{item.message}
						</p>
					</a>
				))}
			</div>
		</div>
	);
};
