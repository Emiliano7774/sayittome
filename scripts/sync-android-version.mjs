import { syncAndroidGradleFromRelease } from "./androidReleaseVersion.mjs";

const version = syncAndroidGradleFromRelease();
console.log(`Android version sincronizada: ${version.versionName} (${version.versionCode})`);
