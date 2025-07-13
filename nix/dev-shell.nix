{ pkgs }:

pkgs.mkShell {
  packages = [
    pkgs.bun
    pkgs.pnpm
    pkgs.nodejs
  ];

  BIOME_BINARY = "${pkgs.biome}/bin/biome";

  shellHook = ''
    cp -n ./docs/.env.example ./docs/.env
  '';
}
