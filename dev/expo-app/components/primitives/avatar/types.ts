interface AvatarRootProps {
  alt: string;
}

interface AvatarImageProps {
  children?: React.ReactNode;
  onLoadingStatusChange?: (status: "error" | "loaded") => void;
}

export type { AvatarRootProps, AvatarImageProps };
