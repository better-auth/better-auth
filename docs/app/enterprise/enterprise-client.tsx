"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type * as z from "zod";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { contactSchema } from "@/lib/enterprise-contact";

function EnterpriseHero() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full"
		>
			<div className="space-y-6">
				<div className="space-y-2">
					<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						Own your auth
						<br />
						<span className="text-neutral-500 dark:text-neutral-400">
							at scale.
						</span>
					</h1>
					<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[260px]">
						Keep your users on your own infrastructure with enterprise-grade
						auth, SSO, RBAC, and dedicated support.
					</p>
				</div>

				{/* CTA */}
				<div className="flex items-center gap-3 pt-1">
					<Link
						href="/pricing"
						className="inline-flex items-center gap-1.5 text-[12px] text-foreground/60 hover:text-foreground/80 font-mono uppercase tracking-wider transition-colors"
					>
						View Pricing
						<svg
							className="h-2.5 w-2.5 opacity-50"
							viewBox="0 0 10 10"
							fill="none"
						>
							<path
								d="M1 9L9 1M9 1H3M9 1V7"
								stroke="currentColor"
								strokeWidth="1.2"
							/>
						</svg>
					</Link>
				</div>
			</div>
		</motion.div>
	);
}

export function EnterprisePageClient() {
	const hpRef = useRef<HTMLInputElement>(null);
	const form = useForm<z.infer<typeof contactSchema>>({
		resolver: zodResolver(contactSchema),
		defaultValues: {
			fullName: "",
			company: "",
			email: "",
			companySize: "",
			description: "",
		},
	});

	const onSubmit = async (data: z.infer<typeof contactSchema>) => {
		try {
			const response = await fetch("/api/enterprise/contact", {
				method: "POST",
				body: JSON.stringify({
					...data,
					_hp: hpRef.current?.value,
				}),
				headers: {
					"Content-Type": "application/json",
				},
			});
			if (!response.ok) {
				const { message } = await response.json();
				if (response.status === 422) {
					form.setError("email", { message });
					return;
				}
				toast.error(message || "Something went wrong. Please try again.");
				return;
			}
			toast.success("Thank you for your interest! We'll be in touch soon.");
			form.reset();
		} catch {
			toast.error("Something went wrong. Please try again.");
		}
	};

	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left side — Enterprise hero */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[40%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/6 overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<EnterpriseHero />
					</div>

					{/* Right side — Contact form */}
					<div className="relative w-full lg:w-[60%] overflow-x-hidden no-scrollbar flex flex-col min-h-dvh">
						<div className="px-5 lg:p-8 lg:pt-20 space-y-8">
							{/* Mobile header */}
							<div className="lg:hidden relative border-b border-foreground/6 overflow-hidden -mx-5 sm:-mx-6 px-5 sm:px-6 mb-5">
								<HalftoneBackground />
								<div className="relative space-y-2 py-16">
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
										Own your auth
										<br />
										<span className="text-neutral-500 dark:text-neutral-400">
											at scale.
										</span>
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
										Keep your users on your own infrastructure with
										enterprise-grade auth, SSO, RBAC, and dedicated support.
									</p>
								</div>
							</div>

							<h2 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-5">
								GET IN TOUCH
								<span className="flex-1 h-px bg-foreground/15" />
							</h2>

							{/* Contact form */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
							>
								<div className="relative overflow-hidden max-w-xl lg:mt-8">
									<div className="py-4 sm:py-5">
										<Form {...form}>
											<form
												onSubmit={form.handleSubmit(onSubmit)}
												className="space-y-3.5"
											>
												{/* honeypot */}
												<div
													aria-hidden="true"
													className="absolute opacity-0 pointer-events-none h-0 overflow-hidden"
												>
													<input
														ref={hpRef}
														type="text"
														tabIndex={-1}
														autoComplete="off"
													/>
												</div>

												<FormField
													control={form.control}
													name="fullName"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="text-xs tracking-wider text-foreground/50 font-mono">
																Full Name
															</FormLabel>
															<FormControl>
																<Input {...field} placeholder="Your name" />
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="company"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="text-xs tracking-wider text-foreground/50 font-mono">
																Company
															</FormLabel>
															<FormControl>
																<Input {...field} placeholder="Company name" />
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="email"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="text-xs tracking-wider text-foreground/50 font-mono">
																Company Email
															</FormLabel>
															<FormControl>
																<Input
																	{...field}
																	type="email"
																	placeholder="name@company.com"
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="companySize"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="text-xs tracking-wider text-foreground/50 font-mono">
																Company Size
															</FormLabel>
															<Select
																value={field.value}
																onValueChange={field.onChange}
															>
																<FormControl>
																	<SelectTrigger>
																		<SelectValue placeholder="Select" />
																	</SelectTrigger>
																</FormControl>
																<SelectContent>
																	<SelectItem value="1-10">1-10</SelectItem>
																	<SelectItem value="11-50">11-50</SelectItem>
																	<SelectItem value="51-200">51-200</SelectItem>
																	<SelectItem value="201-500">
																		201-500
																	</SelectItem>
																	<SelectItem value="501+">501+</SelectItem>
																</SelectContent>
															</Select>
															<FormMessage />
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="description"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="text-xs tracking-wider text-foreground/50 font-mono">
																What do you need help with?
															</FormLabel>
															<FormControl>
																<Textarea
																	{...field}
																	rows={4}
																	placeholder="Tell us about your project and requirements..."
																	className="min-h-[100px]"
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>

												<Button
													disabled={form.formState.isSubmitting}
													type="submit"
													className="w-full font-mono uppercase tracking-widest"
												>
													{form.formState.isSubmitting ? "Sending..." : "Send"}
												</Button>
											</form>
										</Form>

										<p className="mt-4 text-foreground/50 text-xs leading-relaxed">
											By submitting, you agree to our{" "}
											<Link
												href="/legal/terms"
												className="underline hover:text-foreground/55"
											>
												Terms of Service
											</Link>{" "}
											and{" "}
											<Link
												href="/legal/privacy"
												className="underline hover:text-foreground/55"
											>
												Privacy Policy
											</Link>
											.
										</p>
									</div>
								</div>
							</motion.div>
						</div>
						<div className="mt-auto">
							<Footer />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
