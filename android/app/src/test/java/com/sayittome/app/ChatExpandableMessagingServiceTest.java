package com.sayittome.app;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ChatExpandableMessagingServiceTest {

    @Test
    public void parseUnreadLines_keepsChronologicalOrder() {
        JSONArray lines =
            ChatExpandableMessagingService.parseUnreadLines(
                "[{\"t\":\"a\",\"s\":\"Anon\",\"ms\":1},{\"t\":\"b\",\"s\":\"Anon\",\"ms\":2}]"
            );
        assertEquals(2, lines.length());
        assertEquals("a", lines.optJSONObject(0).optString("t"));
        assertEquals("b", lines.optJSONObject(1).optString("t"));
        assertEquals(0, ChatExpandableMessagingService.parseUnreadLines("not-json").length());
    }
}
