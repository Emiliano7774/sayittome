package com.sayittome.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Data-only FCM → one expandable MessagingStyle notification per chat with ALL unread lines
 * (chronological; newest last). Replaces Capacitor's default MessagingService via manifest.
 */
public class ChatExpandableMessagingService extends FirebaseMessagingService {

    private static final String TAG = "SayItToMeFcm";
    private static final String CHANNEL_ID = "chat-messages-v2";
    private static final String STORIES_CHANNEL_ID = "stories-v2";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        try {
            ensureStoriesChannel();
            if (shouldRenderStoryNotification(remoteMessage)) {
                renderStoryNotification(remoteMessage);
            } else if (shouldRenderChatExpandable(remoteMessage)) {
                renderChatExpandable(remoteMessage);
            }
        } catch (Exception error) {
            Log.w(TAG, "expandable render failed", error);
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    static boolean shouldRenderChatExpandable(RemoteMessage remoteMessage) {
        if (remoteMessage.getNotification() != null) {
            // OS already owns display for notification payloads.
            return false;
        }
        String type = remoteMessage.getData().get("type");
        String chatId = remoteMessage.getData().get("chatId");
        return "chat_message".equals(type) && chatId != null && !chatId.trim().isEmpty();
    }

    static boolean shouldRenderStoryNotification(RemoteMessage remoteMessage) {
        String type = remoteMessage.getData().get("type");
        return "story_like".equals(type) || "story_upload".equals(type);
    }

    private void renderChatExpandable(RemoteMessage remoteMessage) {
        String chatId = safe(remoteMessage.getData().get("chatId"));
        String messageId = safe(remoteMessage.getData().get("messageId"));
        String title = safe(remoteMessage.getData().get("title"));
        if (title.isEmpty()) title = "SayItToMe";
        String body = safe(remoteMessage.getData().get("body"));
        String channelId = safe(remoteMessage.getData().get("channelId"));
        if (channelId.isEmpty()) channelId = CHANNEL_ID;
        String tag = safe(remoteMessage.getData().get("tag"));
        if (tag.isEmpty()) tag = "chat-" + chatId;

        ensureChannel(channelId);

        Person user = new Person.Builder().setName("Tú").build();
        NotificationCompat.MessagingStyle style =
            new NotificationCompat.MessagingStyle(user).setGroupConversation(false);

        JSONArray lines = parseUnreadLines(remoteMessage.getData().get("unreadLines"));
        if (lines.length() == 0) {
            Person sender = new Person.Builder().setName(title).build();
            style.addMessage(body.isEmpty() ? "Nuevo mensaje" : body, System.currentTimeMillis(), sender);
        } else {
            for (int i = 0; i < lines.length(); i += 1) {
                JSONObject row = lines.optJSONObject(i);
                if (row == null) continue;
                String text = row.optString("t", "").trim();
                if (text.isEmpty()) text = "Nuevo mensaje";
                String senderName = row.optString("s", title).trim();
                if (senderName.isEmpty()) senderName = title;
                long ms = row.optLong("ms", System.currentTimeMillis());
                Person sender = new Person.Builder().setName(senderName).build();
                style.addMessage(text, ms, sender);
            }
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        // Capacitor pushNotificationActionPerformed requires google.message_id.
        String googleId = remoteMessage.getMessageId();
        if (googleId == null || googleId.isEmpty()) {
            googleId = chatId + ":" + messageId;
        }
        intent.putExtra("google.message_id", googleId);
        for (String key : remoteMessage.getData().keySet()) {
            intent.putExtra(key, remoteMessage.getData().get(key));
        }

        PendingIntent pendingIntent =
            PendingIntent.getActivity(
                this,
                Math.abs(chatId.hashCode()),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.whip);
        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(0xFF7C3AED)
                .setLargeIcon(
                    android.graphics.BitmapFactory.decodeResource(getResources(), R.drawable.ic_notify_moon)
                )
                .setContentTitle(title)
                .setContentText(body.isEmpty() ? "Nuevo mensaje" : body)
                .setStyle(style)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setSound(sound)
                .setContentIntent(pendingIntent);

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(tag, Math.abs(chatId.hashCode()) % 1_900_000_000 + 1, builder.build());
        }
    }

    private void renderStoryNotification(RemoteMessage remoteMessage) {
        String title = safe(remoteMessage.getData().get("title"));
        if (title.isEmpty()) title = "SayItToMe";
        String body = safe(remoteMessage.getData().get("body"));
        String href = safe(remoteMessage.getData().get("href"));
        String tag = safe(remoteMessage.getData().get("tag"));
        if (tag.isEmpty()) tag = "story-" + title;
        ensureStoriesChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        String googleId = remoteMessage.getMessageId();
        if (googleId == null || googleId.isEmpty()) {
            googleId = tag;
        }
        intent.putExtra("google.message_id", googleId);
        for (String key : remoteMessage.getData().keySet()) {
            intent.putExtra(key, remoteMessage.getData().get(key));
        }
        if (!href.isEmpty()) {
            intent.putExtra("href", href);
        }

        PendingIntent pendingIntent =
            PendingIntent.getActivity(
                this,
                Math.abs(tag.hashCode()),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, STORIES_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_story_like)
                .setColor(0xFFE879F9)
                .setLargeIcon(drawableBitmap(R.drawable.ic_notify_story_like))
                .setContentTitle(title)
                .setContentText(body.isEmpty() ? title : body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                .setContentIntent(pendingIntent);

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(tag, Math.abs(tag.hashCode()) % 1_900_000_000 + 1, builder.build());
        }
    }

    private Bitmap drawableBitmap(int resId) {
        Drawable drawable = getResources().getDrawable(resId, getTheme());
        if (drawable instanceof BitmapDrawable) {
            Bitmap bitmap = ((BitmapDrawable) drawable).getBitmap();
            if (bitmap != null) return bitmap;
        }
        int width = Math.max(96, drawable.getIntrinsicWidth());
        int height = Math.max(96, drawable.getIntrinsicHeight());
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }

    private void ensureChannel(String channelId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(channelId);
        if (existing != null) return;
        NotificationChannel channel =
            new NotificationChannel(channelId, "Mensajes", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.whip);
        AudioAttributes attrs =
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(sound, attrs);
        manager.createNotificationChannel(channel);
    }

    private void ensureStoriesChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(STORIES_CHANNEL_ID) != null) return;
        NotificationChannel channel =
            new NotificationChannel(STORIES_CHANNEL_ID, "Historias", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setDescription("Likes e historias nuevas");
        channel.enableLights(true);
        channel.setLightColor(0xFFE879F9);
        manager.createNotificationChannel(channel);
    }

    static JSONArray parseUnreadLines(String raw) {
        if (raw == null || raw.trim().isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
