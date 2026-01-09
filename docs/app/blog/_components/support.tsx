"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function Support() {
	const [open, setOpen] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const formRef = React.useRef<HTMLFormElement | null>(null);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting) return;
		setSubmitting(true);
		const form = new FormData(event.currentTarget);
		const payload = {
			name: String(form.get("name") || ""),
			email: String(form.get("email") || ""),
			company: String(form.get("company") || ""),
			website: String(form.get("website") || ""),
			userCount: String(form.get("userCount") || ""),
			interest: String(form.get("interest") || ""),
			features: String(form.get("features") || ""),
			additional: String(form.get("additional") || ""),
		};
		try {
			const res = await fetch("/api/support", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error("Failed to submit");
			setOpen(false);
			formRef.current?.reset();
			// optionally add a toast later
		} catch (e) {
			console.error(e);
			// optionally add error toast
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Card className="flex flex-col gap-3 rounded-none">
			<CardHeader>
				<CardTitle>Dedicated Support</CardTitle>
				<CardDescription>
					We're now offering on demand support for Better Auth and Auth.js.
					Including help out migrations, consultations, premium dedicated
					support and more. If you're interested, please get in touch.
				</CardDescription>
			</CardHeader>
			<CardFooter>
				<Dialog open={open} onOpenChange={setOpen}>
					<div>
						<DialogTrigger asChild>
							<Button
								type="button"
								className="bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer"
							>
								Request support
							</Button>
						</DialogTrigger>
					</div>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Request dedicated support</DialogTitle>
							<DialogDescription>
								Tell us about your team and what you're looking for.
							</DialogDescription>
						</DialogHeader>
						<form ref={formRef} className="grid gap-4" onSubmit={onSubmit}>
							<div className="grid gap-2">
								<Label htmlFor="name">Your name</Label>
								<Input id="name" name="name" placeholder="Jane Doe" required />
							</div>
							<div className="grid gap-2">
								<Label htmlFor="email">Work email</Label>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder="jane@company.com"
									required
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="company">Company</Label>
								<Input id="company" name="company" placeholder="Acme Inc." />
							</div>
							<div className="grid gap-2">
								<Label htmlFor="website">Website</Label>
								<Input
									id="website"
									name="website"
									placeholder="https://acme.com"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="userCount">Users</Label>
								<Select name="userCount">
									<SelectTrigger id="userCount">
										<SelectValue placeholder="Select users" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="<1k">Less than 1k</SelectItem>
										<SelectItem value="1k-10k">1k - 10k</SelectItem>
										<SelectItem value=">10k">More than 10k</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="interest">What are you interested in?</Label>
								<Select name="interest">
									<SelectTrigger id="interest">
										<SelectValue placeholder="Choose a package" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="migration">Migration help</SelectItem>
										<SelectItem value="consultation">Consultation</SelectItem>
										<SelectItem value="support">Premium support</SelectItem>
										<SelectItem value="custom">Custom</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="features">
									Features or plugins of interest
								</Label>
								<Input
									id="features"
									name="features"
									placeholder="SAML, SIWE, WebAuthn, Organizations, ..."
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="additional">Anything else?</Label>
								<Textarea
									id="additional"
									name="additional"
									placeholder="Share more context, timelines, and expectations."
								/>
							</div>
							<DialogFooter>
								<Button type="submit" disabled={submitting}>
									{submitting ? "Submitting..." : "Submit"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</CardFooter>
		</Card>
	);
}
