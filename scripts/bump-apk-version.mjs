import { bumpReleaseVersion } from "./sync-app-version.mjs";

const version = bumpReleaseVersion();
console.log("Versión APK incrementada:", version);
