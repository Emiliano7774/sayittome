import 'dart:async';

// Stub nativo para compilar Android/iOS/Desktop sin dart:html, dart:js_util ni dart:ui_web.
// Las funciones reales se cargan en Web mediante web_only.dart.

final Window window = Window();
final Document document = Document();
final _JsUtilCompat js_util = _JsUtilCompat();
final _UiWebCompat ui_web = _UiWebCompat();

class Window {
  final NavigatorInfo navigator = NavigatorInfo();
  final LocationInfo location = LocationInfo();
  final HistoryInfo history = HistoryInfo();

  void open(String url, String target) {}
}

class NavigatorInfo {
  String? userAgent = 'native';
}

class LocationInfo {
  String? pathname = '/';
}

class HistoryInfo {
  void replaceState(Object? data, String title, String url) {}
}

class Document {
  final HeadElement? head = HeadElement();

  Object? getElementById(String id) => null;
}

class HeadElement {
  void append(Object? element) {}
}

class LinkElement {
  String rel = '';
  String href = '';
  String as = '';
  String type = '';
  String crossOrigin = '';
}

class StyleElement {
  String id = '';
  String text = '';
}

class ScriptElement {
  String id = '';
  String src = '';
  bool async = false;
  final _EventStream onLoad = _EventStream();
  final _EventStream onError = _EventStream();
}

class ImageElement {
  String crossOrigin = '';
  String src = '';
  final _EventStream onLoad = _EventStream();
  final _EventStream onError = _EventStream();
}

class VideoElement {
  String src = '';
  bool controls = false;
  bool autoplay = false;
  bool loop = false;
  bool muted = false;
  String preload = '';
  double duration = 0;
  final CssStyleDeclaration style = CssStyleDeclaration();
  final _EventStream onLoadedMetadata = _EventStream();
  final _EventStream onDurationChange = _EventStream();
  final _EventStream onCanPlay = _EventStream();
  final _EventStream onEnded = _EventStream();

  void setAttribute(String name, String value) {}
  void removeAttribute(String name) {}
  void pause() {}
  Future<void> play() async {}
  void load() {}
  void remove() {}
}

class CssStyleDeclaration {
  String width = '';
  String height = '';
  String backgroundColor = '';
  String border = '';
  String objectFit = '';
}

class _EventStream {
  Future<dynamic> get first => Future<dynamic>.value(null);

  StreamSubscription<dynamic> listen(void Function(dynamic event)? onData) {
    return const Stream<dynamic>.empty().listen(onData);
  }
}

class _JsUtilCompat {
  T getProperty<T>(Object? object, Object name) {
    if (T == String) return '' as T;
    if (T == double) return 0.0 as T;
    if (T == int) return 0 as T;
    if (T == bool) return false as T;
    return null as T;
  }

  T callMethod<T>(Object? object, String method, List<dynamic> args) {
    if (T == String) return '' as T;
    if (T == double) return 0.0 as T;
    if (T == int) return 0 as T;
    if (T == bool) return false as T;
    return Object() as T;
  }

  Future<T> promiseToFuture<T>(Object jsPromise) async {
    if (T == List<dynamic>) return <dynamic>[] as T;
    if (T == String) return '' as T;
    if (T == double) return 0.0 as T;
    if (T == int) return 0 as T;
    if (T == bool) return false as T;
    return Object() as T;
  }
}

class _UiWebCompat {
  final _PlatformViewRegistryCompat platformViewRegistry = _PlatformViewRegistryCompat();
}

class _PlatformViewRegistryCompat {
  bool registerViewFactory(
    String viewType,
    Object Function(int viewId) viewFactory, {
    bool isVisible = true,
  }) {
    return false;
  }
}
