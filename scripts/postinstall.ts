// Runs after npm install / npm ci. Prints one line when Electron isn't signed for Widevine (npm ci
// replaces node_modules, signature included). It never signs anything and never fails the install.
// The installer sets REDZONE_INSTALLER=1 because it restores or makes the signature itself next.
import { checkSignature, signatureFacts, signatureState } from './doctor';

try {
  const facts = signatureFacts();
  const state = signatureState(facts);
  if (!process.env.REDZONE_INSTALLER && (state === 'missing' || state === 'stale')) {
    console.log(`RedZone: ${checkSignature(facts).title}. Run "Setup RedZone.cmd" or npm run sign-electron.`);
  }
} catch {
  // Never block an install over a reminder.
}
