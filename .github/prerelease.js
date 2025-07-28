import { exec } from "child_process";

exec("npx changeset pre enter next");
exec("npx changeset version");
exec("npm install");
