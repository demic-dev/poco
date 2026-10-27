# poco

An iPhone app for a folder of Markdown notes in Nextcloud: capture into `inbox.md`, pick one to three things for the day, mark them done. Named after "poco a poco".

The phone never edits a note. It reads the notes over WebDAV, keeping a copy of every note and of the images they link to for reading offline, and uploads each action as a small JSON event to `notes/_events/`. The applier, a script on the server, turns events into edits of the Markdown and deletes them. The phone's own settings and history are in `notes/.poco/state.json`, the only file it writes besides its events.

## Layout

```
App.tsx, src/        the app (Expo, React Native, TypeScript)
src/events.ts        the event format, shared by the app and the applier
src/parse.ts         the Markdown parsers, shared too
targets/             Swift: widgets, Control Center control, share extension, Shortcuts
modules/poco-native  a small native module (App Group, background time)
plugins/             config plugins for the Swift pieces
applier/             the applier (Node, run on the server)
flake.nix            dev shell, tests, and nixosModules.hosting for the applier
```

## Develop

```bash
nix develop path:.          # Node 24, librsvg
npm install
npm test                    # app tests
npx tsc --noEmit && npx tsc --noEmit -p applier
nix flake check path:.      # all tests, app and applier, in the sandbox
```

## Ship

The app is built once on EAS and installed with SideStore. After that, JS changes go out as EAS Updates:

```bash
nix develop path:. -c npm run update -- --message "what changed"
```

The update reaches a build only if the native fingerprint matches. Changes to Swift, native modules, `app.json` or `package.json` scripts need a new build:

```bash
nix develop path:. -c npx eas-cli build -p ios --profile sideload
```

## Server

`nixosModules.hosting` runs the applier: a path unit on `_events/` and a 5-minute timer.

```nix
services.poco = {
  enable = true;
  url = "https://cloud.example/remote.php/dav/files/<user>/notes/";
  user = "<user>";
  passwordFile = "/run/agenix/poco_app_pass"; # a Nextcloud app password
  eventsDir = "/path/to/nextcloud/data/<user>/files/notes/_events";
};
```

Create the app password in a session logged in with the same login as `user`. One made in a session logged in with the email address doesn't work with the user name.
