import Link from "next/link";
import {} from "better-auth/client";
import Section from "@/components/landing/section";
import Hero from "@/components/landing/hero";
import { Separator } from "@/components/ui/separator";
import { FeaturesSectionDemo } from "@/components/blocks/features-section-demo-3";
export default function HomePage() {
	return (
		<main>
			<Section
				className="-z-1 mb-1"
				crosses
				crossesOffset="lg:translate-y-[5.25rem]"
				customPaddings
				id="hero"
			>
				<Hero />
			</Section>
		</main>
	);
}
