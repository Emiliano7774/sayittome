import assert from "node:assert/strict";
import fs from "node:fs";

const viewer = fs.readFileSync("src/components/chat/media/FullscreenMedia.tsx", "utf8");
const chat = fs.readFileSync("src/components/chat/ProfileAnonChat.tsx", "utf8");

assert.match(viewer, /mediaType\?: "image" \| "video"/);
assert.match(viewer, /mediaType === "video"/);
assert.match(viewer, /<video[\s\S]*?src=\{url\}[\s\S]*?controls[\s\S]*?playsInline/);
assert.match(viewer, /<img[\s\S]*?src=\{url\}/);
assert.match(chat, /setFullscreenMediaType\(message\.type === "video" \? "video" : "image"\)/);
assert.match(chat, /mediaType=\{fullscreenMediaType\}/);
assert.match(chat, /setFullscreenMediaType\("image"\);[\s\S]*?setFullscreenUrl\(message\.mediaUrl/);

console.log(JSON.stringify({ gate: "CHAT_BOMB_VIDEO_FULLSCREEN", pass: true }, null, 2));
