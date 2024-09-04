import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as React from 'react';
import {Pressable, Text, View, type GestureResponderEvent} from 'react-native';
import {useAugmentedRef, useControllableState} from '@/components/primitives/hooks';
import * as Slot from '@/components/primitives/slot';
import type {
  PressableRef,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
  TextRef,
  ViewRef,
} from '@/components/primitives/types';
import type {
  AlertDialogContentProps,
  AlertDialogOverlayProps,
  AlertDialogPortalProps,
  AlertDialogRootProps,
  RootContext,
} from './types';

const AlertDialogContext = React.createContext<RootContext | null>(null);

const Root = React.forwardRef<ViewRef, SlottableViewProps & AlertDialogRootProps>(
  ({asChild, open: openProp, defaultOpen, onOpenChange: onOpenChangeProp, ...viewProps}, ref) => {
    const [open = false, onOpenChange] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen,
      onChange: onOpenChangeProp,
    });
    const Component = asChild ? Slot.View : View;
    return (
      <AlertDialogContext.Provider value={{open, onOpenChange}}>
        <AlertDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
          <Component ref={ref} {...viewProps} />
        </AlertDialog.Root>
      </AlertDialogContext.Provider>
    );
  }
);

Root.displayName = 'RootAlertWebDialog';

function useRootContext() {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error(
      'AlertDialog compound components cannot be rendered outside the AlertDialog component'
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
        augRef.dataset.state = open ? 'open' : 'closed';
        augRef.type = 'button';
      }
    }, [open]);

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <AlertDialog.Trigger disabled={disabled ?? undefined} asChild>
        <Component
          ref={augmentedRef}
          onPress={onPress}
          role='button'
          disabled={disabled}
          {...props}
        />
      </AlertDialog.Trigger>
    );
  }
);

Trigger.displayName = 'TriggerAlertWebDialog';

function Portal({forceMount, container, children}: AlertDialogPortalProps) {
  return <AlertDialog.Portal forceMount={forceMount} children={children} container={container} />;
}

const Overlay = React.forwardRef<ViewRef, SlottableViewProps & AlertDialogOverlayProps>(
  ({asChild, forceMount, ...props}, ref) => {
    const Component = asChild ? Slot.View : View;
    return (
      <AlertDialog.Overlay forceMount={forceMount}>
        <Component ref={ref} {...props} />
      </AlertDialog.Overlay>
    );
  }
);

Overlay.displayName = 'OverlayAlertWebDialog';

const Content = React.forwardRef<ViewRef, SlottableViewProps & AlertDialogContentProps>(
  (
    {
      asChild,
      forceMount,

      onOpenAutoFocus,
      onCloseAutoFocus,
      onEscapeKeyDown,
      ...props
    },
    ref
  ) => {
    const augmentedRef = useAugmentedRef({ref});
    const {open} = useRootContext();

    React.useLayoutEffect(() => {
      if (augmentedRef.current) {
        const augRef = augmentedRef.current as unknown as HTMLDivElement;
        augRef.dataset.state = open ? 'open' : 'closed';
      }
    }, [open]);

    const Component = asChild ? Slot.View : View;
    return (
      <AlertDialog.Content
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        forceMount={forceMount}
        asChild
      >
        <Component ref={augmentedRef} {...props} />
      </AlertDialog.Content>
    );
  }
);

Content.displayName = 'ContentAlertWebDialog';

const Cancel = React.forwardRef<PressableRef, SlottablePressableProps>(
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
        augRef.type = 'button';
      }
    }, []);

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <>
        <AlertDialog.Cancel disabled={disabled ?? undefined} asChild>
          <Component
            ref={augmentedRef}
            onPress={onPress}
            role='button'
            disabled={disabled}
            {...props}
          />
        </AlertDialog.Cancel>
      </>
    );
  }
);

Cancel.displayName = 'CancelAlertWebDialog';

const Action = React.forwardRef<PressableRef, SlottablePressableProps>(
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
        augRef.type = 'button';
      }
    }, []);

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <>
        <AlertDialog.Action disabled={disabled ?? undefined} asChild>
          <Component
            ref={augmentedRef}
            onPress={onPress}
            role='button'
            disabled={disabled}
            {...props}
          />
        </AlertDialog.Action>
      </>
    );
  }
);

Action.displayName = 'ActionAlertWebDialog';

const Title = React.forwardRef<TextRef, SlottableTextProps>(({asChild, ...props}, ref) => {
  const Component = asChild ? Slot.Text : Text;
  return (
    <AlertDialog.Title asChild>
      <Component ref={ref} {...props} />
    </AlertDialog.Title>
  );
});

Title.displayName = 'TitleAlertWebDialog';

const Description = React.forwardRef<TextRef, SlottableTextProps>(({asChild, ...props}, ref) => {
  const Component = asChild ? Slot.Text : Text;
  return (
    <AlertDialog.Description asChild>
      <Component ref={ref} {...props} />
    </AlertDialog.Description>
  );
});

Description.displayName = 'DescriptionAlertWebDialog';

export {
  Action,
  Cancel,
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
  Trigger,
  useRootContext,
};
