package com.sayittome.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final String HOSTED_WEB_URL = MicCapturePolicy.TRUSTED_ORIGIN;
    private static final String MIC_PREFS = "sayittome_mic";
    private static final String MIC_ASKED_KEY = "record_audio_asked";
    private static final String MIC_TAG = "SayItToMeMic";
    private static final String WEB_CACHE_PREFS = "sayittome_web_cache";
    private static final String WEB_CACHE_SCHEMA_KEY = "schema";
    private static final int WEB_CACHE_SCHEMA = 2;

    private final ActivityResultLauncher<String> recordAudioLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> completeMicRequest(Boolean.TRUE.equals(granted) ? "granted" : "denied")
        );
    private final ActivityResultLauncher<String> cameraLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> Log.i(MIC_TAG, "CAMERA os=" + (Boolean.TRUE.equals(granted) ? "granted" : "denied"))
        );
    private String pendingMicRequestId = "";
    private boolean jsBridgesAttached = false;
    private MicAwareChromeClient micChromeClient = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Bridge bridge = getBridge();
                if (bridge != null) {
                    bridge.triggerWindowJSEvent("sayittomeHardwareBack", "{}");
                }
            }
        });

        refreshHostedWebCacheAfterUpgrade();
        attachWebViewInsets();
        attachMicrophoneCapture();
    }

    @Override
    protected void load() {
        super.load();
        attachMicrophoneCapture();
    }

    @Override
    public void onResume() {
        super.onResume();
        ensureMicAwareChromeClientInstalled();
        WebView webView = webViewOrNull();
        if (webView == null) return;
        webView.evaluateJavascript(
            "window.__sayittomeMicResume&&window.__sayittomeMicResume()",
            null
        );
    }

    private WebView webViewOrNull() {
        Bridge bridge = getBridge();
        return bridge != null ? bridge.getWebView() : null;
    }

    /**
     * One-time cache schema bump for installed APKs. Hosted HTML used to ship
     * with a one-hour freshness window, so an updated WebView could keep HTML
     * that referenced chunks from a previous deployment and render only black.
     * Keep normal WebView caching after this one-time purge.
     */
    private void refreshHostedWebCacheAfterUpgrade() {
        WebView webView = webViewOrNull();
        if (webView == null) return;

        SharedPreferences prefs = getSharedPreferences(WEB_CACHE_PREFS, MODE_PRIVATE);
        int stored = prefs.getInt(WEB_CACHE_SCHEMA_KEY, 0);
        if (stored >= WEB_CACHE_SCHEMA) return;

        prefs.edit().putInt(WEB_CACHE_SCHEMA_KEY, WEB_CACHE_SCHEMA).apply();
        webView.clearCache(true);
        Log.i("SayItToMeBoot", "Cleared stale hosted-web cache schema=" + WEB_CACHE_SCHEMA);

        webView.post(() -> {
            try {
                String current = webView.getUrl();
                if (current != null && current.startsWith(HOSTED_WEB_URL)) {
                    Uri uri = Uri.parse(current);
                    Uri fresh = uri.buildUpon()
                        .appendQueryParameter("_native_cache", String.valueOf(WEB_CACHE_SCHEMA))
                        .appendQueryParameter("_native_recover", String.valueOf(System.currentTimeMillis()))
                        .build();
                    webView.loadUrl(fresh.toString());
                } else {
                    webView.reload();
                }
            } catch (Exception e) {
                Log.w("SayItToMeBoot", "cache refresh reload failed", e);
                webView.reload();
            }
        });
    }

    private Uri topLevelWebViewUri() {
        WebView webView = webViewOrNull();
        if (webView == null) return null;
        String url = webView.getUrl();
        if (url == null || url.isEmpty()) return null;
        return Uri.parse(url);
    }

    /**
     * Capacitor's BridgeWebChromeClient batches CAMERA+RECORD_AUDIO and denies audio
     * when camera is missing. Reinstall MicAware just before getUserMedia (check),
     * on request, and onResume — never construct a new BridgeWebChromeClient after STARTED.
     */
    private void ensureMicAwareChromeClientInstalled() {
        WebView webView = webViewOrNull();
        Bridge bridge = getBridge();
        if (webView == null || bridge == null) return;
        if (micChromeClient == null) {
            micChromeClient = new MicAwareChromeClient(bridge);
        }
        // Keep MicAware chrome client installed — Capacitor's BridgeWebChromeClient
        // batches CAMERA+RECORD_AUDIO and denies audio when camera is missing.
        webView.setWebChromeClient(micChromeClient);
    }

    private void attachWebViewInsets() {
        WebView webView = webViewOrNull();
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void attachMicrophoneCapture() {
        Bridge bridge = getBridge();
        WebView webView = webViewOrNull();
        if (bridge == null || webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setVerticalScrollBarEnabled(true);
        webView.setHorizontalScrollBarEnabled(false);
        if (!jsBridgesAttached) {
            webView.addJavascriptInterface(new HostedWebLauncher(), "SayItToMeHostedWeb");
            webView.addJavascriptInterface(new MicrophoneBridge(), "SayItToMeMic");
            webView.addJavascriptInterface(new SecureScreenBridge(), "SayItToMeSecureScreen");
            jsBridgesAttached = true;
        }
        ensureMicAwareChromeClientInstalled();
    }

    private boolean isTrustedTopLevelOrigin() {
        return MicCapturePolicy.isTrustedHttpsOrigin(topLevelWebViewUri());
    }

    private boolean hasRecordAudio() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasCamera() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
    }

    private boolean micWasAsked() {
        return getSharedPreferences(MIC_PREFS, MODE_PRIVATE).getBoolean(MIC_ASKED_KEY, false);
    }

    private void markMicAsked() {
        SharedPreferences prefs = getSharedPreferences(MIC_PREFS, MODE_PRIVATE);
        prefs.edit().putBoolean(MIC_ASKED_KEY, true).apply();
    }

    private String currentRecordAudioState() {
        if (hasRecordAudio()) return "granted";
        boolean canAskAgain = ActivityCompat.shouldShowRequestPermissionRationale(
            this,
            Manifest.permission.RECORD_AUDIO
        );
        if (micWasAsked() && !canAskAgain) return "blocked";
        return "prompt";
    }

    private void launchRecordAudioRequest() {
        markMicAsked();
        recordAudioLauncher.launch(Manifest.permission.RECORD_AUDIO);
    }

    private void launchCameraRequest() {
        if (cameraLauncher == null) return;
        cameraLauncher.launch(Manifest.permission.CAMERA);
    }

    private void grantAudioCaptureOnly(final PermissionRequest request) {
        if (request == null) return;
        Runnable grant = () -> {
            try {
                request.grant(MicCapturePolicy.audioCaptureOnly());
                Log.i(MIC_TAG, "granted RESOURCE_AUDIO_CAPTURE only");
            } catch (Exception e) {
                Log.w(MIC_TAG, "grantAudioCaptureOnly failed: " + e);
            }
        };
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            grant.run();
        } else {
            runOnUiThread(grant);
        }
    }

    private void grantVideoCaptureOnly(final PermissionRequest request) {
        if (request == null) return;
        Runnable grant = () -> {
            try {
                request.grant(MicCapturePolicy.videoCaptureOnly());
                Log.i(MIC_TAG, "granted RESOURCE_VIDEO_CAPTURE only");
            } catch (Exception e) {
                Log.w(MIC_TAG, "grantVideoCaptureOnly failed: " + e);
            }
        };
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            grant.run();
        } else {
            runOnUiThread(grant);
        }
    }

    private void grantVideoAndAudioCapture(final PermissionRequest request) {
        if (request == null) return;
        Runnable grant = () -> {
            try {
                request.grant(MicCapturePolicy.videoAndAudioCapture());
                Log.i(MIC_TAG, "granted RESOURCE_VIDEO_CAPTURE+RESOURCE_AUDIO_CAPTURE");
            } catch (Exception e) {
                Log.w(MIC_TAG, "grantVideoAndAudioCapture failed: " + e);
            }
        };
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            grant.run();
        } else {
            runOnUiThread(grant);
        }
    }

    private void denyPermissionRequest(final PermissionRequest request) {
        if (request == null) return;
        Runnable deny = () -> {
            try {
                request.deny();
            } catch (Exception ignored) {
                // Request already completed by WebView.
            }
        };
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            deny.run();
        } else {
            runOnUiThread(deny);
        }
    }

    private void completeMicRequest(String state) {
        final String requestId = pendingMicRequestId == null ? "" : pendingMicRequestId;
        pendingMicRequestId = "";

        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        final String resolved = "granted".equals(state) && hasRecordAudio()
            ? "granted"
            : ("denied".equals(state) || "blocked".equals(state) ? currentRecordAudioState() : String.valueOf(state));
        final String safeId = requestId.replace("\\", "\\\\").replace("'", "\\'");
        final String safeState = resolved.replace("\\", "\\\\").replace("'", "\\'");
        webView.post(() -> webView.evaluateJavascript(
            "window.__sayittomeMicPermissionResult&&window.__sayittomeMicPermissionResult('"
                + safeId
                + "','"
                + safeState
                + "')",
            null
        ));
    }

    private class HostedWebLauncher {
        @JavascriptInterface
        public void open(String url) {
            if (url == null) return;
            String trimmed = url.trim();
            if (!trimmed.equals(HOSTED_WEB_URL) && !trimmed.equals(HOSTED_WEB_URL + "/")) {
                return;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(HOSTED_WEB_URL));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
    }

    private class SecureScreenBridge {
        @JavascriptInterface
        public void enable() {
            runOnUiThread(() -> {
                if (!isTrustedTopLevelOrigin()) return;
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            });
        }

        @JavascriptInterface
        public void disable() {
            runOnUiThread(() -> {
                if (!isTrustedTopLevelOrigin()) return;
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            });
        }
    }

    private class MicrophoneBridge {
        @JavascriptInterface
        public String check() {
            final String[] out = new String[] { "unavailable" };
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            runOnUiThread(() -> {
                try {
                    // Reinstall MicAware on UI thread just before JS getUserMedia.
                    ensureMicAwareChromeClientInstalled();
                    if (!isTrustedTopLevelOrigin()) {
                        out[0] = "unavailable";
                    } else {
                        out[0] = currentRecordAudioState();
                    }
                } finally {
                    latch.countDown();
                }
            });
            try {
                if (!latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                    Log.w(MIC_TAG, "check timed out waiting for UI thread");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return out[0];
        }

        @JavascriptInterface
        public void request(String requestId) {
            runOnUiThread(() -> {
                ensureMicAwareChromeClientInstalled();
                if (!isTrustedTopLevelOrigin()) {
                    pendingMicRequestId = requestId == null ? "" : requestId;
                    completeMicRequest("unavailable");
                    return;
                }
                pendingMicRequestId = requestId == null ? "" : requestId;
                String live = currentRecordAudioState();
                if ("granted".equals(live)) {
                    completeMicRequest("granted");
                    return;
                }
                if ("blocked".equals(live)) {
                    completeMicRequest("blocked");
                    return;
                }
                if (recordAudioLauncher == null) {
                    completeMicRequest("unavailable");
                    return;
                }
                launchRecordAudioRequest();
            });
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> {
                if (!isTrustedTopLevelOrigin()) return;
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getPackageName(), null));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            });
        }
    }

    private class MicAwareChromeClient extends BridgeWebChromeClient {
        MicAwareChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            if (request == null) {
                return;
            }

            runOnUiThread(() -> {
                Uri requestOrigin = request.getOrigin();
                Uri topLevel = topLevelWebViewUri();
                String[] resources = request.getResources();
                boolean wantsAudio = MicCapturePolicy.requestsAudioCapture(resources);
                boolean wantsVideo = MicCapturePolicy.requestsVideoCapture(resources);
                boolean osMicGranted = hasRecordAudio();
                boolean osCameraGranted = hasCamera();

                Log.i(
                    MIC_TAG,
                    "permissionRequest origin=" + requestOrigin
                        + " top=" + topLevel
                        + " audio=" + wantsAudio
                        + " video=" + wantsVideo
                        + " osRecordAudio=" + osMicGranted
                        + " osCamera=" + osCameraGranted
                );

                if (MicCapturePolicy.shouldDenyRequest(requestOrigin, topLevel)) {
                    denyPermissionRequest(request);
                    return;
                }

                if (wantsVideo) {
                    if (MicCapturePolicy.shouldGrantVideoCapture(requestOrigin, topLevel, osCameraGranted)) {
                        if (wantsAudio && MicCapturePolicy.shouldGrantAudioCapture(requestOrigin, topLevel, osMicGranted)) {
                            grantVideoAndAudioCapture(request);
                            return;
                        }
                        grantVideoCaptureOnly(request);
                        if (wantsAudio && !osMicGranted && (pendingMicRequestId == null || pendingMicRequestId.isEmpty())) {
                            launchRecordAudioRequest();
                        }
                        return;
                    }

                    // Do not hold PermissionRequest across the OS dialog (WebView times it out).
                    denyPermissionRequest(request);
                    launchCameraRequest();
                    return;
                }

                if (!wantsAudio) {
                    denyPermissionRequest(request);
                    return;
                }

                if (MicCapturePolicy.shouldGrantAudioCapture(requestOrigin, topLevel, osMicGranted)) {
                    grantAudioCaptureOnly(request);
                    return;
                }

                // Do not hold PermissionRequest across the OS dialog (WebView times it out).
                // Deny this capture attempt; JS ensureChatMicrophonePermission + one retry
                // after RECORD_AUDIO grant continues the tap-to-record flow.
                denyPermissionRequest(request);
                if (pendingMicRequestId == null || pendingMicRequestId.isEmpty()) {
                    launchRecordAudioRequest();
                }
            });
        }
    }
}
