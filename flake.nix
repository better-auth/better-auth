{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    inputs:
    let
      lib = import ./nix inputs;
    in
    {
      devShells = lib.forAllSystems (pkgs: {
        default = lib.devShell pkgs;
      });

      formatter = lib.forAllSystems (pkgs: lib.formatter pkgs);
    };
}
