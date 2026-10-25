{
  description = "poco — iPhone app for the notes, and the applier that runs on bach";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      forAllSystems = lib.genAttrs [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];

      # The applier and the code it shares with the app (the event format, the parsers).
      src = lib.fileset.toSource {
        root = ./.;
        fileset = lib.fileset.unions [ ./src/events.ts ./src/parse.ts ./src/events.test.ts ./src/parse.test.ts ./applier ];
      };
      applier = pkgs: pkgs.writeShellApplication {
        name = "poco-applier";
        runtimeInputs = [ pkgs.nodejs_24 ];
        text = ''exec node ${src}/applier/main.ts "$@"'';
      };
    in
    {
      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 pkgs.librsvg ];
          };
        });

      checks = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in {
          tests = pkgs.runCommand "poco-tests" { nativeBuildInputs = [ pkgs.nodejs_24 ]; } ''
            cd ${src} && node --test src/*.test.ts applier/*.test.ts && touch $out
          '';
        });

      # Everything that runs on a server: the applier, started when an event lands in
      # `_events/` and every 5 minutes as a fallback.
      nixosModules.hosting = { config, lib, pkgs, ... }:
        let cfg = config.services.poco;
        in {
          options.services.poco = {
            enable = lib.mkEnableOption "the poco applier, which turns the phone's events into edits of the notes";
            url = lib.mkOption {
              type = lib.types.str;
              example = "https://cloud.example.ts.net/remote.php/dav/files/michele/notes/";
              description = "WebDAV URL of the notes folder.";
            };
            user = lib.mkOption {
              type = lib.types.str;
              description = "Nextcloud user owning the notes.";
            };
            passwordFile = lib.mkOption {
              type = lib.types.str;
              example = "/run/agenix/poco_app_pass";
              description = "File holding a Nextcloud app password for `user`.";
            };
            eventsDir = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              example = "/data/nextcloud/data/michele/files/notes/_events";
              description = "The `_events` folder on this machine's disk. When set, the applier starts as soon as an event lands there, not only every 5 minutes.";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.poco-applier = {
              description = "Apply the poco phone's events to the notes";
              wants = [ "network-online.target" ];
              after = [ "network-online.target" ];
              environment = {
                POCO_URL = cfg.url;
                POCO_USER = cfg.user;
                POCO_PASSWORD_FILE = "%d/password";
                POCO_STATE = "/var/lib/poco/state.json";
              };
              serviceConfig = {
                Type = "oneshot";
                ExecStart = lib.getExe (applier pkgs);
                DynamicUser = true;
                StateDirectory = "poco";
                LoadCredential = "password:${cfg.passwordFile}";
              };
            };

            systemd.timers.poco-applier = {
              wantedBy = [ "timers.target" ];
              timerConfig.OnCalendar = "*:0/5";
            };

            # Nextcloud writes an upload to a temporary file and renames it in, so this
            # fires once the event is complete.
            systemd.paths.poco-applier = lib.mkIf (cfg.eventsDir != null) {
              wantedBy = [ "multi-user.target" ];
              pathConfig.PathChanged = cfg.eventsDir;
            };
          };
        };
    };
}
