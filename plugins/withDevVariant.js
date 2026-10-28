const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

/*
 * Debug builds (`npx expo run:android`, served by Metro) install as a separate app,
 * "Dev Pocket Ledger" (com.pocketledger.app.dev), next to the release APK: they never replace it
 * nor share its data. Release builds are unchanged.
 */

const SUFFIX = '.dev';

const withDebugApplicationId = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(`applicationIdSuffix "${SUFFIX}"`)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(buildTypes\s*\{\s*debug\s*\{)/,
        `$1\n            applicationIdSuffix "${SUFFIX}"`,
      );
    }
    return cfg;
  });

const withDebugAppName = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      // Debug resources override main ones: only the debug app gets the "Dev" name (first, so it shows even when the launcher cuts it).
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/debug/res/values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'strings.xml'),
        `<resources>\n  <string name="app_name">Dev ${cfg.name}</string>\n</resources>\n`,
      );
      return cfg;
    },
  ]);

module.exports = (config) => withDebugAppName(withDebugApplicationId(config));
