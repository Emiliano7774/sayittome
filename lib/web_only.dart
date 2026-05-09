import 'dart:async';
import 'dart:html' as dart_html;
import 'dart:js_util' as dart_js_util;
import 'dart:typed_data';
import 'dart:ui_web' as dart_ui_web;

export 'dart:html'
    show
        window,
        document,
        ImageElement,
        VideoElement,
        LinkElement,
        StyleElement,
        ScriptElement;

final window = dart_html.window;
final document = dart_html.document;

typedef ImageElement = dart_html.ImageElement;
typedef VideoElement = dart_html.VideoElement;
typedef LinkElement = dart_html.LinkElement;
typedef StyleElement = dart_html.StyleElement;
typedef ScriptElement = dart_html.ScriptElement;

final js_util = _JsUtilAdapter();
final ui_web = _UiWebAdapter();

final platformViewRegistry = dart_ui_web.platformViewRegistry;

class _JsUtilAdapter {
  T getProperty<T>(Object? object, Object name) {
    if (object == null) {
      throw StateError('web.js_util.getProperty recibió object null');
    }
    return dart_js_util.getProperty<T>(object, name);
  }

  T callMethod<T>(Object? object, String method, List<Object?> args) {
    if (object == null) {
      throw StateError('web.js_util.callMethod recibió object null');
    }
    return dart_js_util.callMethod<T>(object, method, args);
  }

  Future<T> promiseToFuture<T>(Object jsPromise) {
    return dart_js_util.promiseToFuture<T>(jsPromise);
  }
}

class _UiWebAdapter {
  dynamic get platformViewRegistry => dart_ui_web.platformViewRegistry;
}

// Compatibilidad cuando main.dart importa este archivo como js_util.
T getProperty<T>(Object? object, Object name) {
  return js_util.getProperty<T>(object, name);
}

T callMethod<T>(Object? object, String method, List<Object?> args) {
  return js_util.callMethod<T>(object, method, args);
}

Future<T> promiseToFuture<T>(Object jsPromise) {
  return js_util.promiseToFuture<T>(jsPromise);
}

Future<Uint8List> _blobToBytes(dart_html.Blob blob) async {
  final reader = dart_html.FileReader();
  final completer = Completer<Uint8List>();

  late StreamSubscription loadSub;
  late StreamSubscription errorSub;

  loadSub = reader.onLoad.listen((_) {
    if (completer.isCompleted) return;
    final result = reader.result;
    if (result is ByteBuffer) {
      completer.complete(result.asUint8List());
    } else if (result is Uint8List) {
      completer.complete(result);
    } else if (result is List<int>) {
      completer.complete(Uint8List.fromList(result));
    } else {
      completer.completeError(StateError('No pude leer el archivo capturado.'));
    }
  });

  errorSub = reader.onError.listen((_) {
    if (!completer.isCompleted) {
      completer.completeError(reader.error ?? StateError('Error leyendo archivo capturado.'));
    }
  });

  reader.readAsArrayBuffer(blob);

  try {
    return await completer.future.timeout(const Duration(seconds: 20));
  } finally {
    await loadSub.cancel();
    await errorSub.cancel();
  }
}

String _bestVideoMimeType() {
  const candidates = <String>[
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4',
  ];

  for (final mime in candidates) {
    try {
      if (dart_html.MediaRecorder.isTypeSupported(mime)) return mime;
    } catch (_) {}
  }
  return 'video/webm';
}

void _stopStream(dart_html.MediaStream stream) {
  for (final track in stream.getTracks()) {
    try {
      track.stop();
    } catch (_) {}
  }
}

