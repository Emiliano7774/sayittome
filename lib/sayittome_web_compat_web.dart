import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js_util;
import 'dart:ui_web' as ui_web;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

void installMaterialIconsWebFontFix() {
  try {
    final head = html.document.head;
    if (head == null) return;

    const styleId = 'sayittome-material-icons-font-fix';
    if (html.document.getElementById(styleId) != null) return;

    final preload = html.LinkElement()
      ..rel = 'preload'
      ..href = 'assets/fonts/MaterialIcons-Regular.otf'
      ..as = 'font'
      ..type = 'font/otf'
      ..crossOrigin = 'anonymous';
    head.append(preload);

    final style = html.StyleElement()
      ..id = styleId
      ..text = """
@font-face {
  font-family: 'MaterialIcons';
  src: url('assets/fonts/MaterialIcons-Regular.otf') format('opentype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: 'Material Icons';
  src: url('assets/fonts/MaterialIcons-Regular.otf') format('opentype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
""";
    head.append(style);
  } catch (e) {
    debugPrint('No pude instalar el fix web de Material Icons: $e');
  }
}

String webLocationPath() => (html.window.location.pathname ?? '').trim();

void openPlatformUrl(String url, String target) {
  html.window.open(url, target);
}

void replacePlatformHistory(String title, String path) {
  html.window.history.replaceState(null, title, path);
}

class _NsfwJsBridge {
  static Object? _modelPromise;
  static Object? _model;
  static bool _scriptsRequested = false;

  static Future<void> _loadScriptOnce(String id, String src) async {
    if (html.document.getElementById(id) != null) return;

    final completer = Completer<void>();
    final script = html.ScriptElement()
      ..id = id
      ..src = src
      ..async = true;

    script.onLoad.first.then((_) {
      if (!completer.isCompleted) completer.complete();
    });
    script.onError.first.then((_) {
      if (!completer.isCompleted) completer.completeError(Exception('No se pudo cargar $src'));
    });

    html.document.head?.append(script);
    await completer.future.timeout(const Duration(seconds: 18));
  }

  static Future<Object?> _modelOrNull() async {
    try {
      if (_model != null) return _model;
      if (!_scriptsRequested) {
        _scriptsRequested = true;
        await _loadScriptOnce(
          'sayittome-tfjs',
          'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
        );
        await _loadScriptOnce(
          'sayittome-nsfwjs',
          'https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js',
        );
      }

      final nsfwjs = js_util.getProperty<Object?>(html.window, 'nsfwjs');
      if (nsfwjs == null) return null;
      _modelPromise ??= js_util.callMethod<Object>(nsfwjs, 'load', const []);
      _model = await js_util.promiseToFuture<Object>(_modelPromise!);
      return _model;
    } catch (e) {
      debugPrint('No pude inicializar detector NSFW de historias: $e');
      return null;
    }
  }

  static Future<html.ImageElement> _loadImageElement(String url) async {
    final completer = Completer<html.ImageElement>();
    final image = html.ImageElement()
      ..crossOrigin = 'anonymous'
      ..src = url;

    image.onLoad.first.then((_) {
      if (!completer.isCompleted) completer.complete(image);
    });
    image.onError.first.then((_) {
      if (!completer.isCompleted) completer.completeError(Exception('No se pudo leer la imagen para moderación'));
    });

    return completer.future.timeout(const Duration(seconds: 18));
  }

  static double _scoreFromPredictions(List<dynamic> predictions, String className) {
    for (final item in predictions) {
      final rawName = (js_util.getProperty<Object?>(item, 'className') ?? '').toString().trim().toLowerCase();
      if (rawName == className.toLowerCase()) {
        final rawProbability = js_util.getProperty<Object?>(item, 'probability');
        if (rawProbability is num) return rawProbability.toDouble();
        return double.tryParse(rawProbability.toString()) ?? 0;
      }
    }
    return 0;
  }

  static Future<Map<String, dynamic>> classify(String url) async {
    final model = await _modelOrNull();
    if (model == null) {
      return <String, dynamic>{
        'available': false,
        'provider': 'nsfwjs-web',
        'error': 'modelo_no_disponible',
      };
    }

    final image = await _loadImageElement(url);
    final rawPredictions = await js_util.promiseToFuture<Object>(
      js_util.callMethod<Object>(model, 'classify', [image]),
    );
    final predictions = List<dynamic>.from(rawPredictions as dynamic);

    return <String, dynamic>{
      'available': true,
      'provider': 'nsfwjs-web',
      'porn': _scoreFromPredictions(predictions, 'Porn'),
      'hentai': _scoreFromPredictions(predictions, 'Hentai'),
      'sexy': _scoreFromPredictions(predictions, 'Sexy'),
      'neutral': _scoreFromPredictions(predictions, 'Neutral'),
    };
  }
}

