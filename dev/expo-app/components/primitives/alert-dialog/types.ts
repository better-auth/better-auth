import type { ForceMountable } from "@/components/primitives/types";

type AlertDialogRootProps = {
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  defaultOpen?: boolean;
};

interface RootContext {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

interface AlertDialogPortalProps extends ForceMountable {
  children: React.ReactNode;
  /**
   * Platform: NATIVE ONLY
   */
  hostName?: string;
  /**
   * Platform: WEB ONLY
   */
  container?: HTMLElement | null | undefined;
}
type AlertDialogOverlayProps = ForceMountable;

type AlertDialogContentProps = ForceMountable & {
  /**
   * Platform: WEB ONLY
   */
  onOpenAutoFocus?: (ev: Event) => void;
  /**
   * Platform: WEB ONLY
   */
  onCloseAutoFocus?: (ev: Event) => void;
  /**
   * Platform: WEB ONLY
   */
  onEscapeKeyDown?: (ev: Event) => void;
};

export type {
  AlertDialogRootProps,
  AlertDialogPortalProps,
  AlertDialogOverlayProps,
  AlertDialogContentProps,
  RootContext,
};