Future<Map<String, Object?>?> captureLiveChatMedia({required bool isVideo}) async {
  final mediaDevices = dart_html.window.navigator.mediaDevices;
  if (mediaDevices == null) {
    throw StateError('Este navegador no expone cámara web. Probá Chrome/Samsung Internet/Safari actualizado y HTTPS.');
  }

  dart_html.MediaStream? stream;
  dart_html.MediaRecorder? recorder;
  final overlay = dart_html.DivElement();
  final card = dart_html.DivElement();
  final video = dart_html.VideoElement();
  final title = dart_html.DivElement();
  final subtitle = dart_html.DivElement();
  final row = dart_html.DivElement();
  final cancelBtn = dart_html.ButtonElement();
  final captureBtn = dart_html.ButtonElement();
  final switchBtn = dart_html.ButtonElement();
  final status = dart_html.DivElement();

  final completer = Completer<Map<String, Object?>?>();
  var useBackCamera = true;
  var recording = false;
  var startedAt = DateTime.now();
  Timer? maxTimer;
  Timer? ticker;

  void styleButton(dart_html.ButtonElement button, String background) {
    button.style
      ..border = '0'
      ..borderRadius = '999px'
      ..padding = '13px 16px'
      ..fontWeight = '900'
      ..fontSize = '14px'
      ..cursor = 'pointer'
      ..backgroundColor = background
      ..color = 'white';
  }

  Future<void> cleanup() async {
    maxTimer?.cancel();
    ticker?.cancel();
    try {
      if (recorder != null && recorder!.state != 'inactive') {
        recorder!.stop();
      }
    } catch (_) {}
    if (stream != null) _stopStream(stream!);
    try {
      video.pause();
      video.srcObject = null;
    } catch (_) {}
    try {
      overlay.remove();
    } catch (_) {}
  }

  void complete(Map<String, Object?>? value) {
    if (completer.isCompleted) return;
    completer.complete(value);
  }

  void fail(Object error, [StackTrace? stackTrace]) {
    if (completer.isCompleted) return;
    completer.completeError(error, stackTrace);
  }

  Future<void> startCamera() async {
    if (stream != null) _stopStream(stream!);
    final constraints = <String, dynamic>{
      'audio': isVideo,
      'video': <String, dynamic>{
        'facingMode': useBackCamera ? <String, dynamic>{'ideal': 'environment'} : 'user',
        'width': <String, dynamic>{'ideal': 1280},
        'height': <String, dynamic>{'ideal': 720},
      },
    };

    status.text = 'Abriendo cámara...';
    stream = await mediaDevices.getUserMedia(constraints);
    video
      ..autoplay = true
      ..muted = true
      ..controls = false;
    video.setAttribute('playsinline', 'true');
    video.srcObject = stream;
    await video.play();
    status.text = isVideo ? 'Listo para grabar en vivo.' : 'Listo para capturar foto en vivo.';
  }

  overlay.style
    ..position = 'fixed'
    ..zIndex = '2147483647'
    ..left = '0'
    ..top = '0'
    ..width = '100vw'
    ..height = '100vh'
    ..backgroundColor = 'rgba(0,0,0,.94)'
    ..display = 'flex'
    ..alignItems = 'center'
    ..justifyContent = 'center'
    ..padding = '14px'
    ..boxSizing = 'border-box';

  card.style
    ..width = 'min(760px, 100%)'
    ..maxHeight = '96vh'
    ..borderRadius = '24px'
    ..backgroundColor = '#0f0f12'
    ..border = '1px solid rgba(255,255,255,.10)'
    ..boxShadow = '0 24px 80px rgba(0,0,0,.55)'
    ..padding = '14px'
    ..boxSizing = 'border-box'
    ..fontFamily = 'Arial, sans-serif'
    ..color = 'white';

  title.text = isVideo ? 'Video en vivo' : 'Foto en vivo';
  title.style
    ..fontSize = '20px'
    ..fontWeight = '900'
    ..margin = '4px 4px 4px';

  subtitle.text = isVideo
      ? 'Esto usa la cámara real del dispositivo. No abre galería.'
      : 'Esto captura desde la cámara real del dispositivo. No abre galería.';
  subtitle.style
    ..fontSize = '13px'
    ..fontWeight = '700'
    ..opacity = '.66'
    ..margin = '0 4px 12px';

  video.style
    ..width = '100%'
    ..maxHeight = '64vh'
    ..backgroundColor = 'black'
    ..borderRadius = '18px'
    ..objectFit = 'contain'
    ..display = 'block';

  status.style
    ..fontSize = '12px'
    ..fontWeight = '800'
    ..opacity = '.72'
    ..margin = '10px 4px 12px';

  row.style
    ..display = 'grid'
    ..gridTemplateColumns = '1fr 1.4fr 1fr'
    ..gap = '10px';

  cancelBtn.text = 'Cancelar';
  captureBtn.text = isVideo ? 'Grabar' : 'Capturar';
  switchBtn.text = 'Girar';
  styleButton(cancelBtn, '#2b2b31');
  styleButton(captureBtn, '#6C63FF');
  styleButton(switchBtn, '#20202a');

  cancelBtn.onClick.listen((_) async {
    complete(null);
    await cleanup();
  });

  switchBtn.onClick.listen((_) async {
    if (recording) return;
    try {
      useBackCamera = !useBackCamera;
      await startCamera();
    } catch (e, st) {
      fail(e, st);
      await cleanup();
    }
  });

  captureBtn.onClick.listen((_) async {
    if (stream == null) return;

    if (!isVideo) {
      try {
        final width = video.videoWidth > 0 ? video.videoWidth : 1280;
        final height = video.videoHeight > 0 ? video.videoHeight : 720;
        final canvas = dart_html.CanvasElement(width: width, height: height);
        canvas.context2D.drawImageScaled(video, 0, 0, width, height);
        final blob = await canvas.toBlob('image/jpeg', 0.86);
        if (blob == null) throw StateError('La cámara no pudo generar la imagen.');
        final bytes = await _blobToBytes(blob);
        complete({
          'bytes': bytes,
          'name': 'foto_en_vivo_${DateTime.now().millisecondsSinceEpoch}.jpg',
          'mimeType': 'image/jpeg',
        });
        await cleanup();
      } catch (e, st) {
        fail(e, st);
        await cleanup();
      }
      return;
    }

    try {
      if (!recording) {
        final chunks = <dart_html.Blob>[];
        final mimeType = _bestVideoMimeType();
        recorder = dart_html.MediaRecorder(stream!, {'mimeType': mimeType});

        recorder!.addEventListener('dataavailable', (dart_html.Event event) {
          final data = dart_js_util.getProperty<Object?>(event, 'data');
          if (data is dart_html.Blob && data.size > 0) {
            chunks.add(data);
          }
        });

        recorder!.addEventListener('stop', (dart_html.Event _) async {
          try {
            if (chunks.isEmpty) throw StateError('La grabación quedó vacía.');
            final blob = dart_html.Blob(chunks, mimeType);
            final bytes = await _blobToBytes(blob);
            complete({
              'bytes': bytes,
              'name': 'video_en_vivo_${DateTime.now().millisecondsSinceEpoch}.webm',
              'mimeType': mimeType.split(';').first,
            });
            await cleanup();
          } catch (e, st) {
            fail(e, st);
            await cleanup();
          }
        });

        startedAt = DateTime.now();
        recorder!.start(350);
        recording = true;
        captureBtn.text = 'Detener';
        status.text = 'Grabando 0s / máx. 30s';
        maxTimer?.cancel();
        ticker?.cancel();
        ticker = Timer.periodic(const Duration(seconds: 1), (_) {
          final seconds = DateTime.now().difference(startedAt).inSeconds;
          status.text = 'Grabando ${seconds}s / máx. 30s';
        });
        maxTimer = Timer(const Duration(seconds: 30), () {
          try {
            if (recorder != null && recorder!.state != 'inactive') recorder!.stop();
          } catch (_) {}
        });
      } else {
        maxTimer?.cancel();
        ticker?.cancel();
        status.text = 'Procesando video...';
        captureBtn.disabled = true;
        if (recorder != null && recorder!.state != 'inactive') recorder!.stop();
      }
    } catch (e, st) {
      fail(e, st);
      await cleanup();
    }
  });

  row.children.addAll([cancelBtn, captureBtn, switchBtn]);
  card.children.addAll([title, subtitle, video, status, row]);
  overlay.children.add(card);
  dart_html.document.body?.append(overlay);

  try {
    await startCamera();
    return await completer.future;
  } catch (e, st) {
    await cleanup();
    fail(e, st);
    return completer.future;
  }
}


