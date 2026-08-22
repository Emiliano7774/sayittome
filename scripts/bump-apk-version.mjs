import { bumpReleaseVersion } from "./androidReleaseVersion.mjs";

const version = bumpReleaseVersion();
console.log("Versión APK incrementada:", version);
