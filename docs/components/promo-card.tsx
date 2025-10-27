"use client";

import { ArrowRight, Clock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export default function PromoCard() {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<TooltipProvider>
			<Card
				className="w-full overflow-hidden bg-gradient-to-br from-purple-500 to-indigo-600 text-white"
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<CardContent className="p-6 pb-0">
					<div className="flex justify-between items-start mb-4">
						<Badge className="bg-yellow-500 text-black hover:bg-yellow-600">
							New
						</Badge>
						<Tooltip>
							<TooltipTrigger>
								<Clock className="h-5 w-5 text-white/80" />
							</TooltipTrigger>
							<TooltipContent>
								<p>Limited time offer</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<h3 className="text-2xl font-bold mb-2">Unlock Pro Features</h3>
					<p className="text-sm text-white/80 mb-4">
						Supercharge your workflow with our advanced tools and exclusive
						content.
					</p>
					<div className="relative">
						<Progress value={67} className="h-2 mb-2" />
						<span className="text-xs text-white/80">67% of slots filled</span>
					</div>
				</CardContent>
				<CardFooter className="p-6 pt-4">
					<Button
						className={`w-full bg-white text-purple-600 hover:bg-white/90 transition-all duration-300 ${
							isHovered ? "translate-y-[-2px] shadow-lg" : ""
						}`}
					>
						<span className="mr-2">Upgrade Now</span>
						<Sparkles className="h-4 w-4 mr-2" />
						<ArrowRight
							className={`h-4 w-4 transition-transform duration-300 ${
								isHovered ? "translate-x-1" : ""
							}`}
						/>
					</Button>
				</CardFooter>
			</Card>
		</TooltipProvider>
	);
}
