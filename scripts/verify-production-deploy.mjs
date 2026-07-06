import https from "node:https";

function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "deploy-verify" }, ...opts }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            body,
          }),
        );
      })
      .on("error", reject);
  });
}

const keys = [
  "parseVerifiedProfileLinkInText",
  "chat_verified_link_badge",
  "chat_verified_link_open",
  "beginShuffleWarmHandoff",
  "shouldPaintShuffleLoadingShell",
];

const nav = await get("https://sayittome-app.web.app/@navbench");
console.log("@navbench", nav.status, nav.location || "");

const shuffle = await get("https://sayittome-app.web.app/shuffle");
const chunks = [
  ...new Set([...shuffle.body.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0])),
];

const found = Object.fromEntries(keys.map((k) => [k, false]));
for (const chunk of chunks.slice(0, 60)) {
  const js = (await get(`https://sayittome-app.web.app${chunk}`)).body;
  for (const key of keys) {
    if (js.includes(key)) found[key] = true;
  }
}

console.log(JSON.stringify(found, null, 2));
