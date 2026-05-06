import 'dart:async';
import 'package:flutter/material.dart';

void installMaterialIconsWebFontFix() {}

String webLocationPath() => Uri.base.path;

void openPlatformUrl(String url, String target) {
  debugPrint('openPlatformUrl no-op outside web: $url target=$target');
}

void replacePlatformHistory(String title, String path) {
  debugPrint('replacePlatformHistory no-op outside web: $title $path');
}

Future<Map<String, dynamic>> classifyNsfwImageUrlForCurrentPlatform(String url) async {
  return <String, dynamic>{
    'available': false,
    'provider': 'mobile-fallback',
    'error': 'nsfwjs_solo_web',
    'porn': 0.0,
    'hentai': 0.0,
    'sexy': 0.0,
    'neutral': 0.0,
  };
}

class SayItToMePlatformInlineVideoPlayer extends StatelessWidget {
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
  Widget build(BuildContext context) {
    if (url.trim().isEmpty) {
      return Container(
        color: Colors.black,
        alignment: Alignment.center,
        child: Text(
          'Video no disponible',
          style: TextStyle(color: Colors.white.withOpacity(0.62), fontWeight: FontWeight.w900),
        ),
      );
    }

    // Fallback Android/iOS sin dependencia extra.
    // Para reproducción real nativa, el próximo paso es sumar package:video_player
    // y reemplazar este fallback por VideoPlayerController.networkUrl().
    WidgetsBinding.instance.addPostFrameCallback((_) {
      onDurationKnown?.call(const Duration(seconds: 30));
    });

    return AspectRatio(
      aspectRatio: aspectRatio,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Container(
          color: Colors.black,
          alignment: Alignment.center,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.play_circle_fill_rounded, color: Colors.white.withOpacity(0.86), size: 58),
                const SizedBox(height: 12),
                Text(
                  'Video cargado',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withOpacity(0.82), fontSize: 16, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                Text(
                  'La reproducción nativa para Android se activa agregando video_player. Web mantiene el reproductor HTML real.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withOpacity(0.50), height: 1.25, fontSize: 12.5, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
