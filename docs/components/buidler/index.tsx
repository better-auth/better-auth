import {
	Code,
	Layout,
	LayoutDashboard,
	Mail,
	PhoneCall,
	PlusIcon,
	Users,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SignIn from "./sign-in";
import { SignUp } from "./sign-up";
import { AuthTabs } from "./tabs";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";

export function Builder() {
	const enabledComp = {};
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
			<DialogContent className="max-w-7xl">
				<DialogHeader>
					<DialogTitle>Create Sign in Box</DialogTitle>
					<DialogDescription>
						Configure the sign in box to your liking and copy the code to your
						application
					</DialogDescription>
				</DialogHeader>

				<div className="flex gap-12">
					<div className="w-4/12">
						<AuthTabs
							tabs={[
								{
									title: "Sign In",
									value: "sign-in",
									content: <SignIn />,
								},
								{
									title: "Sign Up",
									value: "sign-up",
									content: <SignUp />,
								},
							]}
						/>
					</div>
					<div className="flex-grow">
						<AuthTabs
							tabs={[
								{
									title: "editor",
									value: "config",
									content: (
										<Card className="rounded-none">
											<CardHeader>
												<CardTitle>Configuration</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="flex flex-col gap-2">
													<div>
														<Label>Email & Password</Label>
													</div>
													<Separator />
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<Mail size={16} />
															<Label>Email</Label>
														</div>
														<Switch />
													</div>
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<Users size={16} />
															<Label>Username</Label>
														</div>
														<Switch />
													</div>
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<PhoneCall size={16} />
															<Label>Phone Number</Label>
														</div>
														<Switch />
													</div>
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="1em"
																height="1em"
																viewBox="0 0 24 24"
															>
																<path
																	fill="currentColor"
																	d="M3 17h18q.425 0 .713.288T22 18t-.288.713T21 19H3q-.425 0-.712-.288T2 18t.288-.712T3 17m1-5.55l-.475.85q-.15.275-.45.35t-.575-.075t-.35-.45t.075-.575l.475-.85h-.95q-.325 0-.537-.212T1 9.95t.213-.537t.537-.213h.95l-.475-.8q-.15-.275-.075-.575t.35-.45t.575-.075t.45.35l.475.8l.475-.8q.15-.275.45-.35t.575.075t.35.45t-.075.575l-.475.8h.95q.325 0 .538.213T7 9.95t-.213.538t-.537.212H5.3l.475.85q.15.275.075.575t-.35.45t-.575.075t-.45-.35zm8 0l-.475.85q-.15.275-.45.35t-.575-.075t-.35-.45t.075-.575l.475-.85h-.95q-.325 0-.537-.212T9 9.95t.213-.537t.537-.213h.95l-.475-.8q-.15-.275-.075-.575t.35-.45t.575-.075t.45.35l.475.8l.475-.8q.15-.275.45-.35t.575.075t.35.45t-.075.575l-.475.8h.95q.325 0 .537.213T15 9.95t-.213.538t-.537.212h-.95l.475.85q.15.275.075.575t-.35.45t-.575.075t-.45-.35zm8 0l-.475.85q-.15.275-.45.35t-.575-.075t-.35-.45t.075-.575l.475-.85h-.95q-.325 0-.537-.212T17 9.95t.213-.537t.537-.213h.95l-.475-.8q-.15-.275-.075-.575t.35-.45t.575-.075t.45.35l.475.8l.475-.8q.15-.275.45-.35t.575.075t.35.45t-.075.575l-.475.8h.95q.325 0 .538.213T23 9.95t-.213.538t-.537.212h-.95l.475.85q.15.275.075.575t-.35.45t-.575.075t-.45-.35z"
																></path>
															</svg>
															<Label>Password</Label>
														</div>
														<Switch />
													</div>
												</div>
											</CardContent>
											<CardFooter>
												<Button variant="secondary">Copy Code</Button>
											</CardFooter>
										</Card>
									),
								},
								{
									title: "code",
									value: "auth.ts",
									content: <div></div>,
								},
							]}
						/>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
