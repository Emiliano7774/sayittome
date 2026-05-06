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

class _FakeDocument {
  Object? get head => null;
  Object? getElementById(String id) => null;
}

final window = _FakeWindow();
final document = _FakeDocument();

class ImageElement {}
class VideoElement {}
class LinkElement {}
class StyleElement {}
class ScriptElement {}

final js_util = _FakeJsUtil();
final ui_web = _FakeUiWeb();

class _FakeJsUtil {
  T getProperty<T>(Object? object, Object name) {
    throw UnsupportedError('js_util no está disponible fuera de Web.');
  }

  T callMethod<T>(Object? object, String method, List<Object?> args) {
    throw UnsupportedError('js_util no está disponible fuera de Web.');
  }

  Future<T> promiseToFuture<T>(Object jsPromise) {
    throw UnsupportedError('js_util no está disponible fuera de Web.');
  }
}

class _FakeUiWeb {
  dynamic get platformViewRegistry => null;
}
