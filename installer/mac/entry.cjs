// The Mac app's entry point: build-mac.sh copies it to Contents/Resources/app/electron/ and makes it the
// app's "main". A packaged Electron always starts here, whatever script it is given, so this picks one:
// started by the app itself as `<TappedIn.app's Electron> …/electron/main.cjs --port=…` it runs the window;
// opened from Finder or the Dock it runs the launcher (which starts the app's Node process).
const path = require('node:path');

const main = path.join(__dirname, 'main.cjs');
const script = process.argv[1];
require(script && path.resolve(script) === main ? main : './launcher.cjs');
