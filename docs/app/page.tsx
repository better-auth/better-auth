import Section from "@/components/landing/section";
import Hero from "@/components/landing/hero";
import Features from "@/components/features";
export default function HomePage() {
	return (
<<<<<<< HEAD
		<main className="h-min mx-auto ">
=======
		<main className="h-min max-w-[84%] mx-auto ">
>>>>>>> eb74cef (feat: hero section revamp)
			<Section
				className="-z-1 mb-1  overflow-y-clip"
				crosses
				crossesOffset="lg:translate-y-[5.25rem]"
				customPaddings
				id="hero"
			>
				<Hero />
				<Features />
<<<<<<< HEAD
				<hr className="h-px bg-gray-200" />
=======
				<hr className="h-px bg-gray-200"/>

>>>>>>> eb74cef (feat: hero section revamp)
			</Section>
		</main>
	);
}