Future<DateTime?> getAndroidApkLastModifiedUtc(String path) async {
  final cleanPath = path.trim().isEmpty ? '/downloads/sayittome.apk' : path.trim();
  final separator = cleanPath.contains('?') ? '&' : '?';
  final url = '$cleanPath${separator}apkMeta=${DateTime.now().millisecondsSinceEpoch}';

  try {
    final request = await dart_html.HttpRequest.request(
      url,
      method: 'HEAD',
      requestHeaders: const {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    ).timeout(const Duration(seconds: 8));

    final rawLastModified =
        request.getResponseHeader('last-modified') ??
        request.getResponseHeader('Last-Modified');

    if (rawLastModified == null || rawLastModified.trim().isEmpty) {
      return null;
    }

    final dateCtor = dart_js_util.getProperty<Object>(dart_html.window, 'Date');
    final jsDate = dart_js_util.callConstructor<Object>(dateCtor, [rawLastModified.trim()]);
    final millisRaw = dart_js_util.callMethod<Object?>(jsDate, 'getTime', const []);

    final millis = millisRaw is num ? millisRaw.toDouble() : double.tryParse('$millisRaw');
    if (millis == null || millis.isNaN || millis.isInfinite || millis <= 0) {
      return null;
    }

    return DateTime.fromMillisecondsSinceEpoch(millis.round(), isUtc: true);
  } catch (e) {
    // Si Hosting/CDN no devuelve Last-Modified por algún motivo, no rompemos la UI:
    // simplemente no mostramos el cartel dinámico hasta que pueda leerse.
    return null;
  }
}
