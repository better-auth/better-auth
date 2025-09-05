import { mount, StartClient } from "@solidjs/start/client";

export default function() {
  mount(() => <StartClient />, document.getElementById("app")!);
}