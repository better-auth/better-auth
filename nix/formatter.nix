{ pkgs }:

pkgs.treefmt.withConfig {
  runtimeInputs = [ pkgs.nixfmt-rfc-style ];

  settings = {
    # Log level for files treefmt won't format
    on-unmatched = "info";

    # Configure nixfmt for .nix files
    formatter.nixfmt = {
      command = "nixfmt";
      includes = [ "*.nix" ];
    };
  };
}
