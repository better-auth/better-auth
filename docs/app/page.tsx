import Section from "@/components/landing/section";
import Hero from "@/components/landing/hero";
import Features from "@/components/features";
export default function HomePage() {
	return (
		<main className="h-min">
			<Section
				className="-z-1 mb-1"
				crosses
				crossesOffset="lg:translate-y-[5.25rem]"
				customPaddings
				id="hero"
			>
				<Hero />
				<Features />
			</Section>
		</main>
	);
}
