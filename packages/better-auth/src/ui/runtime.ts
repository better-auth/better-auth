/**
 * Better Auth UI - Thin Client Runtime
 *
 * ~50 lines. No reactive state, no expression eval, no virtual DOM.
 * Just: navigation, form actions, query params, native dialogs.
 *
 *   data-nav="/path"            Click to navigate (partial swap)
 *   data-action="/api/path"     Form submit → POST JSON → refresh
 *   data-param="key"            Input → update query param → re-fetch
 *   data-confirm="msg"          Confirm before action
 *   <dialog>                    Native modal (use .showModal()/.close())
 */
export function getRuntime(basePath: string): string {
	return `(function(){
var B="${basePath}";
function swap(html){var m=document.getElementById("ba-main");if(m)m.innerHTML=html;document.dispatchEvent(new CustomEvent("ba:navigated"));}
function nav(url){
history.pushState(null,"",url);
return fetch(url,{credentials:"include",headers:{"X-BA-Partial":"true"}})
.then(function(r){return r.text()}).then(swap);
}
var dt;
document.addEventListener("click",function(e){
var a=e.target.closest("[data-nav]");
if(a){e.preventDefault();nav(a.getAttribute("data-nav"));}
var t=e.target.closest("[data-toggle]");
if(t){var el=document.getElementById(t.getAttribute("data-toggle"));if(el&&el.tagName==="DIALOG"){el.open?el.close():el.showModal();}else if(el){el.hidden=!el.hidden;}}
});
document.addEventListener("submit",function(e){
var f=e.target.closest("[data-action]");
if(!f)return;e.preventDefault();
var msg=f.getAttribute("data-confirm");
if(msg&&!confirm(msg))return;
var action=B+f.getAttribute("data-action");
var body={};new FormData(f).forEach(function(v,k){body[k]=v;});
fetch(action,{method:"POST",credentials:"include",
headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
.then(function(r){return r.json()}).then(function(){
return fetch(location.href,{credentials:"include",headers:{"X-BA-Partial":"true"}})
.then(function(r){return r.text()}).then(swap);
});
});
document.addEventListener("input",function(e){
var el=e.target.closest("[data-param]");
if(!el)return;
clearTimeout(dt);dt=setTimeout(function(){
var key=el.getAttribute("data-param");
var u=new URL(location.href);
if(el.value)u.searchParams.set(key,el.value);else u.searchParams.delete(key);
u.searchParams.delete("page");
nav(u.toString());
},300);
});
window.addEventListener("popstate",function(){
fetch(location.href,{credentials:"include",headers:{"X-BA-Partial":"true"}})
.then(function(r){return r.text()}).then(swap);
});
window.__ba={nav:nav,basePath:B};
})();`;
}
