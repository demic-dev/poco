// Adds AppShortcuts.swift to the app target only. An AppShortcutsProvider belongs
// in the app; the intents it lists are in targets/widget/_shared (app and widget).
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName);
      fs.copyFileSync(path.join(__dirname, 'AppShortcuts.swift'), path.join(dir, 'AppShortcuts.swift'));
      return c;
    },
  ]);
  return withXcodeProject(config, (c) => {
    const name = c.modRequest.projectName;
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: `${name}/AppShortcuts.swift`, groupName: name, project: c.modResults });
    return c;
  });
};
