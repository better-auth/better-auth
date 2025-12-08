"use client";

import { useState } from "react";
import { Grid } from "@/components/blocks/features";
import { Button } from "@/components/ui/button";

export function EnterpriseForm() {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		company: "",
		additional: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitStatus, setSubmitStatus] = useState<
		"idle" | "success" | "error"
	>("idle");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			const response = await fetch("/api/support", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					...formData,
					interest: "enterprise",
				}),
			});

			if (response.ok) {
				setSubmitStatus("success");
				setFormData({
					name: "",
					email: "",
					company: "",
					additional: "",
				});
			} else {
				setSubmitStatus("error");
			}
		} catch (error) {
			setSubmitStatus("error");
		} finally {
			setIsSubmitting(false);
			setTimeout(() => setSubmitStatus("idle"), 5000);
		}
	};

	return (
		<div className="relative bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 shadow-[0_0_50px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50px_-15px_rgba(255,255,255,0.05)] w-full max-w-xl overflow-hidden">
			<Grid size={20} />
			<div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent"></div>
			<div className="relative z-10 p-4 md:p-5">
				<div className="mb-3">
					<h2 className="text-lg md:text-xl font-bold text-zinc-900 dark:text-white mb-1">
						Get in touch
					</h2>
					<p className="text-xs text-zinc-600 dark:text-zinc-400">
						Fill out the form and we'll be in touch soon
					</p>
				</div>

				{submitStatus === "success" && (
					<div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-sm">
						Thank you! We'll be in touch soon.
					</div>
				)}

				{submitStatus === "error" && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
						Something went wrong. Please try again.
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-2.5">
					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
						>
							Full name
						</label>
						<input
							type="text"
							id="name"
							required
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							placeholder="Your name"
							className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition-all text-sm"
						/>
					</div>

					<div>
						<label
							htmlFor="company"
							className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
						>
							Company
						</label>
						<input
							type="text"
							id="company"
							required
							value={formData.company}
							onChange={(e) =>
								setFormData({ ...formData, company: e.target.value })
							}
							placeholder="Company name"
							className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition-all text-sm"
						/>
					</div>

					<div>
						<label
							htmlFor="email"
							className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
						>
							Company email
						</label>
						<input
							type="email"
							id="email"
							required
							value={formData.email}
							onChange={(e) =>
								setFormData({ ...formData, email: e.target.value })
							}
							placeholder="name@email.com"
							className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition-all text-sm"
						/>
					</div>

					<div>
						<label
							htmlFor="additional"
							className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
						>
							What do you need help with?
						</label>
						<textarea
							id="additional"
							required
							rows={5}
							value={formData.additional}
							onChange={(e) =>
								setFormData({ ...formData, additional: e.target.value })
							}
							placeholder="We need help with..."
							className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition-all resize-y text-sm leading-relaxed"
						/>
					</div>

					<Button
						type="submit"
						disabled={isSubmitting}
						className="w-full hover:shadow-sm dark:border-stone-100 dark:hover:shadow-sm border-2 border-black bg-white px-6 py-3 text-sm uppercase text-black shadow-[1px_1px_rgba(0,0,0),2px_2px_rgba(0,0,0),3px_3px_rgba(0,0,0),4px_4px_rgba(0,0,0),5px_5px_0px_0px_rgba(0,0,0)] transition duration-200 dark:shadow-[1px_1px_rgba(255,255,255),2px_2px_rgba(255,255,255),3px_3px_rgba(255,255,255),4px_4px_rgba(255,255,255),5px_5px_0px_0px_rgba(255,255,255)] disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSubmitting ? "Sending..." : "Send"}
					</Button>
				</form>
			</div>
		</div>
	);
}
