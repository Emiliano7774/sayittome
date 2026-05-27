package com.sayittome.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.MobileAds;

public class MainActivity extends BridgeActivity {

    private final AppOpenAdManager appOpenAdManager = new AppOpenAdManager();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SayittomeNativeAdsPlugin.class);

        MobileAds.initialize(this, initializationStatus -> {});

        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.setVerticalScrollBarEnabled(true);
        webView.setHorizontalScrollBarEnabled(false);

        appOpenAdManager.loadAd(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        appOpenAdManager.showAdIfAvailable(this);
    }
}
