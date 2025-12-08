import type { Metadata } from "next";
import Section from "@/components/landing/section";
import { EnterpriseForm } from "./_components/enterprise-form";
import { EnterpriseHero } from "./_components/enterprise-hero";

export async function generateMetadata(): Promise<Metadata> {
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const ogImage = `${
		baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`
	}/enterprise.png`;

	return {
		title: "Enterprise | Better Auth",
		description:
			"Get direct support from the Better Auth team and deploy Better Auth securely inside your organization.",
		openGraph: {
			title: "Enterprise | Better Auth",
			description:
				"Get direct support from the Better Auth team and deploy Better Auth securely inside your organization.",
			images: [
				{
					url: ogImage,
					width: 1200,
					height: 630,
					alt: "Better Auth Community",
				},
			],
			url: `${
				baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`
			}/enterprise`,
		},
		twitter: {
			card: "summary_large_image",
			title: "Enterprise | Better Auth",
			description:
				"Get direct support from the Better Auth team and deploy Better Auth securely inside your organization.",
			images: [ogImage],
		},
	};
}

export default function EnterprisePage() {
	return (
		<main className="h-min mx-auto overflow-x-hidden">
			<Section
				className="mb-1 overflow-hidden"
				crosses
				crossesOffset="lg:translate-y-[5.25rem]"
				customPaddings
				id="enterprise"
			>
				<section className="  bg-white/96 dark:bg-black/96 antialiased min-h-screen overflow-y-auto">
					<div className="absolute inset-0 left-5 right-5 lg:left-16 lg:right-14 xl:left-16 xl:right-14">
						<div className="absolute inset-0 bg-grid text-muted/50 dark:text-white/2" />
						<div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background" />
					</div>

					<div className="z-10 max-w-5xl mx-auto px-4 py-12 md:py-16  flex items-center min-h-[95vh]">
						<div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-10 items-center w-full">
							<div className="flex items-center justify-center xl:justify-start z-10">
								<EnterpriseHero />
							</div>

							<div className="flex items-center justify-center">
								<EnterpriseForm />
							</div>
						</div>
					</div>
				</section>
			</Section>
		</main>
	);
}
