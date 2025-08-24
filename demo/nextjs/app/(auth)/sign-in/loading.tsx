export default function Loading() {
	return (
		<div className="w-full">
			<div className="flex items-center flex-col justify-center w-full md:py-10">
				<div className="md:w-[400px] animate-pulse">
					<div className="h-10 bg-gray-200 rounded-lg mb-4"></div>
					<div className="space-y-4">
						<div className="h-12 bg-gray-200 rounded"></div>
						<div className="h-12 bg-gray-200 rounded"></div>
						<div className="h-10 bg-gray-200 rounded"></div>
					</div>
				</div>
			</div>
		</div>
	);
}
