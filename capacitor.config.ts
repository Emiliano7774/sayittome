import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sayittome.app",
  appName: "SayItToMe",
  webDir: "public/capacitor-shell",
  server: {
    url: "https://sayittome-app.web.app",
    androidScheme: "https",
    cleartext: false,
    allowNavigation: [
      "sayittome-app.web.app",
      "*.web.app",
      "*.googleapis.com",
      "firebasestorage.googleapis.com",
      "*.firebasestorage.app",
      "*.firebaseapp.com",
      "*.gstatic.com",
      "accounts.google.com",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#000000",
  },
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    PushNotifications: {
      // Foreground: in-app whip owns UX. Avoid OS alert+sound doubling whip.
      presentationOptions: ["badge"],
    },
  },
};

export default config;
