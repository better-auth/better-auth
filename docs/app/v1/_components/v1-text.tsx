export const ShipText = () => {
	const voxels = [
		// V
		[0, 0],
		[0, 1],
		[0, 2],
		[1, 3],
		[2, 2],
		[2, 1],
		[2, 0],
		// 1
		[4, 0],
		[4, 1],
		[4, 2],
		[4, 3],
		// .
		[6, 3],
		// 0
		[8, 0],
		[8, 1],
		[8, 2],
		[8, 3],
		[9, 0],
		[9, 3],
		[10, 0],
		[10, 1],
		[10, 2],
		[10, 3],
	];

	return (
		<div className="flex justify-center items-center mb-0 h-[80%]">
			<div className="grid grid-cols-11 gap-2">
				{Array.from({ length: 44 }).map((_, index) => {
					const row = Math.floor(index / 11);
					const col = index % 11;
					const isActive = voxels.some(([x, y]) => x === col && y === row);
					return (
						<div
							key={index}
							className={`w-8 h-8 ${
								isActive
									? "bg-gradient-to-tr from-stone-100 via-white/90 to-zinc-900"
									: "bg-transparent"
							}`}
						/>
					);
				})}
			</div>
		</div>
	);
};
