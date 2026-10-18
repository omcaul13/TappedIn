import tls from 'node:tls';

// Trust the certificates Windows trusts, not only Node's built-in list. Antivirus "web shields" (Norton
// on this laptop) re-sign HTTPS with their own root, which Windows trusts but Node doesn't: without
// this every ESPN request fails with "fetch failed" (UNABLE_TO_VERIFY_LEAF_SIGNATURE) unless the
// terminal happens to set NODE_USE_SYSTEM_CA=1. Imported for its side effect by the modules that fetch.

type TlsWithCa = typeof tls & {
  getCACertificates?: (type: 'default' | 'system' | 'bundled' | 'extra') => string[];
  setDefaultCACertificates?: (certs: string[]) => void;
};

const t = tls as TlsWithCa;
if (t.getCACertificates && t.setDefaultCACertificates) {
  try {
    t.setDefaultCACertificates([...new Set([...t.getCACertificates('default'), ...t.getCACertificates('system')])]);
  } catch {
    // Older Node or no system store: keep the defaults.
  }
}
