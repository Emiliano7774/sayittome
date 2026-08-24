package com.sayittome.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.net.Uri;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, manifest = Config.NONE)
public class MicCapturePolicyTest {

    private static Uri uri(String value) {
        return Uri.parse(value);
    }

    @Test
    public void trustedOrigin_grantsAudioWhenOsGranted() {
        Uri trusted = uri(MicCapturePolicy.TRUSTED_ORIGIN);
        assertTrue(MicCapturePolicy.isTrustedHttpsOrigin(trusted));
        assertTrue(MicCapturePolicy.shouldGrantAudioCapture(trusted, trusted, true));
        assertFalse(MicCapturePolicy.shouldDenyRequest(trusted, trusted));
    }

    @Test
    public void evilOrigin_isDeniedEvenWhenOsGranted() {
        Uri evil = uri("https://evil.example");
        Uri trusted = uri(MicCapturePolicy.TRUSTED_ORIGIN);
        assertFalse(MicCapturePolicy.isTrustedHttpsOrigin(evil));
        assertTrue(MicCapturePolicy.shouldDenyRequest(evil, trusted));
        assertFalse(MicCapturePolicy.shouldGrantAudioCapture(evil, trusted, true));
    }

    @Test
    public void evilSubdomainAndCredentials_areDenied() {
        Uri trusted = uri(MicCapturePolicy.TRUSTED_ORIGIN);
        assertTrue(
            MicCapturePolicy.shouldDenyRequest(uri("https://evil.sayittome-app.web.app"), trusted)
        );
        assertTrue(
            MicCapturePolicy.shouldDenyRequest(uri("https://sayittome-app.web.app.evil.com"), trusted)
        );
        assertTrue(
            MicCapturePolicy.shouldDenyRequest(uri("https://user:pass@sayittome-app.web.app"), trusted)
        );
        assertFalse(
            MicCapturePolicy.shouldGrantAudioCapture(
                uri("https://evil.example"),
                trusted,
                true
            )
        );
    }

    @Test
    public void nullRequestOrigin_fallsBackToTrustedTopLevelOnly() {
        Uri trusted = uri(MicCapturePolicy.TRUSTED_ORIGIN);
        Uri evilTop = uri("https://evil.example");
        assertTrue(MicCapturePolicy.shouldGrantAudioCapture(null, trusted, true));
        assertFalse(MicCapturePolicy.shouldDenyRequest(null, trusted));
        assertFalse(MicCapturePolicy.shouldGrantAudioCapture(null, evilTop, true));
        assertTrue(MicCapturePolicy.shouldDenyRequest(null, evilTop));
    }

    @Test
    public void audioCaptureOnly_isSingleAudioResource() {
        String[] only = MicCapturePolicy.audioCaptureOnly();
        assertTrue(only.length == 1);
        assertTrue(MicCapturePolicy.requestsAudioCapture(only));
        assertFalse(MicCapturePolicy.requestsAudioCapture(new String[] { "android.webkit.resource.VIDEO_CAPTURE" }));
    }
}
