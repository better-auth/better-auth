import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { client } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { ArrowUpFromLine, CreditCard, RefreshCcw } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

function Component(props: {
	currentPlan?: string;
	isTrial?: boolean;
}) {
	const [selectedPlan, setSelectedPlan] = useState("starter");
	const id = useId();
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant={!props.currentPlan ? "default" : "outline"}
					size="sm"
					className={cn(
						"gap-2",
						!props.currentPlan &&
							" bg-gradient-to-br from-purple-100 to-stone-300",
					)}
				>
					{props.currentPlan ? (
						<RefreshCcw className="opacity-80" size={14} strokeWidth={2} />
					) : (
						<ArrowUpFromLine className="opacity-80" size={14} strokeWidth={2} />
					)}
					{props.currentPlan ? "Change Plan" : "Upgrade Plan"}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<div className="mb-2 flex flex-col gap-2">
					<div
						className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border"
						aria-hidden="true"
					>
						{props.currentPlan ? (
							<RefreshCcw className="opacity-80" size={16} strokeWidth={2} />
						) : (
							<CreditCard className="opacity-80" size={16} strokeWidth={2} />
						)}
					</div>
					<DialogHeader>
						<DialogTitle className="text-left">
							{!props.currentPlan ? "Upgrade" : "Change"} your plan
						</DialogTitle>
						<DialogDescription className="text-left">
							Pick one of the following plans.
						</DialogDescription>
					</DialogHeader>
				</div>

				<form className="space-y-5">
					<RadioGroup
						className="gap-2"
						defaultValue="2"
						value={selectedPlan}
						onValueChange={(value) => setSelectedPlan(value)}
					>
						<div className="relative flex w-full items-center gap-2 rounded-lg border border-input px-4 py-3 shadow-sm shadow-black/5 has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent">
							<RadioGroupItem
								value="starter"
								id={`${id}-1`}
								aria-describedby={`${id}-1-description`}
								className="order-1 after:absolute after:inset-0"
							/>
							<div className="grid grow gap-1">
								<Label htmlFor={`${id}-1`}>Starter</Label>
								<p
									id={`${id}-1-description`}
									className="text-xs text-muted-foreground"
								>
									$50/month
								</p>
							</div>
						</div>
						<div className="relative flex w-full items-center gap-2 rounded-lg border border-input px-4 py-3 shadow-sm shadow-black/5 has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent">
							<RadioGroupItem
								value="professional"
								id={`${id}-2`}
								aria-describedby={`${id}-2-description`}
								className="order-1 after:absolute after:inset-0"
							/>
							<div className="grid grow gap-1">
								<Label htmlFor={`${id}-2`}>Professional</Label>
								<p
									id={`${id}-2-description`}
									className="text-xs text-muted-foreground"
								>
									$99/month
								</p>
							</div>
						</div>
						<div className="relative flex w-full items-center gap-2 rounded-lg border border-input px-4 py-3 shadow-sm shadow-black/5 has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent">
							<RadioGroupItem
								value="enterprise"
								id={`${id}-3`}
								aria-describedby={`${id}-3-description`}
								className="order-1 after:absolute after:inset-0"
							/>
							<div className="grid grow gap-1">
								<Label htmlFor={`${id}-3`}>Enterprise</Label>
								<p
									id={`${id}-3-description`}
									className="text-xs text-muted-foreground"
								>
									Contact our sales team
								</p>
							</div>
						</div>
					</RadioGroup>

					<div className="space-y-3">
						<p className="text-xs text-white/70 text-center">
							note: all upgrades takes effect immediately and you'll be charged
							the new amount on your next billing cycle.
						</p>
					</div>

					<div className="grid gap-2">
						<Button
							type="button"
							className="w-full"
							disabled={
								selectedPlan === props.currentPlan?.toLowerCase() &&
								!props.isTrial
							}
							onClick={async () => {
								if (selectedPlan === "enterprise") {
									return;
								}
								await client.subscription.upgrade(
									{
										plan: selectedPlan,
									},
									{
										onError: (ctx) => {
											toast.error(ctx.error.message);
										},
									},
								);
							}}
						>
							{selectedPlan === props.currentPlan?.toLowerCase()
								? props.isTrial
									? "Upgrade"
									: "Current Plan"
								: selectedPlan === "starter"
									? !props.currentPlan
										? "Upgrade"
										: "Downgrade"
									: selectedPlan === "professional"
										? "Upgrade"
										: "Contact us"}
						</Button>
						{props.currentPlan && (
							<Button
								type="button"
								variant="destructive"
								className="w-full"
								onClick={async () => {
									await client.subscription.cancel(
										{
											returnUrl: "/dashboard",
										},
										{
											onError: (ctx) => {
												toast.error(ctx.error.message);
											},
										},
									);
								}}
							>
								Cancel Plan
							</Button>
						)}
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export { Component };
