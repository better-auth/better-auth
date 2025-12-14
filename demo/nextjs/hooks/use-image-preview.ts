import { useCallback, useState } from "react";

export function useImagePreview() {
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);

	const handleImageChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				setImage(file);
				setImagePreview((preview) => {
					if (preview) {
						URL.revokeObjectURL(preview);
					}
					return URL.createObjectURL(file);
				});
			}
		},
		[],
	);

	const clearImage = useCallback(() => {
		if (imagePreview) {
			URL.revokeObjectURL(imagePreview);
		}
		setImage(null);
		setImagePreview(null);
	}, [imagePreview]);

	return {
		image,
		imagePreview,
		handleImageChange,
		clearImage,
	};
}
