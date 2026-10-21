// The two steps of build-mac.sh that need Electron's own tools (installer/mac/package.json):
//   node tools.mjs universal <x64 Electron.app> <arm64 Electron.app> <out .app>
//   node tools.mjs sign <TappedIn.app> <identity | -> <entitlements.plist>
// "-" signs ad hoc (Mode A: no Apple account); a Developer ID identity also turns on the hardened runtime (Mode B).
import { openSync, readSync, closeSync } from 'node:fs';
import { makeUniversalApp } from '@electron/universal';
import { sign } from '@electron/osx-sign';

const MACHO = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

/** Mach-O executables and libraries only: osx-sign would otherwise sign every PNG, font and gzip in the app's files too. */
function isMachO(file) {
  const buf = Buffer.alloc(4);
  let fd;
  try {
    fd = openSync(file, 'r');
    return readSync(fd, buf, 0, 4, 0) === 4 && MACHO.has(buf.readUInt32BE(0));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'universal' && args.length === 3) {
  const [x64AppPath, arm64AppPath, outAppPath] = args;
  await makeUniversalApp({ x64AppPath, arm64AppPath, outAppPath, force: true });
} else if (cmd === 'sign' && args.length === 3) {
  const [app, identity, entitlements] = args;
  const developerId = identity !== '-';
  await sign({
    app,
    identity,
    platform: 'darwin',
    type: 'distribution',
    // Ad hoc has no certificate to look up; a Developer ID is checked against the keychain.
    identityValidation: developerId,
    preAutoEntitlements: false,
    ignore: (file) => !isMachO(file) && !file.endsWith('.app') && !file.endsWith('.framework'),
    optionsForFile: () => ({ hardenedRuntime: developerId, entitlements }),
  });
} else {
  console.error('usage: node tools.mjs universal <x64.app> <arm64.app> <out.app> | sign <app> <identity|-> <entitlements.plist>');
  process.exit(2);
}
