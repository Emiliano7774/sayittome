# Prompt para ChatGPT + Desktop Commander — generar AAB para Play

Copiar y pegar todo lo que está entre las líneas en ChatGPT, con Desktop Commander activo.

---

Usá Desktop Commander para generar el bundle de Android (.aab) de mi app y dejarlo listo
para que yo lo suba a Google Play. Trabajá en Windows con PowerShell. No hagas `git reset`,
`git checkout`, `git restore`, `git clean` ni `git stash` en ningún momento: el árbol tiene
cambios sin commitear que necesito conservar.

Repositorio: `C:\Users\emibe\sayittome-web`
Rama esperada: `p0/abuse-checkpoint`
Versión de referencia que funciona: tag `anon-match-ok-20260929`

Hacé esto en orden y mostrame la salida de cada paso:

1. Entrá a `C:\Users\emibe\sayittome-web` y confirmá el estado: `git rev-parse --short HEAD`,
   `git branch --show-current` y `git status -sb`. Decime en qué commit estás parado.

2. Comprobá los prerrequisitos antes de compilar y avisame si falta alguno:
   - `java -version` (hace falta un JDK para Gradle)
   - que exista `C:\Users\emibe\sayittome\android\key.properties` (es la firma de release;
     sin eso el bundle sale sin firmar y Play lo rechaza)
   - que exista `C:\Users\emibe\sayittome-web\android\gradlew.bat`

3. Leé `C:\Users\emibe\sayittome-web\apk.release.json` y decime `versionName` y `versionCode`
   actuales. El build los incrementa solo, así que el bundle nuevo va a salir con el
   `versionCode` siguiente. Confirmame el número que va a quedar antes de seguir.

4. Compilá el bundle:

   ```
   cd C:\Users\emibe\sayittome-web
   npm run build:aab
   ```

   Esto incrementa la versión, sincroniza Android, corre `gradlew.bat bundleRelease` y copia
   el resultado. Tarda varios minutos: dejalo terminar, no lo cortes. Si falla, mostrame el
   error completo de Gradle y pará ahí.

5. Verificá que el bundle exista y esté firmado:

   ```
   $aab = "C:\Users\emibe\sayittome-web\android\app\build\outputs\bundle\release\app-release.aab"
   Get-Item $aab | Select-Object FullName, Length, LastWriteTime
   jarsigner -verify -verbose:summary -certs $aab
   Get-FileHash $aab -Algorithm SHA256
   ```

   Tiene que decir que está verificado. Si aparece "jar is unsigned", pará y avisame.

6. Copiá el bundle a la carpeta de Play con el nombre que uso siempre,
   `sayittome-<versionName>+<versionCode>-<sha7>.aab`, leyendo la versión real de
   `apk.release.json` y el sha de `git rev-parse --short HEAD`. Guardalo en
   `C:\Users\emibe\sayittome-web\play-console\`.

7. Al lado del .aab creá un `.verified.txt` con el mismo nombre base, siguiendo el formato de
   los que ya están en esa carpeta (mirá
   `play-console\sayittome-1.0.6+115-30166ea.verified.txt` como modelo). Incluí: `package`,
   `versionCode`, `versionName`, `signing`, `certSHA256`, `fileSHA256`, `bytes`, `builtUtc` y
   `playPath`.

8. Para terminar, decime en un mensaje corto: la ruta exacta del .aab, el `versionCode`, el
   `versionName` y el SHA256 del archivo.

Importante: no intentes subir nada a Google Play vos mismo. No hay credenciales de la API de
Play configuradas en esta máquina; la subida la hago yo a mano desde Play Console. Tu trabajo
termina cuando el .aab está compilado, firmado, verificado y copiado con su `.verified.txt`.

---

## Después, en Play Console (a mano)

1. Entrar a Play Console → la app **SayItToMe** (`com.sayittome.app`).
2. Producción → **Crear nueva versión**.
3. Subir el `.aab` de `play-console\`.
4. Google va a exigir que el `versionCode` sea mayor al de la versión publicada. Si se queja,
   volver a correr `npm run build:aab` para que incremente de nuevo.
5. Escribir las notas de la versión, revisar y lanzar.
