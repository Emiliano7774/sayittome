package com.sayittome.app;

import android.net.Uri;
import android.webkit.PermissionRequest;

/**
 * Trusted-origin + audio-only WebView grant policy.
 * Never grants camera/MIDI/protected-media as a side effect of getUserMedia({audio:true}).
 */
public final class MicCapturePolicy {

    public static final String TRUSTED_HOST = "sayittome-app.web.app";
    public static final String TRUSTED_ORIGIN = "https://sayittome-app.web.app";

    private MicCapturePolicy() {}

    public static boolean isTrustedHttpsOrigin(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        if (host == null) return false;
        int port = uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme())
            && TRUSTED_HOST.equalsIgnoreCase(host)
            && (port == -1 || port == 443)
            && (uri.getUserInfo() == null || uri.getUserInfo().isEmpty());
    }

    public static boolean requestsAudioCapture(String[] resources) {
        if (resources == null) return false;
        for (String resource : resources) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                return true;
            }
        }
        return false;
    }

    public static String[] audioCaptureOnly() {
        return new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE };
    }

    /**
     * Grant audio capture only when the permission request (or, if origin is missing,
     * the top-level WebView URL) is the production host. Never treat a null/foreign
     * origin as a global bypass.
     */
    public static boolean shouldGrantAudioCapture(Uri requestOrigin, Uri topLevelUrl, boolean osRecordAudioGranted) {
        if (!osRecordAudioGranted) return false;
        if (isTrustedHttpsOrigin(requestOrigin)) return true;
        return requestOrigin == null && isTrustedHttpsOrigin(topLevelUrl);
    }

    public static boolean shouldDenyRequest(Uri requestOrigin, Uri topLevelUrl) {
        if (isTrustedHttpsOrigin(requestOrigin)) return false;
        return requestOrigin != null || !isTrustedHttpsOrigin(topLevelUrl);
    }
}
