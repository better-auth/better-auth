"use client";

import { useState } from "react";
import { Grid } from "@/components/blocks/features";
import { Button } from "@/components/ui/button";

export function EnterpriseForm() {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		company: "",
		userCount: "",
		migrating: "",
		currentPlatform: "",
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
					userCount: "",
					migrating: "",
					currentPlatform: "",
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
		<div className="relative bg-linear-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 shadow-[0_0_50px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50px_-15px_rgba(255,255,255,0.05)] w-full max-w-xl overflow-hidden">
			<Grid size={20} />
			<div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent"></div>
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
							htmlFor="userCount"
							className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
						>
							Expected user count
						</label>
						<select
							id="userCount"
							value={formData.userCount}
							onChange={(e) =>
								setFormData({ ...formData, userCount: e.target.value })
							}
							className="w-full px-4 py-2 pr-10 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-all text-sm appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%2371717a%27 strokeLinecap=%27round%27 strokeLinejoin=%27round%27 strokeWidth=%271.5%27 d=%27m6 8 4 4 4-4%27/%3E%3C/svg%3E')] bg-size-[1.25rem] bg-position-[right_0.5rem_center] bg-no-repeat"
						>
							<option value="">Select range</option>
							<option value="1-1000">1-1,000 users</option>
							<option value="1000-10000">1,000-10,000 users</option>
							<option value="10000-100000">10,000-100,000 users</option>
							<option value="100000-1000000">100,000-1M users</option>
							<option value="1000000+">1M+ users</option>
						</select>
					</div>

					<div>
						<label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
							Are you migrating from another platform?
						</label>
						<div className="flex gap-4">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="migrating"
									value="yes"
									checked={formData.migrating === "yes"}
									onChange={(e) =>
										setFormData({ ...formData, migrating: e.target.value })
									}
									className="w-4 h-4 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-700 focus:ring-0"
								/>
								<span className="text-sm text-zinc-700 dark:text-zinc-300">
									Yes
								</span>
							</label>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="migrating"
									value="no"
									checked={formData.migrating === "no"}
									onChange={(e) => {
										setFormData({
											...formData,
											migrating: e.target.value,
											currentPlatform: "",
										});
									}}
									className="w-4 h-4 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-700 focus:ring-0"
								/>
								<span className="text-sm text-zinc-700 dark:text-zinc-300">
									No
								</span>
							</label>
						</div>
					</div>

					{formData.migrating === "yes" && (
						<div>
							<label
								htmlFor="currentPlatform"
								className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
							>
								Which platform are you currently using?
							</label>
							<input
								type="text"
								id="currentPlatform"
								value={formData.currentPlatform}
								onChange={(e) =>
									setFormData({ ...formData, currentPlatform: e.target.value })
								}
								placeholder="e.g., Auth0, Clerk, Supabase Auth"
								className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition-all text-sm"
							/>
						</div>
					)}

					<div>
						<label
							htmlFor="additional"
							className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
						>
							What problem are you trying to solve?
						</label>
						<textarea
							id="additional"
							required
							rows={2}
							value={formData.additional}
							onChange={(e) =>
								setFormData({ ...formData, additional: e.target.value })
							}
							placeholder="We need help with..."
							className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition-all resize-none text-sm"
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
