# Signing the Mac app

`release-mac.yml` builds `TappedIn.dmg` (universal: Apple Silicon + Intel) on every `v*` tag. Apple signing works in one of two modes. **Which secrets exist decides the mode**: nothing in the code or workflow changes when you switch.

| | Mode A (now) | Mode B (with an Apple Developer account) |
|---|---|---|
| Apple signature | ad hoc (`codesign --sign -`) | Developer ID Application, hardened runtime, `installer/mac/entitlements.plist` |
| Notarized | no | yes, and stapled to the app and the .dmg |
| First launch | macOS blocks it once; the user clicks **Open Anyway** in System Settings (README, website) | opens normally |
| Updates | the app shows "TappedIn x.y is available" with a **Download** button | automatic (Squirrel.Mac, built into Electron), installed on restart |
| Turned on by | no `MAC_CERT_P12` secret | the `MAC_CERT_P12` secret |

Both modes need the castLabs VMP signature for Widevine, or video won't play.

## Secrets

Add them in GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

### Widevine (both modes): already set for Windows

| Secret | What it is |
|---|---|
| `EVS_ACCOUNT_NAME` | Your castLabs EVS account name. It's the same account the Windows build uses; EVS signs Mac builds too. |
| `EVS_PASSWD` | Its password. |

If you don't have them yet:
1. `pip install castlabs-evs`, then `python3 -m castlabs_evs.account signup`. It's free; castLabs emails a code.
2. Add both secrets.

### Mode B: Apple Developer ID

You need an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year; the individual membership is enough). Only the account holder can create the certificate below.

| Secret | How to get it |
|---|---|
| `MAC_CERT_P12` | The **Developer ID Application** certificate and its private key, as base64. See "Getting the certificate" below. |
| `MAC_CERT_PASSWORD` | The password you chose when exporting the `.p12`. |
| `APPLE_TEAM_ID` | developer.apple.com → **Account → Membership details → Team ID** (10 characters). |

**Getting the certificate.**
1. On a Mac, open **Xcode → Settings → Accounts**, add your Apple ID, then **Manage Certificates… → + → Developer ID Application**. Without Xcode: make a certificate signing request in Keychain Access (**Certificate Assistant → Request a Certificate From a Certificate Authority**), then upload it at developer.apple.com → **Certificates → + → Developer ID Application**, and double-click the downloaded certificate.
2. In **Keychain Access → login → My Certificates**, right-click **Developer ID Application: …** → **Export…** → `.p12`, and choose a password.
3. Run `base64 -i Certificates.p12 | pbcopy` and paste the result as the secret.

Notarization needs **one** of these two sets. The API key is preferred: it isn't tied to a person's Apple ID and doesn't expire with a password change.

**Option 1: App Store Connect API key**

| Secret | How to get it |
|---|---|
| `APPLE_API_KEY_P8` | appstoreconnect.apple.com → **Users and Access → Integrations → App Store Connect API → Team Keys → +**, access **Developer**. Download the `.p8` (you can only download it once) and paste its whole contents, `-----BEGIN PRIVATE KEY-----` lines included. |
| `APPLE_API_KEY_ID` | The key's **Key ID** in that list. |
| `APPLE_API_ISSUER` | The **Issuer ID** above the list. |

**Option 2: Apple ID**

| Secret | How to get it |
|---|---|
| `APPLE_ID` | The Apple ID email of a member of the team. |
| `APPLE_APP_PASSWORD` | appleid.apple.com → **Sign-In and Security → App-Specific Passwords → +**. |
| `APPLE_TEAM_ID` | As above. |

With `MAC_CERT_P12` set but no notarization credentials, the build stops with a message rather than shipping an app that's signed but not notarized.

### Website (both modes): already set for Windows
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, the same as `release.yml` (see website/README.md). The Mac job uploads `TappedIn.dmg`, `TappedIn-mac.zip` and `latest-mac.json`; the Windows objects aren't touched.

## What the build does, in order (`installer/mac/build-mac.sh`)

1. **Stage:** `git archive HEAD` + `npm ci`, like the Windows installer. It adds the other architecture's esbuild binary, and the app's `package.json` gets `main` (the Mac entry) and `tappedin.macUpdates` (`notice` in Mode A, `auto` in Mode B).
2. **Universal Electron:** castLabs' darwin-arm64 and darwin-x64 zips, checked against castLabs' `checksums.json` and merged with `@electron/universal`.
3. **Universal Node:** v24.20.0 arm64 + x64, SHA-checked, joined with `lipo`.
4. **Bundle:**
   - name TappedIn, bundle ID `io.github.omcaul13.tappedin` (permanent: updates key off it)
   - version from package.json, category Sports
   - icon from `installer/mac/icon-1024.png`
   - the minimum macOS is castLabs Electron's own
5. **castLabs VMP signature** (`scripts/evs.py vmp sign-pkg`, then `verify-pkg`). It comes **after packaging and before Apple signing**: Apple's signature seals every file in the bundle, so VMP-signing afterwards would break it.
6. **Apple signature** with `@electron/osx-sign`, inner binaries first. It covers the Electron helpers, `runtime/node` and esbuild (every Mach-O file, nothing else), then the app. Then `codesign --verify --deep --strict`.
7. **Mode B only:** `xcrun notarytool submit --wait`, then `xcrun stapler staple`.
8. **Packaging:** `TappedIn.dmg` (the app plus an Applications link; in Mode B it's signed, notarized and stapled too), `TappedIn-mac.zip` (for Squirrel updates) and `dist/mac-info.json`.

**Entitlements** (`installer/mac/entitlements.plist`, used for the app, its helpers and Node). They matter only under the hardened runtime:
- `cs.allow-jit` and `cs.allow-unsigned-executable-memory`: V8 compiles JavaScript at run time.
- `cs.disable-library-validation`: the Widevine CDM is downloaded at run time and signed by Google, not by your team. Without this, library validation refuses to load it and **video won't play** under the hardened runtime.

## Building on your own Mac

```bash
bash installer/mac/build-mac.sh --unsigned
```

That's Mode A without the VMP signature: the app runs, but video won't play. Leave out `--unsigned` after signing in to EVS once (`python3 -I scripts/evs.py account reauth`). For Mode B, set `MAC_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"` plus one set of notarization variables (`APPLE_API_KEY_PATH` pointing to the `.p8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`; or `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`).

To check a build:

```bash
codesign -dv --verbose=4 build/mac/out/TappedIn.app
```

```bash
spctl -a -vv build/mac/out/TappedIn.app
```

```bash
xcrun stapler validate dist/TappedIn.dmg
```

`spctl` says *rejected* in Mode A, which is expected, and *accepted, source=Notarized Developer ID* in Mode B.

## After switching to Mode B

Once a Mode B release is out, delete the unsigned-only first-launch steps:
- README: the block between `<!-- unsigned-mac:start -->` and `<!-- unsigned-mac:end -->`
- website install guide: the `<section data-unsigned-mac>`
- docs/mac-testing.md: section 2

Users on a Mode A build don't update automatically: their "new version" notice links to the new .dmg, which they install once by hand. Updates are automatic from then on.
