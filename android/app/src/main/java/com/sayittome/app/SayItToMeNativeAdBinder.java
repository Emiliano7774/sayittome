package com.sayittome.app;

import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdView;

/**
 * Same visual binding as Flutter factoryId {@code sayittomeNativeListTile}.
 */
public final class SayItToMeNativeAdBinder {

    public static final String FACTORY_ID = "sayittomeNativeListTile";

    private SayItToMeNativeAdBinder() {}

    @NonNull
    public static NativeAdView bind(@NonNull LayoutInflater inflater, @NonNull NativeAd nativeAd) {
        NativeAdView adView = (NativeAdView) inflater.inflate(R.layout.native_ad_layout, null);

        TextView headlineView = adView.findViewById(R.id.ad_headline);
        TextView bodyView = adView.findViewById(R.id.ad_body);
        Button callToActionView = adView.findViewById(R.id.ad_call_to_action);

        headlineView.setText(nativeAd.getHeadline());
        adView.setHeadlineView(headlineView);

        if (nativeAd.getBody() != null) {
            bodyView.setText(nativeAd.getBody());
            bodyView.setVisibility(View.VISIBLE);
        } else {
            bodyView.setVisibility(View.GONE);
        }
        adView.setBodyView(bodyView);

        if (nativeAd.getCallToAction() != null) {
            callToActionView.setText(nativeAd.getCallToAction());
            callToActionView.setVisibility(View.VISIBLE);
        } else {
            callToActionView.setVisibility(View.GONE);
        }
        adView.setCallToActionView(callToActionView);

        adView.setNativeAd(nativeAd);
        return adView;
    }
}