Future<Map<String, dynamic>> classifyNsfwImageUrlForCurrentPlatform(String url) async {
  final cleanUrl = url.trim();
  if (cleanUrl.isEmpty) {
    return <String, dynamic>{
      'available': false,
      'provider': 'nsfwjs-web',
      'error': 'url_vacia',
    };
  }

  try {
    return await _NsfwJsBridge.classify(cleanUrl);
  } catch (e) {
    debugPrint('No pude clasificar historia sensible: $e');
    return <String, dynamic>{
      'available': false,
      'provider': 'nsfwjs-web',
      'error': e.toString(),
    };
  }
}

class SayItToMePlatformInlineVideoPlayer extends StatefulWidget {
  final String url;
  final double aspectRatio;
  final bool controls;
  final bool autoplay;
  final bool loop;
  final bool muted;
  final BoxFit fit;
  final ValueChanged<Duration>? onDurationKnown;
  final VoidCallback? onEnded;

  const SayItToMePlatformInlineVideoPlayer({
    super.key,
    required this.url,
    this.aspectRatio = 16 / 9,
    this.controls = true,
    this.autoplay = false,
    this.loop = false,
    this.muted = false,
    this.fit = BoxFit.contain,
    this.onDurationKnown,
    this.onEnded,
  });

  @override
  State<SayItToMePlatformInlineVideoPlayer> createState() => _SayItToMePlatformInlineVideoPlayerState();
}

class _SayItToMePlatformInlineVideoPlayerState extends State<SayItToMePlatformInlineVideoPlayer> {
  static int _serial = 0;
  late final String _viewType;
  late final html.VideoElement _video;
  final List<StreamSubscription<dynamic>> _videoSubscriptions = <StreamSubscription<dynamic>>[];

  @override
  void initState() {
    super.initState();
    _viewType = 'sayittome-video-${DateTime.now().microsecondsSinceEpoch}-${_serial++}';
    _video = html.VideoElement()
      ..src = widget.url
      ..controls = widget.controls
      ..autoplay = widget.autoplay
      ..loop = widget.loop
      ..muted = widget.muted
      ..preload = 'metadata';
    _video.setAttribute('playsinline', 'true');
    _video.setAttribute('webkit-playsinline', 'true');

    _video.style
      ..width = '100%'
      ..height = '100%'
      ..backgroundColor = 'black'
      ..border = '0'
      ..objectFit = widget.fit == BoxFit.cover ? 'cover' : 'contain';

    _videoSubscriptions.add(_video.onLoadedMetadata.listen((_) => _emitDurationIfUsable()));
    _videoSubscriptions.add(_video.onDurationChange.listen((_) => _emitDurationIfUsable()));
    _videoSubscriptions.add(_video.onCanPlay.listen((_) => _emitDurationIfUsable()));
    _videoSubscriptions.add(_video.onEnded.listen((_) => widget.onEnded?.call()));

    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) => _video);
  }

  void _emitDurationIfUsable() {
    final rawSeconds = _video.duration;
    if (rawSeconds.isNaN || rawSeconds.isInfinite || rawSeconds <= 0) return;
    final duration = Duration(milliseconds: (rawSeconds * 1000).round());
    widget.onDurationKnown?.call(duration);
  }

  @override
  void didUpdateWidget(covariant SayItToMePlatformInlineVideoPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _video
        ..pause()
        ..src = widget.url
        ..load();
      _emitDurationIfUsable();
      if (widget.autoplay) {
        _video.play().catchError((_) {});
      }
    }
  }

  @override
  void dispose() {
    for (final subscription in _videoSubscriptions) {
      unawaited(subscription.cancel());
    }
    try {
      _video.pause();
      _video.removeAttribute('src');
      _video.load();
      _video.remove();
    } catch (_) {}
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.url.trim().isEmpty) {
      return Container(
        color: Colors.black,
        alignment: Alignment.center,
        child: Text(
          'Video no disponible',
          style: TextStyle(color: Colors.white.withOpacity(0.62), fontWeight: FontWeight.w900),
        ),
      );
    }

    return AspectRatio(
      aspectRatio: widget.aspectRatio,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: HtmlElementView(viewType: _viewType),
      ),
    );
  }
}
