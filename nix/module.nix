{ config, lib, ... }:

let
  cfg = config.services.localaction;
in
{
  options.services.localaction = {
    enable = lib.mkEnableOption "LocalAction";

    package = lib.mkOption {
      type = lib.types.package;
      description = "LocalAction package to run.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address on which LocalAction listens.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 7373;
      description = "TCP port on which LocalAction listens.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open the LocalAction port in the NixOS firewall.";
    };
  };

  config = lib.mkIf cfg.enable {
    networking.firewall.allowedTCPPorts = lib.optional cfg.openFirewall cfg.port;

    systemd.services.localaction = {
      description = "LocalAction personal task server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      serviceConfig = {
        DynamicUser = true;
        StateDirectory = "localaction";
        WorkingDirectory = "/var/lib/localaction";
        UMask = "0077";

        ExecStart = lib.escapeShellArgs [
          (lib.getExe cfg.package)
          "--host"
          cfg.host
          "--port"
          (toString cfg.port)
          "--db"
          "/var/lib/localaction/localaction.sqlite"
        ];

        Restart = "on-failure";
        RestartSec = "5s";

        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectSystem = "strict";
      };
    };
  };
}
