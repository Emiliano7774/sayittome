package com.sayittome.app;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.appopen.AppOpenAd;

import java.util.Date;

public final class AppOpenAdManager {

    private static final String TAG = "SayItToMeAppOpen";
    private static final String APP_OPEN_AD_UNIT_ID =
            "ca-app-pub-2444753148883536/1759280741";
    private static final long AD_TIMEOUT_MS = 4 * 60 * 60 * 1000L;

    @Nullable
    private AppOpenAd appOpenAd;
    private boolean isLoading;
    private boolean isShowing;
    private long loadTime;

    public void loadAd(@NonNull Activity activity) {
        if (isLoading || isAdAvailable()) return;

        isLoading = true;
        AppOpenAd.load(
                activity,
                APP_OPEN_AD_UNIT_ID,
                new AdRequest.Builder().build(),
                new AppOpenAd.AppOpenAdLoadCallback() {
                    @Override
                    public void onAdLoaded(@NonNull AppOpenAd ad) {
                        appOpenAd = ad;
                        isLoading = false;
                        loadTime = new Date().getTime();
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                        Log.w(TAG, "App open ad failed: " + loadAdError.getMessage());
                        isLoading = false;
                    }
                }
        );
    }

    public void showAdIfAvailable(@NonNull Activity activity) {
        if (isShowing) return;

        if (!isAdAvailable()) {
            loadAd(activity);
            return;
        }

        appOpenAd.setFullScreenContentCallback(
                new FullScreenContentCallback() {
                    @Override
                    public void onAdDismissedFullScreenContent() {
                        appOpenAd = null;
                        isShowing = false;
                        loadAd(activity);
                    }

                    @Override
                    public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                        appOpenAd = null;
                        isShowing = false;
                        loadAd(activity);
                    }

                    @Override
                    public void onAdShowedFullScreenContent() {
                        isShowing = true;
                    }
                }
        );

        appOpenAd.show(activity);
    }

    private boolean isAdAvailable() {
        return appOpenAd != null && wasLoadTimeLessThanNHoursAgo(4);
    }

    private boolean wasLoadTimeLessThanNHoursAgo(int numHours) {
        long dateDifference = new Date().getTime() - loadTime;
        return dateDifference < AD_TIMEOUT_MS;
    }
}
