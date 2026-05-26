# SayItToMe APK downloads

Colocá acá el build release de Flutter:

`public/downloads/sayittome.apk`

## Flujo recomendado (PowerShell)

```powershell
cd C:\Users\emibe\sayittome
flutter clean
flutter pub get
flutter build apk --release

cd C:\Users\emibe\sayittome-web
npm run copy:apk
npm run build
firebase deploy --only hosting
```

`npm run copy:apk` copia el APK y actualiza `public/app-version.json` con `releasedAt` = ahora (banner 24h).
