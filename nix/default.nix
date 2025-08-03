inputs:

{
  forAllSystems = import ./for-all-systems.nix inputs;
  devShell = pkgs: import ./dev-shell.nix { inherit pkgs; };
  formatter = pkgs: import ./formatter.nix { inherit pkgs; };
}
