/**
 * Better Auth UI - Radix-style Vanilla Primitives
 *
 * Headless behavioral components initialized via data-ba-* attributes.
 * Handles accessibility (ARIA), keyboard navigation, and focus management.
 *
 * Primitives:
 *   Dialog      data-ba-dialog, data-ba-dialog-trigger, data-ba-dialog-overlay, data-ba-dialog-content, data-ba-dialog-close
 *   Dropdown    data-ba-dropdown, data-ba-dropdown-trigger, data-ba-dropdown-content, data-ba-dropdown-item
 *   Tabs        data-ba-tabs, data-ba-tab, data-ba-tabpanel
 *   Accordion   data-ba-accordion, data-ba-accordion-item, data-ba-accordion-trigger, data-ba-accordion-content
 *   Popover     data-ba-popover, data-ba-popover-trigger, data-ba-popover-content
 *   Tooltip     data-ba-tooltip
 */
export function getPrimitives(): string {
	return `(function(){
"use strict";

/* ---- Shared utilities ---- */

function focusable(el){
return el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
}

function trapFocus(container,e){
var els=focusable(container);if(!els.length)return;
var first=els[0],last=els[els.length-1];
if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}

function positionBelow(trigger,content){
var r=trigger.getBoundingClientRect();
content.style.position="fixed";
content.style.top=(r.bottom+4)+"px";
content.style.left=r.left+"px";
content.style.minWidth=r.width+"px";
var cr=content.getBoundingClientRect();
if(cr.right>window.innerWidth)content.style.left=Math.max(0,window.innerWidth-cr.width-8)+"px";
if(cr.bottom>window.innerHeight){content.style.top=(r.top-cr.height-4)+"px";}
}

function positionAbove(trigger,content){
var r=trigger.getBoundingClientRect();
content.style.position="fixed";
content.style.left=(r.left+r.width/2)+"px";
content.style.transform="translateX(-50%)";
content.style.bottom=(window.innerHeight-r.top+6)+"px";
}

/* ---- Dialog ---- */

function initDialogs(root){
(root||document).querySelectorAll("[data-ba-dialog]").forEach(function(dlg){
if(dlg._ba_init)return;dlg._ba_init=true;
var id=dlg.getAttribute("data-ba-dialog");
var overlay=dlg.querySelector("[data-ba-dialog-overlay]");
var content=dlg.querySelector("[data-ba-dialog-content]");
var closeBtns=dlg.querySelectorAll("[data-ba-dialog-close]");
var prevFocus=null;

function open(){
prevFocus=document.activeElement;
dlg.setAttribute("aria-hidden","false");dlg.setAttribute("data-state","open");
document.body.style.overflow="hidden";
requestAnimationFrame(function(){var f=focusable(content);if(f.length)f[0].focus();});
}
function close(){
dlg.setAttribute("aria-hidden","true");dlg.setAttribute("data-state","closed");
document.body.style.overflow="";
if(prevFocus&&prevFocus.focus)prevFocus.focus();
}

document.querySelectorAll('[data-ba-dialog-trigger="'+id+'"]').forEach(function(btn){
if(btn._ba_init)return;btn._ba_init=true;
btn.addEventListener("click",function(e){e.preventDefault();open();});
});
if(overlay)overlay.addEventListener("click",close);
closeBtns.forEach(function(b){b.addEventListener("click",close);});
dlg.addEventListener("keydown",function(e){
if(e.key==="Escape"){close();return;}
if(e.key==="Tab"&&content)trapFocus(content,e);
});

dlg.__ba_open=open;dlg.__ba_close=close;
});
}

/* ---- Dropdown ---- */

function initDropdowns(root){
(root||document).querySelectorAll("[data-ba-dropdown]").forEach(function(dd){
if(dd._ba_init)return;dd._ba_init=true;
var trigger=dd.querySelector("[data-ba-dropdown-trigger]");
var content=dd.querySelector("[data-ba-dropdown-content]");
if(!trigger||!content)return;
var isOpen=false;

function open(){
isOpen=true;
positionBelow(trigger,content);
content.setAttribute("data-state","open");content.hidden=false;
trigger.setAttribute("aria-expanded","true");
var items=content.querySelectorAll("[data-ba-dropdown-item]");
if(items.length)items[0].focus();
}
function close(){
isOpen=false;
content.setAttribute("data-state","closed");content.hidden=true;
trigger.setAttribute("aria-expanded","false");
trigger.focus();
}

trigger.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();isOpen?close():open();});
content.hidden=true;content.setAttribute("data-state","closed");
trigger.setAttribute("aria-expanded","false");trigger.setAttribute("aria-haspopup","menu");

content.addEventListener("keydown",function(e){
var items=Array.from(content.querySelectorAll("[data-ba-dropdown-item]:not([disabled])"));
var idx=items.indexOf(document.activeElement);
if(e.key==="ArrowDown"){e.preventDefault();if(idx<items.length-1)items[idx+1].focus();}
else if(e.key==="ArrowUp"){e.preventDefault();if(idx>0)items[idx-1].focus();}
else if(e.key==="Home"){e.preventDefault();if(items.length)items[0].focus();}
else if(e.key==="End"){e.preventDefault();if(items.length)items[items.length-1].focus();}
else if(e.key==="Escape"){close();}
});

content.querySelectorAll("[data-ba-dropdown-item]").forEach(function(item){
item.addEventListener("click",function(){close();});
});

document.addEventListener("click",function(e){if(isOpen&&!dd.contains(e.target))close();});
});
}

/* ---- Tabs ---- */

function initTabs(root){
(root||document).querySelectorAll("[data-ba-tabs]").forEach(function(container){
if(container._ba_init)return;container._ba_init=true;
var defaultTab=container.getAttribute("data-ba-tabs-default");
var tabs=Array.from(container.querySelectorAll("[data-ba-tab]"));
var panels=Array.from(container.querySelectorAll("[data-ba-tabpanel]"));

function activate(tabId){
tabs.forEach(function(t){
var active=t.getAttribute("data-ba-tab")===tabId;
t.setAttribute("aria-selected",String(active));
t.setAttribute("data-state",active?"active":"inactive");
t.setAttribute("tabindex",active?"0":"-1");
});
panels.forEach(function(p){
var active=p.getAttribute("data-ba-tabpanel")===tabId;
p.hidden=!active;p.setAttribute("data-state",active?"active":"inactive");
});
}

tabs.forEach(function(tab){
tab.setAttribute("role","tab");
tab.addEventListener("click",function(){activate(tab.getAttribute("data-ba-tab"));});
});
panels.forEach(function(p){p.setAttribute("role","tabpanel");});

var tablist=tabs[0]&&tabs[0].parentElement;
if(tablist){
tablist.setAttribute("role","tablist");
tablist.addEventListener("keydown",function(e){
var idx=tabs.indexOf(document.activeElement);if(idx<0)return;
if(e.key==="ArrowRight"){e.preventDefault();var n=tabs[(idx+1)%tabs.length];n.focus();activate(n.getAttribute("data-ba-tab"));}
else if(e.key==="ArrowLeft"){e.preventDefault();var p=tabs[(idx-1+tabs.length)%tabs.length];p.focus();activate(p.getAttribute("data-ba-tab"));}
else if(e.key==="Home"){e.preventDefault();tabs[0].focus();activate(tabs[0].getAttribute("data-ba-tab"));}
else if(e.key==="End"){e.preventDefault();var l=tabs[tabs.length-1];l.focus();activate(l.getAttribute("data-ba-tab"));}
});
}

activate(defaultTab||tabs[0]&&tabs[0].getAttribute("data-ba-tab")||"");
});
}

/* ---- Accordion ---- */

function initAccordions(root){
(root||document).querySelectorAll("[data-ba-accordion]").forEach(function(acc){
if(acc._ba_init)return;acc._ba_init=true;
var type=acc.getAttribute("data-ba-accordion-type")||"single";
var items=Array.from(acc.querySelectorAll("[data-ba-accordion-item]"));

items.forEach(function(item){
var trigger=item.querySelector("[data-ba-accordion-trigger]");
var content=item.querySelector("[data-ba-accordion-content]");
if(!trigger||!content)return;
content.hidden=true;content.setAttribute("data-state","closed");
trigger.setAttribute("aria-expanded","false");

trigger.addEventListener("click",function(){
var wasOpen=content.getAttribute("data-state")==="open";
if(type==="single"){
items.forEach(function(other){
var oc=other.querySelector("[data-ba-accordion-content]");
var ot=other.querySelector("[data-ba-accordion-trigger]");
if(oc){oc.hidden=true;oc.setAttribute("data-state","closed");}
if(ot)ot.setAttribute("aria-expanded","false");
});
}
if(!wasOpen){
content.hidden=false;content.setAttribute("data-state","open");
trigger.setAttribute("aria-expanded","true");
}
});
});
});
}

/* ---- Popover ---- */

function initPopovers(root){
(root||document).querySelectorAll("[data-ba-popover]").forEach(function(pop){
if(pop._ba_init)return;pop._ba_init=true;
var trigger=pop.querySelector("[data-ba-popover-trigger]");
var content=pop.querySelector("[data-ba-popover-content]");
if(!trigger||!content)return;
var isOpen=false;

function open(){
isOpen=true;
positionBelow(trigger,content);
content.hidden=false;content.setAttribute("data-state","open");
trigger.setAttribute("aria-expanded","true");
var f=focusable(content);if(f.length)f[0].focus();
}
function close(){
isOpen=false;
content.hidden=true;content.setAttribute("data-state","closed");
trigger.setAttribute("aria-expanded","false");
}

trigger.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();isOpen?close():open();});
trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");
content.hidden=true;content.setAttribute("data-state","closed");

content.addEventListener("keydown",function(e){
if(e.key==="Escape")close();
if(e.key==="Tab")trapFocus(content,e);
});
document.addEventListener("click",function(e){if(isOpen&&!pop.contains(e.target))close();});
});
}

/* ---- Tooltip ---- */

function initTooltips(root){
(root||document).querySelectorAll("[data-ba-tooltip]").forEach(function(el){
if(el._ba_init)return;el._ba_init=true;
var text=el.getAttribute("data-ba-tooltip");
var tip=document.createElement("div");
tip.className="ba-tooltip";tip.textContent=text;tip.setAttribute("role","tooltip");
tip.hidden=true;document.body.appendChild(tip);
var showTimer,hideTimer;

function show(){
clearTimeout(hideTimer);
showTimer=setTimeout(function(){
positionAbove(el,tip);
tip.hidden=false;tip.setAttribute("data-state","open");
},300);
}
function hide(){
clearTimeout(showTimer);
hideTimer=setTimeout(function(){
tip.hidden=true;tip.setAttribute("data-state","closed");
},100);
}
el.addEventListener("mouseenter",show);el.addEventListener("mouseleave",hide);
el.addEventListener("focus",show);el.addEventListener("blur",hide);
});
}

/* ---- Alert Dialog ---- */

function initAlertDialogs(root){
(root||document).querySelectorAll("[data-ba-alert-dialog]").forEach(function(dlg){
if(dlg._ba_init)return;dlg._ba_init=true;
var id=dlg.getAttribute("data-ba-alert-dialog");
var overlay=dlg.querySelector("[data-ba-alert-dialog-overlay]");
var content=dlg.querySelector("[data-ba-alert-dialog-content]");
var cancelBtns=dlg.querySelectorAll("[data-ba-alert-dialog-cancel]");
var actionBtns=dlg.querySelectorAll("[data-ba-alert-dialog-action]");
var prevFocus=null;

function open(){
prevFocus=document.activeElement;
dlg.setAttribute("aria-hidden","false");dlg.setAttribute("data-state","open");
document.body.style.overflow="hidden";
requestAnimationFrame(function(){
var c=cancelBtns[0];if(c)c.focus();
});
}
function close(){
dlg.setAttribute("aria-hidden","true");dlg.setAttribute("data-state","closed");
document.body.style.overflow="";
if(prevFocus&&prevFocus.focus)prevFocus.focus();
}

document.querySelectorAll('[data-ba-alert-dialog-trigger="'+id+'"]').forEach(function(btn){
if(btn._ba_init)return;btn._ba_init=true;
btn.addEventListener("click",function(e){e.preventDefault();open();});
});
cancelBtns.forEach(function(b){b.addEventListener("click",close);});
actionBtns.forEach(function(b){b.addEventListener("click",close);});
dlg.addEventListener("keydown",function(e){
if(e.key==="Escape"){close();return;}
if(e.key==="Tab"&&content)trapFocus(content,e);
});

dlg.__ba_open=open;dlg.__ba_close=close;
});
}

/* ---- Switch ---- */

function initSwitches(root){
(root||document).querySelectorAll("[data-ba-switch]").forEach(function(sw){
if(sw._ba_init)return;sw._ba_init=true;
var input=sw.querySelector("input[type=checkbox]");
if(!input)return;

function sync(){
sw.setAttribute("data-state",input.checked?"checked":"unchecked");
sw.setAttribute("aria-checked",String(input.checked));
}
sync();
input.addEventListener("change",sync);
sw.addEventListener("click",function(e){
if(e.target===input)return;
input.checked=!input.checked;
input.dispatchEvent(new Event("change",{bubbles:true}));
});
sw.addEventListener("keydown",function(e){
if(e.key===" "||e.key==="Enter"){
e.preventDefault();
input.checked=!input.checked;
input.dispatchEvent(new Event("change",{bubbles:true}));
}
});
});
}

/* ---- Custom Select ---- */

function initSelects(root){
(root||document).querySelectorAll("[data-ba-select]").forEach(function(sel){
if(sel._ba_init)return;sel._ba_init=true;
var trigger=sel.querySelector("[data-ba-select-trigger]");
var content=sel.querySelector("[data-ba-select-content]");
var hiddenInput=sel.querySelector("input[type=hidden]");
var display=sel.querySelector("[data-ba-select-value]");
if(!trigger||!content)return;
var isOpen=false;

function open(){
isOpen=true;
positionBelow(trigger,content);
content.hidden=false;content.setAttribute("data-state","open");
trigger.setAttribute("aria-expanded","true");
var items=content.querySelectorAll("[data-ba-select-item]");
var val=hiddenInput?hiddenInput.value:"";
items.forEach(function(it){
it.setAttribute("data-selected",String(it.getAttribute("data-value")===val));
if(it.getAttribute("data-value")===val)it.focus();
});
}
function close(){
isOpen=false;
content.hidden=true;content.setAttribute("data-state","closed");
trigger.setAttribute("aria-expanded","false");
trigger.focus();
}
function selectItem(item){
var val=item.getAttribute("data-value");
var label=item.textContent;
if(hiddenInput)hiddenInput.value=val;
if(display)display.textContent=label;
content.querySelectorAll("[data-ba-select-item]").forEach(function(it){
it.setAttribute("data-selected",String(it===item));
});
close();
if(hiddenInput)hiddenInput.dispatchEvent(new Event("change",{bubbles:true}));
}

trigger.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();isOpen?close():open();});
trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");
content.hidden=true;content.setAttribute("data-state","closed");content.setAttribute("role","listbox");

content.addEventListener("keydown",function(e){
var items=Array.from(content.querySelectorAll("[data-ba-select-item]:not([disabled])"));
var idx=items.indexOf(document.activeElement);
if(e.key==="ArrowDown"){e.preventDefault();if(idx<items.length-1)items[idx+1].focus();}
else if(e.key==="ArrowUp"){e.preventDefault();if(idx>0)items[idx-1].focus();}
else if(e.key==="Enter"||e.key===" "){e.preventDefault();if(idx>=0)selectItem(items[idx]);}
else if(e.key==="Escape"){close();}
});
content.querySelectorAll("[data-ba-select-item]").forEach(function(item){
item.setAttribute("role","option");item.setAttribute("tabindex","-1");
item.addEventListener("click",function(){selectItem(item);});
});
document.addEventListener("click",function(e){if(isOpen&&!sel.contains(e.target))close();});
});
}

/* ---- Checkbox ---- */

function initCheckboxes(root){
(root||document).querySelectorAll("[data-ba-checkbox]").forEach(function(cb){
if(cb._ba_init)return;cb._ba_init=true;
var input=cb.querySelector("input[type=checkbox]");
if(!input)return;
var indicator=cb.querySelector("[data-ba-checkbox-indicator]");

function sync(){
var checked=input.checked;
cb.setAttribute("data-state",checked?"checked":"unchecked");
cb.setAttribute("aria-checked",String(checked));
if(indicator)indicator.hidden=!checked;
}
sync();
input.addEventListener("change",sync);
cb.addEventListener("click",function(e){
if(e.target===input)return;
input.checked=!input.checked;
input.dispatchEvent(new Event("change",{bubbles:true}));
});
cb.addEventListener("keydown",function(e){
if(e.key===" "||e.key==="Enter"){
e.preventDefault();
input.checked=!input.checked;
input.dispatchEvent(new Event("change",{bubbles:true}));
}
});
});
}

/* ---- OTP Input ---- */

function initOtp(root){
(root||document).querySelectorAll("[data-ba-otp]").forEach(function(otp){
if(otp._ba_init)return;otp._ba_init=true;
var inputs=Array.from(otp.querySelectorAll("input"));
var hidden=otp.querySelector("input[type=hidden]");

function syncHidden(){
if(hidden)hidden.value=inputs.map(function(i){return i.value}).join("");
}

inputs.forEach(function(inp,i){
inp.setAttribute("maxlength","1");
inp.setAttribute("inputmode","numeric");
inp.setAttribute("autocomplete","one-time-code");
inp.style.textAlign="center";

inp.addEventListener("input",function(){
var v=inp.value.replace(/[^0-9]/g,"");
inp.value=v.slice(0,1);
syncHidden();
if(v&&i<inputs.length-1)inputs[i+1].focus();
});
inp.addEventListener("keydown",function(e){
if(e.key==="Backspace"&&!inp.value&&i>0){
inputs[i-1].focus();inputs[i-1].value="";syncHidden();
}
if(e.key==="ArrowLeft"&&i>0){e.preventDefault();inputs[i-1].focus();}
if(e.key==="ArrowRight"&&i<inputs.length-1){e.preventDefault();inputs[i+1].focus();}
});
inp.addEventListener("paste",function(e){
e.preventDefault();
var paste=(e.clipboardData||window.clipboardData).getData("text").replace(/[^0-9]/g,"");
for(var j=0;j<inputs.length&&j<paste.length;j++){inputs[j].value=paste[j];}
syncHidden();
if(paste.length>0)inputs[Math.min(paste.length,inputs.length)-1].focus();
});
});
});
}

/* ---- Password Toggle ---- */

function initPasswordToggle(root){
(root||document).querySelectorAll("[data-ba-password]").forEach(function(wrap){
if(wrap._ba_init)return;wrap._ba_init=true;
var input=wrap.querySelector("input");
var toggle=wrap.querySelector("[data-ba-password-toggle]");
if(!input||!toggle)return;

toggle.addEventListener("click",function(e){
e.preventDefault();
var isPassword=input.type==="password";
input.type=isPassword?"text":"password";
wrap.setAttribute("data-state",isPassword?"visible":"hidden");
toggle.setAttribute("aria-label",isPassword?"Hide password":"Show password");
input.focus();
});
});
}

/* ---- Toast ---- */

var toastContainer=null;
function ensureToastContainer(){
if(toastContainer)return;
toastContainer=document.createElement("div");
toastContainer.className="ba-toast-container";
document.body.appendChild(toastContainer);
}

window.__ba_toast=function(message,opts){
ensureToastContainer();
opts=opts||{};
var toast=document.createElement("div");
toast.className="ba-toast"+(opts.variant?" ba-toast-"+opts.variant:"");
toast.textContent=message;
toast.setAttribute("role","alert");

var close=document.createElement("button");
close.className="ba-toast-close";close.innerHTML="&times;";close.setAttribute("aria-label","Dismiss");
close.addEventListener("click",function(){remove();});
toast.appendChild(close);

toastContainer.appendChild(toast);
requestAnimationFrame(function(){toast.setAttribute("data-state","open");});

var duration=opts.duration||4000;
var timer=setTimeout(remove,duration);
function remove(){
clearTimeout(timer);
toast.setAttribute("data-state","closed");
setTimeout(function(){if(toast.parentNode)toast.parentNode.removeChild(toast);},200);
}
};

/* ---- Init ---- */

function initAll(root){
initDialogs(root);initAlertDialogs(root);initDropdowns(root);initTabs(root);
initAccordions(root);initPopovers(root);initTooltips(root);
initSwitches(root);initSelects(root);initCheckboxes(root);
initOtp(root);initPasswordToggle(root);
}
initAll(document);
document.addEventListener("ba:navigated",function(){
var m=document.getElementById("ba-main");if(m)initAll(m);
});
})();`;
}
