{
  description = "LocalAction personal task server";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      bunDeps = pkgs.stdenvNoCC.mkDerivation {
        pname = "localaction-bun-dependencies";
        version = "0.0.0";
        src = ./.;

        nativeBuildInputs = [ pkgs.bun pkgs.cacert ];
        dontConfigure = true;
        dontFixup = true;

        buildPhase = ''
          runHook preBuild
          export HOME="$TMPDIR"
          mkdir -p "$TMPDIR/bun-cache"
          bun install \
            --backend copyfile \
            --linker hoisted \
            --cache-dir "$TMPDIR/bun-cache" \
            --frozen-lockfile \
            --ignore-scripts \
            --no-progress
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          rm -rf node_modules
          mkdir -p "$out"
          cp -R "$TMPDIR/bun-cache/." "$out/"
          runHook postInstall
        '';

        outputHash = "sha256-2882n7uOhzccxSOR1ncW+HcCEiotUQRMEVcjxGXWzyI=";
        outputHashAlgo = "sha256";
        outputHashMode = "recursive";
      };

      localaction = pkgs.stdenvNoCC.mkDerivation {
        pname = "localaction";
        version = "0.0.0";
        src = ./.;

        nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper pkgs.nodejs ];
        dontConfigure = true;

        buildPhase = ''
          runHook preBuild
          export HOME="$TMPDIR"
          cp -R ${bunDeps} "$TMPDIR/bun-cache"
          chmod -R u+w "$TMPDIR/bun-cache"
          bun install \
            --backend copyfile \
            --cache-dir "$TMPDIR/bun-cache" \
            --linker hoisted \
            --frozen-lockfile \
            --ignore-scripts \
            --no-progress \
            --offline
          ln -sfn ../vite/bin/vite.js node_modules/.bin/vite
          patchShebangs --build node_modules/typescript/bin/tsc
          substituteInPlace node_modules/vite/bin/vite.js \
            --replace-fail '#!/usr/bin/env node' '#!${pkgs.bun}/bin/bun'
          bun run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p "$out/bin" "$out/libexec/localaction"
          cp -R dist-bundle/. "$out/libexec/localaction/"
          makeWrapper ${pkgs.bun}/bin/bun "$out/bin/localaction" \
            --add-flags "$out/libexec/localaction/localaction.js"
          runHook postInstall
        '';

        meta = {
          description = "Local-first personal task and notes server";
          homepage = "https://forgejo.appz/nibblebot/localaction";
          license = pkgs.lib.licenses.agpl3Plus;
          mainProgram = "localaction";
          platforms = [ system ];
        };
      };
    in
    {
      packages.${system} = {
        inherit localaction;
        default = localaction;
      };

      nixosModules.localaction = { lib, pkgs, ... }: {
        imports = [ ./nix/module.nix ];
        services.localaction.package = lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.localaction;
      };

      nixosModules.default = self.nixosModules.localaction;
    };
}
