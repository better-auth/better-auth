import Link from "next/link";
import Section from "@/components/landing/section";
import { Logo } from "@/components/logo";
export default function NotFound() {
	return (
		<div className="h-full relative overflow-hidden">
			<Section
				className="mb-1 h-[92.3vh] overflow-y-hidden"
				crosses
				crossesOffset="lg:translate-y-[5.25rem]"
				customPaddings
				id="404"
			>
				<div className="relative flex flex-col h-full items-center justify-center dark:bg-black bg-white text-black dark:text-white">
					<div className="relative mb-8">
						<Logo className="w-10 h-10" />
					</div>
					<h1 className="text-8xl font-normal">404</h1>
					<p className="text-sm mb-8">Need help? Visit the docs</p>
					<div className="flex flex-col items-center gap-6">
						<Link
							href="/docs"
							className="hover:shadow-sm dark:border-stone-100 dark:hover:shadow-sm border-2 border-black bg-white px-4 py-1.5 text-sm uppercase text-black shadow-[1px_1px_rgba(0,0,0),2px_2px_rgba(0,0,0),3px_3px_rgba(0,0,0),4px_4px_rgba(0,0,0),5px_5px_0px_0px_rgba(0,0,0)] transition duration-200 md:px-8 dark:shadow-[1px_1px_rgba(255,255,255),2px_2px_rgba(255,255,255),3px_3px_rgba(255,255,255),4px_4px_rgba(255,255,255),5px_5px_0px_0px_rgba(255,255,255)]"
						>
							Go to docs
						</Link>
					</div>
				</div>
			</Section>
		</div>
	);
}
