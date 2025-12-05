"use client";

import NumberFlow from "@number-flow/react";
import { CheckIcon } from "@radix-ui/react-icons";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { client } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const media = window.matchMedia(query);
		if (media.matches !== matches) {
			setMatches(media.matches);
		}

		const listener = () => setMatches(media.matches);
		media.addListener(listener);

		return () => media.removeListener(listener);
	}, [query]);

	return matches;
}

interface PricingPlan {
	name: string;
	price: string;
	yearlyPrice: string;
	period: string;
	features: string[];
	description: string;
	buttonText: string;
	href: string;
	isPopular: boolean;
}

interface PricingProps {
	plans: PricingPlan[];
	title?: string;
	description?: string;
}

export function Pricing({
	plans,
	title = "Simple, Transparent Pricing",
	description = "Choose the plan that works for you",
}: PricingProps) {
	const [isMonthly, setIsMonthly] = useState(true);
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const switchRef = useRef<HTMLButtonElement>(null);

	const handleToggle = (checked: boolean) => {
		setIsMonthly(!checked);
		if (checked && switchRef.current) {
			const rect = switchRef.current.getBoundingClientRect();
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;

			confetti({
				particleCount: 50,
				spread: 60,
				origin: {
					x: x / window.innerWidth,
					y: y / window.innerHeight,
				},
				colors: [
					"hsl(var(--primary))",
					"hsl(var(--accent))",
					"hsl(var(--secondary))",
					"hsl(var(--muted))",
				],
				ticks: 200,
				gravity: 1.2,
				decay: 0.94,
				startVelocity: 30,
				shapes: ["circle"],
			});
		}
	};

	return (
		<div className="container py-4">
			<div className="text-center space-y-4 mb-3">
				<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
					{title}
				</h2>
				<p className="text-muted-foreground  whitespace-pre-line">
					{description}
				</p>
			</div>

			<div className="flex justify-center mb-10">
				<label className="relative inline-flex items-center cursor-pointer">
					<Label>
						<Switch
							ref={switchRef as any}
							checked={!isMonthly}
							onCheckedChange={handleToggle}
							className="relative"
						/>
					</Label>
				</label>
				<span className="ml-2 font-semibold">
					Annual billing <span className="text-primary">(Save 20%)</span>
				</span>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 sm:2 gap-4">
				{plans.map((plan, index) => (
					<motion.div
						key={index}
						initial={{ y: 50, opacity: 1 }}
						whileInView={
							isDesktop
								? {
										y: plan.isPopular ? -20 : 0,
										opacity: 1,
										x: index === 2 ? -30 : index === 0 ? 30 : 0,
										scale: index === 0 || index === 2 ? 0.94 : 1.0,
									}
								: {}
						}
						viewport={{ once: true }}
						transition={{
							duration: 1.6,
							type: "spring",
							stiffness: 100,
							damping: 30,
							delay: 0.4,
							opacity: { duration: 0.5 },
						}}
						className={cn(
							`rounded-sm border p-6 bg-background text-center lg:flex lg:flex-col lg:justify-center relative`,
							plan.isPopular ? "border-border border-2" : "border-border",
							"flex flex-col",
							!plan.isPopular && "mt-5",
							index === 0 || index === 2
								? "z-0 transform translate-x-0 translate-y-0 -translate-z-[50px] rotate-y-10"
								: "z-10",
							index === 0 && "origin-right",
							index === 2 && "origin-left",
						)}
					>
						{plan.isPopular && (
							<div className="absolute top-0 right-0 bg-primary py-0.5 px-2 rounded-bl-sm rounded-tr-sm flex items-center">
								<Star className="text-primary-foreground h-4 w-4 fill-current" />
								<span className="text-primary-foreground ml-1 font-sans font-semibold">
									Popular
								</span>
							</div>
						)}
						<div className="flex-1 flex flex-col">
							<p className="text-base font-semibold text-muted-foreground mt-2">
								{plan.name}
							</p>
							<div className="mt-6 flex items-center justify-center gap-x-2">
								<span className="text-5xl font-bold tracking-tight text-foreground">
									<NumberFlow
										value={
											isMonthly ? Number(plan.price) : Number(plan.yearlyPrice)
										}
										format={{
											style: "currency",
											currency: "USD",
											minimumFractionDigits: 0,
											maximumFractionDigits: 0,
										}}
										transformTiming={{
											duration: 500,
											easing: "ease-out",
										}}
										willChange
										className="font-variant-numeric: tabular-nums"
									/>
								</span>
								{plan.period !== "Next 3 months" && (
									<span className="text-sm font-semibold leading-6 tracking-wide text-muted-foreground">
										/ {plan.period}
									</span>
								)}
							</div>

							<p className="text-xs leading-5 text-muted-foreground">
								{isMonthly ? "billed monthly" : "billed annually"}
							</p>

							<ul className="mt-5 gap-2 flex flex-col">
								{plan.features.map((feature, idx) => (
									<li key={idx} className="flex items-start gap-2">
										<CheckIcon className="h-4 w-4 text-primary mt-1 shrink-0" />
										<span className="text-left">{feature}</span>
									</li>
								))}
							</ul>

							<hr className="w-full my-4" />
							<Button
								onClick={async () => {
									await client.subscription.upgrade({
										plan: plan.name.toLowerCase(),
										successUrl: "/dashboard",
									});
								}}
								className={cn(
									buttonVariants({
										variant: "outline",
									}),
									"group relative w-full gap-2 overflow-hidden text-lg font-semibold tracking-tighter",
									"transform-gpu ring-offset-current transition-all duration-300 ease-out hover:ring-2 hover:ring-primary hover:ring-offset-1 hover:bg-primary hover:text-primary-foreground",
									plan.isPopular
										? "bg-primary text-primary-foreground"
										: "bg-background text-foreground",
								)}
							>
								{plan.buttonText}
							</Button>
							<p className="mt-6 text-xs leading-5 text-muted-foreground">
								{plan.description}
							</p>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}
