package com.sayittome.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
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

    private final ActivityResultLauncher<String> recordAudioLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> completeMicRequest(Boolean.TRUE.equals(granted) ? "granted" : "denied")
        );
    private String pendingMicRequestId = "";
    private PermissionRequest pendingWebPermissionRequest = null;
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
        WebView webView = webViewOrNull();
        if (webView == null) return;
        if (micChromeClient != null) {
            webView.setWebChromeClient(micChromeClient);
        }
        webView.evaluateJavascript(
            "window.__sayittomeMicResume&&window.__sayittomeMicResume()",
            null
        );
    }

    private WebView webViewOrNull() {
        Bridge bridge = getBridge();
        return bridge != null ? bridge.getWebView() : null;
    }

    private Uri topLevelWebViewUri() {
        WebView webView = webViewOrNull();
        if (webView == null) return null;
        String url = webView.getUrl();
        if (url == null || url.isEmpty()) return null;
        return Uri.parse(url);
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
            jsBridgesAttached = true;
        }
        if (micChromeClient == null) {
            micChromeClient = new MicAwareChromeClient(bridge);
        }
        webView.setWebChromeClient(micChromeClient);
    }

    private boolean isTrustedTopLevelOrigin() {
        return MicCapturePolicy.isTrustedHttpsOrigin(topLevelWebViewUri());
    }

    private boolean hasRecordAudio() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
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

    private void grantAudioCaptureOnly(PermissionRequest request) {
        if (request == null) return;
        try {
            request.grant(MicCapturePolicy.audioCaptureOnly());
        } catch (Exception ignored) {
            // Request already completed by WebView.
        }
    }

    private void denyPermissionRequest(PermissionRequest request) {
        if (request == null) return;
        try {
            request.deny();
        } catch (Exception ignored) {
            // Request already completed by WebView.
        }
    }

    private void completeMicRequest(String state) {
        final String requestId = pendingMicRequestId == null ? "" : pendingMicRequestId;
        pendingMicRequestId = "";
        final PermissionRequest webRequest = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;

        if (webRequest != null) {
            if ("granted".equals(state) && hasRecordAudio()) {
                grantAudioCaptureOnly(webRequest);
            } else {
                denyPermissionRequest(webRequest);
            }
        }

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

    private class MicrophoneBridge {
        @JavascriptInterface
        public String check() {
            if (!isTrustedTopLevelOrigin()) return "unavailable";
            return currentRecordAudioState();
        }

        @JavascriptInterface
        public void request(String requestId) {
            runOnUiThread(() -> {
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
            if (!isTrustedTopLevelOrigin()) return;
            runOnUiThread(() -> {
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

            Uri requestOrigin = request.getOrigin();
            Uri topLevel = topLevelWebViewUri();
            String[] resources = request.getResources();
            boolean wantsAudio = MicCapturePolicy.requestsAudioCapture(resources);
            boolean osGranted = hasRecordAudio();

            Log.i(
                MIC_TAG,
                "permissionRequest origin=" + requestOrigin
                    + " top=" + topLevel
                    + " audio=" + wantsAudio
                    + " osRecordAudio=" + osGranted
            );

            if (MicCapturePolicy.shouldDenyRequest(requestOrigin, topLevel) || !wantsAudio) {
                denyPermissionRequest(request);
                return;
            }

            if (MicCapturePolicy.shouldGrantAudioCapture(requestOrigin, topLevel, osGranted)) {
                grantAudioCaptureOnly(request);
                return;
            }

            pendingWebPermissionRequest = request;
            if (pendingMicRequestId == null || pendingMicRequestId.isEmpty()) {
                launchRecordAudioRequest();
            }
        }
    }
}
