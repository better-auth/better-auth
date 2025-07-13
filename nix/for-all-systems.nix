{ nixpkgs, ... }:
function:

let
  systems = [
    "x86_64-linux"
    "aarch64-darwin"
  ];

  overlays = [ ];
in
nixpkgs.lib.genAttrs systems (system: function (import nixpkgs { inherit system overlays; }))
