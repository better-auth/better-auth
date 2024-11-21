import { PlusIcon } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { Card } from "../ui/card";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export function Builder() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<button className="bg-stone-950 no-underline group cursor-pointer relative shadow-2xl shadow-zinc-900 rounded-sm p-px text-xs font-semibold leading-6  text-white inline-block">
					<span className="absolute inset-0 overflow-hidden rounded-sm">
						<span className="absolute inset-0 rounded-sm bg-[image:radial-gradient(75%_100%_at_50%_0%,rgba(56,189,248,0.6)_0%,rgba(56,189,248,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>
					</span>
					<div className="relative flex space-x-2 items-center z-10 rounded-none bg-zinc-950 py-2 px-4 ring-1 ring-white/10 ">
						<PlusIcon size={14} />
						<span>Create Sign in Box</span>
					</div>
					<span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-emerald-400/0 via-stone-800/90 to-emerald-400/0 transition-opacity duration-500 group-hover:opacity-40"></span>
				</button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Sign in Box</DialogTitle>
				</DialogHeader>
				<Card className="relative h-full w-full bg-transparent max-w-7xl mx-auto rounded-none">
					<div className="w-full  border-b-2 border-gray-200/50 dark:border-gray-900/50">
						<div className="overflow-hidden md:ml-[-2px] bg-transparent flex gap-10 items-center justify-between md:justify-normal  rounded-none">
							<Tabs defaultValue="preview" className="w-full">
								<TabsList className=" md:ml-[-5px] data-[state=active]:bg-background items-center justify-between md:justify-normal bg-tranparent gap-3 w-full md:w-fit  rounded-none">
									<TabsTrigger
										className="rounded-none py-2 pt-4  data-[state=active]:text-white flex  items-center gap-2 data-[state=active]:bg-stone-900 "
										value="preview"
										onClick={() => {
											// setIsPrev(true);
											// setActiveTab("preview");
										}}
									>
										{/* <Layout className="w-4 h-4" /> */}
										<span className="py-1 flex items-center justify-center">
											Preview
										</span>
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
					</div>
				</Card>
			</DialogContent>
		</Dialog>
	);
}
