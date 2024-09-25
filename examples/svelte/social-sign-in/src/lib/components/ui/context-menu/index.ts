import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

import Item from "./context-menu-item.svelte";
import Label from "./context-menu-label.svelte";
import Content from "./context-menu-content.svelte";
import Shortcut from "./context-menu-shortcut.svelte";
import RadioItem from "./context-menu-radio-item.svelte";
import Separator from "./context-menu-separator.svelte";
import RadioGroup from "./context-menu-radio-group.svelte";
import SubContent from "./context-menu-sub-content.svelte";
import SubTrigger from "./context-menu-sub-trigger.svelte";
import CheckboxItem from "./context-menu-checkbox-item.svelte";

const Sub = ContextMenuPrimitive.Sub;
const Root = ContextMenuPrimitive.Root;
const Trigger = ContextMenuPrimitive.Trigger;
const Group = ContextMenuPrimitive.Group;

export {
	Sub,
	Root,
	Item,
	Label,
	Group,
	Trigger,
	Content,
	Shortcut,
	Separator,
	RadioItem,
	SubContent,
	SubTrigger,
	RadioGroup,
	CheckboxItem,
	//
	Root as ContextMenu,
	Sub as ContextMenuSub,
	Item as ContextMenuItem,
	Label as ContextMenuLabel,
	Group as ContextMenuGroup,
	Content as ContextMenuContent,
	Trigger as ContextMenuTrigger,
	Shortcut as ContextMenuShortcut,
	RadioItem as ContextMenuRadioItem,
	Separator as ContextMenuSeparator,
	RadioGroup as ContextMenuRadioGroup,
	SubContent as ContextMenuSubContent,
	SubTrigger as ContextMenuSubTrigger,
	CheckboxItem as ContextMenuCheckboxItem,
};
