import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import {
  type GestureResponderEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import * as Slot from "@/components/primitives/slot";
import type {
  PressableRef,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
  TextRef,
  ViewRef,
} from "@/components/primitives/types";
import {useAugmentedRef, useControllableState} from "../hooks";
import type {
  DialogContentProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogRootProps,
  RootContext,
} from "./types";

const DialogContext = React.createContext<RootContext | null>(null);

const Root = React.forwardRef<ViewRef, SlottableViewProps & DialogRootProps>(
  (
    {
      asChild,
      open: openProp,
      defaultOpen,
      onOpenChange: onOpenChangeProp,
      ...viewProps
    },
    ref,
  ) => {
    const [open = false, onOpenChange] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen,
      onChange: onOpenChangeProp,
    });
    const Component = asChild ? Slot.View : View;
    return (
      <DialogContext.Provider value={{open, onOpenChange}}>
        <Dialog.Root
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
        >
          <Component ref={ref} {...viewProps} />
        </Dialog.Root>
      </DialogContext.Provider>
    );
  },
);

Root.displayName = "RootWebDialog";

function useRootContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error(
      "Dialog compound components cannot be rendered outside the Dialog component",
    );
  }
  return context;
}

const Trigger = React.forwardRef<PressableRef, SlottablePressableProps>(
  ({asChild, onPress: onPressProp, role: _role, disabled, ...props}, ref) => {
    const augmentedRef = useAugmentedRef({ref});
    const {onOpenChange, open} = useRootContext();
    function onPress(ev: GestureResponderEvent) {
      if (onPressProp) {
        onPressProp(ev);
      }
      onOpenChange(!open);
    }

    React.useLayoutEffect(() => {
      if (augmentedRef.current) {
        const augRef = augmentedRef.current as unknown as HTMLButtonElement;
        augRef.dataset.state = open ? "open" : "closed";
        augRef.type = "button";
      }
    }, [open]);

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Dialog.Trigger disabled={disabled ?? undefined} asChild>
        <Component
          ref={augmentedRef}
          onPress={onPress}
          role="button"
          disabled={disabled}
          {...props}
        />
      </Dialog.Trigger>
    );
  },
);

Trigger.displayName = "TriggerWebDialog";

function Portal({forceMount, container, children}: DialogPortalProps) {
  return (
    <Dialog.Portal
      forceMount={forceMount}
      children={children}
      container={container}
    />
  );
}

const Overlay = React.forwardRef<
  PressableRef,
  SlottablePressableProps & DialogOverlayProps
>(({asChild, forceMount, ...props}, ref) => {
  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Dialog.Overlay forceMount={forceMount}>
      <Component ref={ref} {...props} />
    </Dialog.Overlay>
  );
});

Overlay.displayName = "OverlayWebDialog";

const Content = React.forwardRef<
  ViewRef,
  SlottableViewProps & DialogContentProps
>(
  (
    {
      asChild,
      forceMount,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onEscapeKeyDown,
      onInteractOutside,
      onPointerDownOutside,
      ...props
    },
    ref,
  ) => {
    const Component = asChild ? Slot.View : View;
    return (
      <Dialog.Content
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        onInteractOutside={onInteractOutside}
        onPointerDownOutside={onPointerDownOutside}
        forceMount={forceMount}
      >
        <Component ref={ref} {...props} />
      </Dialog.Content>
    );
  },
);

Content.displayName = "ContentWebDialog";

const Close = React.forwardRef<PressableRef, SlottablePressableProps>(
  ({asChild, onPress: onPressProp, disabled, ...props}, ref) => {
    const augmentedRef = useAugmentedRef({ref});
    const {onOpenChange, open} = useRootContext();

    function onPress(ev: GestureResponderEvent) {
      if (onPressProp) {
        onPressProp(ev);
      }
      onOpenChange(!open);
    }

    React.useLayoutEffect(() => {
      if (augmentedRef.current) {
        const augRef = augmentedRef.current as unknown as HTMLButtonElement;
        augRef.type = "button";
      }
    }, []);

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <>
        <Dialog.Close disabled={disabled ?? undefined} asChild>
          <Component
            ref={augmentedRef}
            onPress={onPress}
            role="button"
            disabled={disabled}
            {...props}
          />
        </Dialog.Close>
      </>
    );
  },
);

Close.displayName = "CloseWebDialog";

const Title = React.forwardRef<TextRef, SlottableTextProps>(
  ({asChild, ...props}, ref) => {
    const Component = asChild ? Slot.Text : Text;
    return (
      <Dialog.Title asChild>
        <Component ref={ref} {...props} />
      </Dialog.Title>
    );
  },
);

Title.displayName = "TitleWebDialog";

const Description = React.forwardRef<TextRef, SlottableTextProps>(
  ({asChild, ...props}, ref) => {
    const Component = asChild ? Slot.Text : Text;
    return (
      <Dialog.Description asChild>
        <Component ref={ref} {...props} />
      </Dialog.Description>
    );
  },
);

Description.displayName = "DescriptionWebDialog";

export {
  Close,
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
  Trigger,
  useRootContext,
};
