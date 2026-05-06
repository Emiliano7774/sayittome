import 'dart:html' as dart_html;
import 'dart:js_util' as dart_js_util;
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

// Compatibilidad por si alguna parte del main.dart llama directo:
// web.getProperty(...), web.callMethod(...), web.promiseToFuture(...)
T getProperty<T>(Object? object, Object name) {
  return js_util.getProperty<T>(object, name);
}

T callMethod<T>(Object? object, String method, List<Object?> args) {
  return js_util.callMethod<T>(object, method, args);
}

Future<T> promiseToFuture<T>(Object jsPromise) {
  return js_util.promiseToFuture<T>(jsPromise);
}
