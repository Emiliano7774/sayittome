import 'dart:async';

class _FakeWindow {
  final navigator = _FakeNavigator();
  final location = _FakeLocation();
  final history = _FakeHistory();

  void open(String url, String target) {}
}

class _FakeNavigator {
  String? get userAgent => 'native';
}

class _FakeLocation {
  String? get pathname => '/';
}

class _FakeHistory {
  void replaceState(Object? data, String title, String url) {}
}

class _FakeHead {
  void append(Object? node) {}
}

class _FakeDocument {
  final head = _FakeHead();

  Object? getElementById(String id) => null;
}

final window = _FakeWindow();
final document = _FakeDocument();

class ImageElement {
  String? src;
  String? crossOrigin;

  final Stream<void> onLoad = const Stream<void>.empty();
  final Stream<void> onError = const Stream<void>.empty();
}

class VideoElement {
  String? src;
  bool controls = false;
  bool autoplay = false;
  bool loop = false;
  bool muted = false;
  String? preload;

  final style = _FakeStyle();

  final Stream<void> onLoadedMetadata = const Stream<void>.empty();
  final Stream<void> onDurationChange = const Stream<void>.empty();
  final Stream<void> onCanPlay = const Stream<void>.empty();
  final Stream<void> onEnded = const Stream<void>.empty();

  double duration = 0;

  void setAttribute(String key, String value) {}
  void removeAttribute(String key) {}

  void load() {}
  void pause() {}

  Future<void> play() async {}

  void remove() {}
}

class _FakeStyle {
  String width = '';
  String height = '';
  String border = '';
  String outline = '';
  String backgroundColor = '';
  String objectFit = '';
}

class LinkElement {
  String? rel;
  String? href;
  String? as;
  String? type;
  String? crossOrigin;
}

class StyleElement {
  String? id;
  String? text;
}

class ScriptElement {
  String? id;
  String? src;
  bool async = false;

  final Stream<void> onLoad = const Stream<void>.empty();
  final Stream<void> onError = const Stream<void>.empty();
}

final js_util = _FakeJsUtil();
final ui_web = _FakeUiWeb();

class _FakeJsUtil {
  T getProperty<T>(Object? object, Object name) {
    throw UnsupportedError('js_util no disponible fuera de Web.');
  }

  T callMethod<T>(Object? object, String method, List<Object?> args) {
    throw UnsupportedError('js_util no disponible fuera de Web.');
  }

  Future<T> promiseToFuture<T>(Object jsPromise) {
    throw UnsupportedError('js_util no disponible fuera de Web.');
  }
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

class _FakePlatformViewRegistry {
  void registerViewFactory(
    String viewType,
    dynamic Function(int viewId) factory,
  ) {}
}

class _FakeUiWeb {
  final platformViewRegistry = _FakePlatformViewRegistry();
}

// Compatibilidad cuando main.dart importa este archivo como ui_web.
final platformViewRegistry = ui_web.platformViewRegistry;
