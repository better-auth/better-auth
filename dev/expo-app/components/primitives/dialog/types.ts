import type { ForceMountable } from "@/components/primitives/types";

type RootContext = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
};

type DialogRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (value: boolean) => void;
};

interface DialogPortalProps extends ForceMountable {
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
type DialogOverlayProps = ForceMountable & {
  /**
   * Platform: NATIVE ONLY - default: true
   */
  closeOnPress?: boolean;
};
type DialogContentProps = ForceMountable & {
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
  /**
   * Platform: WEB ONLY
   */
  onInteractOutside?: (ev: Event) => void;
  /**
   * Platform: WEB ONLY
   */
  onPointerDownOutside?: (ev: Event) => void;
};

export type {
  DialogContentProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogRootProps,
  RootContext,
};
