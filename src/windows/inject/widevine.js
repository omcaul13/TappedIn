// Asks the browser for a Widevine key system (no license request, no content involved).
// Only tells us whether Chrome's Widevine CDM is present and usable in this profile.
(async () => {
  const config = [{
    initDataTypes: ['cenc'],
    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
  }];
  try {
    const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
    return { ok: true, keySystem: access.keySystem };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})()
