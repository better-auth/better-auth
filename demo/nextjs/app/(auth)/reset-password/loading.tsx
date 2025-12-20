import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div
			className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]"
			aria-busy="true"
			aria-label="Loading reset password form"
		>
			<Skeleton className="w-87.5 h-50" />
		</div>
	);
}
