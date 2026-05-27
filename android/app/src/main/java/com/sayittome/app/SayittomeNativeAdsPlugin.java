package com.sayittome.app;

import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.nativead.NativeAd;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "SayittomeNativeAds")
public class SayittomeNativeAdsPlugin extends Plugin {

    private static final String TAG = "SayittomeNativeAds";
    private static final int PLUGIN_VERSION = 2;
    private static final String DEFAULT_NATIVE_AD_UNIT_ID =
            "ca-app-pub-2444753148883536/8428630876";

    private final Map<String, NativeAdSlot> slots = new HashMap<>();

    private static final class NativeAdSlot {
        @Nullable
        NativeAd nativeAd;
        boolean loading;
        boolean loaded;
    }

    @PluginMethod
    public void getPluginInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("version", PLUGIN_VERSION);
        result.put("inline", true);
        call.resolve(result);
    }

    @PluginMethod
    public void loadNativeAd(PluginCall call) {
        String slotId = call.getString("slotId");
        if (slotId == null || slotId.isEmpty()) {
            call.reject("slotId is required");
            return;
        }

        String adUnitId = call.getString("adUnitId", DEFAULT_NATIVE_AD_UNIT_ID);
        NativeAdSlot slot = slots.computeIfAbsent(slotId, key -> new NativeAdSlot());

        if (slot.loaded && slot.nativeAd != null) {
            call.resolve(buildInlinePayload(slotId, slot));
            return;
        }

        if (!slot.loading) {
            slot.loading = true;
            getActivity().runOnUiThread(() -> startNativeAdLoad(slotId, slot, adUnitId));
        }

        waitForLoad(slotId, call, 0);
    }

    private void startNativeAdLoad(String slotId, NativeAdSlot slot, String adUnitId) {
        AdLoader adLoader = new AdLoader.Builder(getContext(), adUnitId)
                .forNativeAd(nativeAd -> {
                    slot.nativeAd = nativeAd;
                    slot.loaded = true;
                    slot.loading = false;
                    notifyListeners("nativeAdLoaded", new JSObject().put("slotId", slotId));
                })
                .withAdListener(new AdListener() {
                    @Override
                    public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                        Log.w(TAG, "Native ad failed for " + slotId + ": " + loadAdError.getMessage());
                        slot.loading = false;
                        slot.loaded = false;
                    }
                })
                .build();

        adLoader.loadAd(new AdRequest.Builder().build());
    }

    private JSObject buildInlinePayload(String slotId, NativeAdSlot slot) {
        JSObject result = new JSObject();
        result.put("slotId", slotId);
        result.put("loaded", slot.nativeAd != null);
        result.put("inline", true);

        if (slot.nativeAd == null) {
            return result;
        }

        NativeAd ad = slot.nativeAd;
        if (ad.getHeadline() != null) result.put("headline", ad.getHeadline());
        if (ad.getBody() != null) result.put("body", ad.getBody());
        if (ad.getCallToAction() != null) result.put("cta", ad.getCallToAction());
        if (ad.getAdvertiser() != null) result.put("advertiser", ad.getAdvertiser());
        if (ad.getIcon() != null && ad.getIcon().getUri() != null) {
            result.put("iconUrl", ad.getIcon().getUri().toString());
        }

        return result;
    }

    private void waitForLoad(String slotId, PluginCall call, int attempt) {
        NativeAdSlot slot = slots.get(slotId);
        if (slot == null) {
            call.reject("Slot not found");
            return;
        }

        if (slot.loaded && slot.nativeAd != null) {
            call.resolve(buildInlinePayload(slotId, slot));
            return;
        }

        if (!slot.loading || attempt > 40) {
            call.resolve(buildInlinePayload(slotId, slot));
            return;
        }

        getBridge().getWebView().postDelayed(() -> waitForLoad(slotId, call, attempt + 1), 150);
    }

    @PluginMethod
    public void recordNativeAdImpression(PluginCall call) {
        String slotId = call.getString("slotId");
        NativeAdSlot slot = slotId == null ? null : slots.get(slotId);
        if (slot != null && slot.nativeAd != null) {
            slot.nativeAd.recordImpression(new Bundle());
        }
        call.resolve();
    }

    @PluginMethod
    public void performNativeAdClick(PluginCall call) {
        String slotId = call.getString("slotId");
        NativeAdSlot slot = slotId == null ? null : slots.get(slotId);
        if (slot != null && slot.nativeAd != null) {
            slot.nativeAd.performClick(new Bundle());
        }
        call.resolve();
    }

    @PluginMethod
    public void positionNativeAd(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void hideNativeAd(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void destroyNativeAd(PluginCall call) {
        String slotId = call.getString("slotId");
        if (slotId == null || slotId.isEmpty()) {
            call.reject("slotId is required");
            return;
        }

        destroySlot(slotId);
        call.resolve();
    }

    @PluginMethod
    public void destroyAllNativeAds(PluginCall call) {
        for (String slotId : new HashMap<>(slots).keySet()) {
            destroySlot(slotId);
        }
        call.resolve();
    }

    private void destroySlot(String slotId) {
        NativeAdSlot slot = slots.remove(slotId);
        if (slot == null || slot.nativeAd == null) return;
        slot.nativeAd.destroy();
    }

    @Override
    protected void handleOnDestroy() {
        for (String slotId : new HashMap<>(slots).keySet()) {
            destroySlot(slotId);
        }
        super.handleOnDestroy();
    }
}
