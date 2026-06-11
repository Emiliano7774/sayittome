const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

async function fetchUsers() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "usuarios" }],
        limit: 500,
      },
    }),
  });
  const json = await res.json();
  if (!Array.isArray(json)) return [];

  return json
    .map((row) => row.document)
    .filter(Boolean)
    .map((doc) => {
      const fields = doc.fields || {};
      const read = (key) => fields[key]?.stringValue || "";
      return {
        docId: String(doc.name || "").split("/").pop() || "",
        uid: read("uid") || String(doc.name || "").split("/").pop() || "",
        username: read("username") || read("usernameLower") || read("nombre"),
        usernameLower: (read("usernameLower") || read("username") || "").toLowerCase(),
        email: read("email"),
      };
    });
}

const users = await fetchUsers();
const byUsername = new Map();

for (const user of users) {
  if (!user.usernameLower || user.usernameLower === "usuario") continue;
  const group = byUsername.get(user.usernameLower) || [];
  group.push(user);
  byUsername.set(user.usernameLower, group);
}

const byUid = new Map();
for (const user of users) {
  if (!user.uid) continue;
  const group = byUid.get(user.uid) || [];
  group.push(user);
  byUid.set(user.uid, group);
}

const usernameDuplicates = [...byUsername.entries()].filter(([, rows]) => rows.length > 1);
const uidDuplicates = [...byUid.entries()].filter(([, rows]) => rows.length > 1);
const docUidMismatches = users.filter((user) => user.docId && user.uid && user.docId !== user.uid);

console.log(`Users scanned: ${users.length}`);
console.log(`Duplicate username groups: ${usernameDuplicates.length}`);
console.log(
  `Duplicate username documents: ${usernameDuplicates.reduce((sum, [, rows]) => sum + rows.length - 1, 0)}`,
);
console.log(`Duplicate uid groups: ${uidDuplicates.length}`);
console.log(`Doc id != uid field: ${docUidMismatches.length}`);

for (const [username, rows] of usernameDuplicates) {
  console.log(`\nusername @${username} (${rows.length} docs)`);
  for (const row of rows) {
    console.log(`  - doc=${row.docId} uid=${row.uid} email=${row.email || "-"}`);
  }
}

for (const [uid, rows] of uidDuplicates) {
  console.log(`\nuid ${uid} (${rows.length} docs)`);
  for (const row of rows) {
    console.log(`  - doc=${row.docId} username=${row.username} email=${row.email || "-"}`);
  }
}

if (docUidMismatches.length) {
  console.log("\nDoc/uid mismatches:");
  for (const row of docUidMismatches.slice(0, 20)) {
    console.log(`  - doc=${row.docId} uid=${row.uid} username=${row.username}`);
  }
}
