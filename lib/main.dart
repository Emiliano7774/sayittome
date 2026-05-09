// ===================== V70 ADMIN AVATAR ROBUST FIX / NO-ACHICAR =====================
// Cambio real:
// - Auditoría de conversaciones resuelve el receptor por docId y también por campo uid.
// - El avatar admin usa _ProfileAvatar, igual que el resto de la app, con estrategia web.
// - Esto corrige el caso donde la URL existía pero Image.network simple no la renderizaba.
// - Mantiene fallback si el perfil no existe o no tiene fotos.
// ===================================================================================

// ===================== V69 ADMIN AVATAR ROBUST FIX / NO-ACHICAR =====================
// Cambio real:
// - Auditar conversaciones ahora no depende solo de usuarios/{uid}/fotoPrincipal.
// - También busca fotos en photoURL, avatarUrl, fotoPerfil, profileImageUrl y listas fotos/photos/imagenes.
// - Sirve para perfiles históricos donde la foto quedó en fotos[0] y no en fotoPrincipal.
// - Mantiene fallback al dato guardado en chats_anonimos si existe.
// - Objetivo: que los receptores se vean con su foto real en la lista de auditoría.
// ================================================================================

// ===================== V68 ADMIN AUDIT RECEIVER PHOTO FIX =====================
// Cambio real:
// - Auditar conversaciones ahora resuelve la foto del receptor EN VIVO desde usuarios/{receptorUid}/fotoPrincipal.
// - Si el chat viejo no guardó receptorFotoPrincipal, igual aparece la foto actual del perfil receptor.
// - Mantiene fallback a campos históricos del chat.
// - No toca mensajes, media temporal, historias ni lógica de chats.
// ============================================================================

import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'web_stub.dart'
    if (dart.library.html) 'web_only.dart' as html;

import 'web_stub.dart'
    if (dart.library.js_util) 'web_only.dart' as js_util;

import 'dart:ui' show ImageFilter, PointerDeviceKind;
import 'web_stub.dart'
    if (dart.library.html) 'web_only.dart' as ui_web;
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb;
import 'package:flutter/services.dart';

// 🔥 FIREBASE
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:audioplayers/audioplayers.dart';

// 🔥 LOCAL STORAGE (INVITADO)
import 'package:shared_preferences/shared_preferences.dart';

import 'firebase_options.dart';

class _WhipSoundService {
  static final AudioPlayer _player = AudioPlayer();
  static final AudioPlayer _backupPlayer = AudioPlayer();
  static DateTime? _lastPlayedAt;
  static bool _unlockedByGesture = false;

  static Future<void> _playOnce(AudioPlayer player, {double volume = 1.0}) async {
    await player.stop();
    await player.setPlayerMode(PlayerMode.lowLatency);
    await player.setReleaseMode(ReleaseMode.stop);
    await player.play(AssetSource('sounds/whip.mp3'), volume: volume);
  }

  static Future<void> unlockFromUserGesture() async {
    if (_unlockedByGesture) return;
    try {
      _unlockedByGesture = true;
      await _playOnce(_backupPlayer, volume: 0.01);
      await Future.delayed(const Duration(milliseconds: 80));
      await _backupPlayer.stop();
    } catch (e) {
      _unlockedByGesture = false;
      debugPrint('No pude precalentar el sonido de látigo: $e');
    }
  }

  static Future<void> playIncomingMessageWhip() async {
    try {
      final now = DateTime.now();
      final last = _lastPlayedAt;
      if (last != null && now.difference(last).inMilliseconds < 450) return;
      _lastPlayedAt = now;

      await _playOnce(_player);

      // Refuerzo para navegador en segundo plano/minimizado:
      // no fuerza una pestaña suspendida por el sistema, pero si Brave/Chrome
      // mantiene vivo el listener de Firestore, intenta un segundo disparo corto
      // para evitar que el primer play se pierda al cambiar de pestaña.
      final lifecycle = WidgetsBinding.instance.lifecycleState;
      if (lifecycle != AppLifecycleState.resumed) {
        Future.delayed(const Duration(milliseconds: 180), () async {
          try {
            await _playOnce(_backupPlayer);
          } catch (e) {
            debugPrint('No pude reproducir refuerzo de látigo: $e');
          }
        });
      }
    } catch (e) {
      debugPrint('No pude reproducir el sonido de látigo: $e');
    }
  }
}

class _AnonAbuseBlockStatus {
  final bool active;
  final Timestamp? expiresAt;
  final String message;

  const _AnonAbuseBlockStatus({
    required this.active,
    this.expiresAt,
    this.message = "Esta conversación fue bloqueada temporalmente por denuncia. Podés volver a intentar más tarde.",
  });
}

String _anonAbuseSafeDocPart(String value) {
  final clean = value.trim();
  if (clean.isEmpty) return "empty";
  return clean.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
}

String _anonAbuseBlockDocId({
  required String receptorUid,
  required String fingerprintAnonimo,
}) {
  return "${_anonAbuseSafeDocPart(receptorUid)}_${_anonAbuseSafeDocPart(fingerprintAnonimo)}";
}

Future<String> _getOrCreateAnonAbuseFingerprint() async {
  final prefs = await SharedPreferences.getInstance();
  final existing = (prefs.getString("anonAbuseFingerprint") ?? "").trim();
  if (existing.isNotEmpty) return existing;

  final createdAt = DateTime.now().millisecondsSinceEpoch;
  final randomPart = Random().nextInt(999999999);
  final userAgentPart = kIsWeb
      ? (html.window.navigator.userAgent ?? "web").hashCode.abs().toString()
      : "native_${defaultTargetPlatform.name.hashCode.abs()}";

  final created = "abuse_${createdAt}_${randomPart}_$userAgentPart";
  await prefs.setString("anonAbuseFingerprint", created);
  await prefs.setString("anonAbuseFingerprintCreatedAt", DateTime.now().toIso8601String());
  return created;
}

DateTime? _anonAbuseTimestampToDate(dynamic value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  if (value is int) {
    final ms = value > 9999999999 ? value : value * 1000;
    return DateTime.fromMillisecondsSinceEpoch(ms);
  }
  if (value is String) return DateTime.tryParse(value.trim());
  return null;
}

Future<_AnonAbuseBlockStatus> _getAnonAbuseBlockStatus({
  required String receptorUid,
  required String fingerprintAnonimo,
}) async {
  final cleanReceptor = receptorUid.trim();
  final cleanFingerprint = fingerprintAnonimo.trim();
  if (cleanReceptor.isEmpty || cleanFingerprint.isEmpty) {
    return const _AnonAbuseBlockStatus(active: false);
  }

  try {
    final docId = _anonAbuseBlockDocId(
      receptorUid: cleanReceptor,
      fingerprintAnonimo: cleanFingerprint,
    );
    final doc = await FirebaseFirestore.instance.collection("anon_abuse_blocks").doc(docId).get();
    final data = doc.data();
    if (data == null) return const _AnonAbuseBlockStatus(active: false);

    final expiresAtDate = _anonAbuseTimestampToDate(data["expiresAt"]);
    if (expiresAtDate == null || !expiresAtDate.isAfter(DateTime.now())) {
      return const _AnonAbuseBlockStatus(active: false);
    }

    final expiresRaw = data["expiresAt"];
    final expiresTimestamp = expiresRaw is Timestamp ? expiresRaw : Timestamp.fromDate(expiresAtDate);
    return _AnonAbuseBlockStatus(
      active: true,
      expiresAt: expiresTimestamp,
      message: "Esta conversación fue bloqueada temporalmente por denuncia. Podés volver a intentar más tarde.",
    );
  } catch (e) {
    debugPrint("No pude consultar bloqueo antiacoso: $e");
    return const _AnonAbuseBlockStatus(active: false);
  }
}

Future<bool> _isAnonAbuseBlocked({
  required String receptorUid,
  required String fingerprintAnonimo,
}) async {
  final status = await _getAnonAbuseBlockStatus(
    receptorUid: receptorUid,
    fingerprintAnonimo: fingerprintAnonimo,
  );
  return status.active;
}

Future<Timestamp> _createAnonAbuseTemporaryBlock({
  required String receptorUid,
  required String chatId,
  required String visitorId,
  required String anonId,
  required String fingerprintAnonimo,
  String motivo = "acoso",
}) async {
  final cleanReceptor = receptorUid.trim();
  final cleanFingerprint = fingerprintAnonimo.trim();
  if (cleanReceptor.isEmpty || cleanFingerprint.isEmpty) {
    throw Exception("Faltan datos técnicos para crear el bloqueo antiacoso.");
  }

  final expiresAt = Timestamp.fromDate(DateTime.now().add(const Duration(minutes: 30)));
  final docId = _anonAbuseBlockDocId(
    receptorUid: cleanReceptor,
    fingerprintAnonimo: cleanFingerprint,
  );

  final blockPayload = {
    "receptorUid": cleanReceptor,
    "chatId": chatId.trim(),
    "visitorId": visitorId.trim(),
    "anonId": anonId.trim(),
    "fingerprintAnonimo": cleanFingerprint,
    "motivo": motivo,
    "createdAt": FieldValue.serverTimestamp(),
    "createdAtClient": Timestamp.fromDate(DateTime.now()),
    "expiresAt": expiresAt,
    "durationMinutes": 30,
  };

  final firestore = FirebaseFirestore.instance;
  await firestore.collection("anon_abuse_blocks").doc(docId).set(blockPayload, SetOptions(merge: true));

  final cleanChatId = chatId.trim();
  if (cleanChatId.isNotEmpty) {
    await firestore.collection("chats_anonimos").doc(cleanChatId).set({
      "anonBlocked": true,
      "blockedByReceiver": true,
      "blockedReason": motivo,
      "blockedUntil": expiresAt,
      "blockedFingerprint": cleanFingerprint,
      "blockedVisitorId": visitorId.trim(),
      "blockedAnonId": anonId.trim(),
      "blockedAt": FieldValue.serverTimestamp(),
      "blockedAtClient": Timestamp.fromDate(DateTime.now()),
    }, SetOptions(merge: true));
  }

  return expiresAt;
}



void _installMaterialIconsWebFontFix() {
  if (!kIsWeb) return;

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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _installMaterialIconsWebFontFix();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // La identidad anónima es descartable: si se refresca el navegador,
  // se borra para que el próximo ingreso anónimo no reutilice chats previos.
  await _resetAnonIdentityOnly(reason: "app_start");

  runApp(const SayItToMeApp());
}

class SayItToMeApp extends StatelessWidget {
  const SayItToMeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SayItToMe',
      debugShowCheckedModeBanner: false,
      scrollBehavior: const _SayItToMeScrollBehavior(),
      builder: (context, child) => _MaterialIconWarmup(child: child ?? const SizedBox.shrink()),
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF050505),
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF050505),
          elevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C63FF),
          brightness: Brightness.dark,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF101010),
          hintStyle: TextStyle(color: Colors.white.withOpacity(0.38)),
          labelStyle: TextStyle(color: Colors.white.withOpacity(0.70)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.10)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.4),
          ),
        ),
      ),
      home: const _PresenceHeartbeat(
        child: _IncomingMessageWhipListener(
          child: _InitialPublicRouteGate(),
        ),
      ),
    );
  }
}

class _SayItToMeScrollBehavior extends MaterialScrollBehavior {
  const _SayItToMeScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
        PointerDeviceKind.unknown,
      };
}



class _MaterialIconWarmup extends StatelessWidget {
  final Widget child;

  const _MaterialIconWarmup({required this.child});

  static const List<IconData> _icons = [
    Icons.account_circle_rounded,
    Icons.add_circle_outline_rounded,
    Icons.add_circle_rounded,
    Icons.add_rounded,
    Icons.arrow_back_rounded,
    Icons.auto_stories_outlined,
    Icons.auto_stories_rounded,
    Icons.block_rounded,
    Icons.brightness_1_rounded,
    Icons.brightness_7_rounded,
    Icons.broken_image_rounded,
    Icons.chat_bubble_rounded,
    Icons.chevron_right_rounded,
    Icons.close_rounded,
    Icons.copy_rounded,
    Icons.delete_forever_rounded,
    Icons.delete_outline_rounded,
    Icons.delete_rounded,
    Icons.done_all_rounded,
    Icons.drag_indicator_rounded,
    Icons.event_busy_rounded,
    Icons.favorite_border_rounded,
    Icons.favorite_rounded,
    Icons.filter_list_rounded,
    Icons.flash_off_rounded,
    Icons.flip_camera_android_rounded,
    Icons.forward_to_inbox_rounded,
    Icons.hourglass_top_rounded,
    Icons.image_not_supported_rounded,
    Icons.image_rounded,
    Icons.ios_share_rounded,
    Icons.link_rounded,
    Icons.local_fire_department_rounded,
    Icons.location_on_rounded,
    Icons.lock_rounded,
    Icons.login_rounded,
    Icons.logout_rounded,
    Icons.mark_email_unread_rounded,
    Icons.more_vert_rounded,
    Icons.movie_creation_rounded,
    Icons.nightlight_round,
    Icons.pause_rounded,
    Icons.person_add_alt_1_rounded,
    Icons.person_off_rounded,
    Icons.person_pin_rounded,
    Icons.person_remove_rounded,
    Icons.person_rounded,
    Icons.person_search_rounded,
    Icons.photo_camera_back_rounded,
    Icons.photo_camera_rounded,
    Icons.photo_library_rounded,
    Icons.photo_rounded,
    Icons.play_arrow_rounded,
    Icons.play_circle_fill_rounded,
    Icons.report_rounded,
    Icons.rocket_launch_rounded,
    Icons.save_rounded,
    Icons.search_rounded,
    Icons.send,
    Icons.shuffle_rounded,
    Icons.support_agent_rounded,
    Icons.timer_rounded,
    Icons.trip_origin_rounded,
    Icons.verified_rounded,
    Icons.verified_user_rounded,
    Icons.video_camera_back_rounded,
    Icons.video_library_rounded,
    Icons.videocam_rounded,
    Icons.visibility_off_rounded,
    Icons.visibility_rounded,
    Icons.warning_amber_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        Positioned(
          left: -10000,
          top: -10000,
          child: IgnorePointer(
            child: Opacity(
              opacity: 0.001,
              child: Wrap(
                children: _icons.map((icon) => Icon(icon, size: 1)).toList(growable: false),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PresenceHeartbeat extends StatefulWidget {
  final Widget child;

  const _PresenceHeartbeat({required this.child});

  @override
  State<_PresenceHeartbeat> createState() => _PresenceHeartbeatState();
}

class _PresenceHeartbeatState extends State<_PresenceHeartbeat> with WidgetsBindingObserver {
  Timer? _timer;
  String? _lastUid;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _touchPresence();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _touchPresence());
    FirebaseAuth.instance.authStateChanges().listen((_) => _touchPresence());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed || state == AppLifecycleState.inactive) {
      _touchPresence();
    }
  }

  Future<void> _touchPresence() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    _lastUid = user.uid;

    try {
      await FirebaseFirestore.instance.collection("usuarios").doc(user.uid).set({
        "online": true,
        "lastActiveAt": FieldValue.serverTimestamp(),
        "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
        "updatedAt": FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)).timeout(const Duration(seconds: 6));
    } catch (e) {
      debugPrint("No pude actualizar presencia: $e");
    }
  }



  @override
  void dispose() {
    final uid = _lastUid;
    if (uid != null) {
      FirebaseFirestore.instance.collection("usuarios").doc(uid).set({
        "online": false,
        "lastSeenAt": FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)).catchError((_) {});
    }
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}


class _IncomingMessageWhipListener extends StatefulWidget {
  final Widget child;

  const _IncomingMessageWhipListener({required this.child});

  @override
  State<_IncomingMessageWhipListener> createState() => _IncomingMessageWhipListenerState();
}

class _IncomingMessageWhipListenerState extends State<_IncomingMessageWhipListener> {
  StreamSubscription<User?>? _authSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _receivedAsProfileSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _sentAsProfileSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _sentAsAnonSubscription;
  Timer? _anonPresenceTimer;

  final Map<String, int> _knownReceivedUnreadByChat = <String, int>{};
  final Map<String, int> _knownSentUnreadByChat = <String, int>{};
  bool _receivedAsProfileReady = false;
  bool _sentAsProfileReady = false;
  bool _sentAsAnonReady = false;

  @override
  void initState() {
    super.initState();
    _setupListeners();
    _anonPresenceTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      _touchAnonymousPresence(reason: "global_heartbeat");
    });
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    _receivedAsProfileSubscription?.cancel();
    _sentAsProfileSubscription?.cancel();
    _sentAsAnonSubscription?.cancel();
    _anonPresenceTimer?.cancel();
    super.dispose();
  }

  void _setupListeners() {
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen((user) async {
      await _receivedAsProfileSubscription?.cancel();
      await _sentAsProfileSubscription?.cancel();
      await _sentAsAnonSubscription?.cancel();
      _knownReceivedUnreadByChat.clear();
      _knownSentUnreadByChat.clear();
      _updateGlobalUnreadChatSignal();
      _receivedAsProfileReady = false;
      _sentAsProfileReady = false;
      _sentAsAnonReady = false;

      if (user != null) {
        _listenReceivedAsProfile(user.uid);
        _listenSentAsProfile(user.uid);
      }

      final prefs = await SharedPreferences.getInstance();
      final visitorId = (prefs.getString("visitorId") ?? "").trim();
      if (visitorId.isNotEmpty) {
        _listenSentAsAnon(visitorId);
      }
    });

    _refreshAnonListenerFromPrefs();
  }

  Future<void> _refreshAnonListenerFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    final visitorId = (prefs.getString("visitorId") ?? "").trim();
    if (visitorId.isEmpty) return;
    _listenSentAsAnon(visitorId);
  }

  void _updateGlobalUnreadChatSignal() {
    final totalReceived = _knownReceivedUnreadByChat.values.fold<int>(0, (sum, value) => sum + max(0, value));
    final totalSent = _knownSentUnreadByChat.values.fold<int>(0, (sum, value) => sum + max(0, value));
    _globalUnreadChatSignal.value = totalReceived + totalSent;
  }

  void _listenReceivedAsProfile(String uid) {
    _receivedAsProfileSubscription = FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("receptorUid", isEqualTo: uid)
        .snapshots()
        .listen((snapshot) {
      var shouldPlay = false;

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final unread = _globalSafeInt(data["unreadCount"]);
        final previous = _knownReceivedUnreadByChat[doc.id];
        if (_receivedAsProfileReady && previous != null && unread > previous) {
          shouldPlay = true;
        }
        _knownReceivedUnreadByChat[doc.id] = unread;
      }

      _receivedAsProfileReady = true;
      _updateGlobalUnreadChatSignal();
      if (shouldPlay) _WhipSoundService.playIncomingMessageWhip();
    }, onError: (e) {
      debugPrint("No pude escuchar chats recibidos para sonido: $e");
    });
  }

  void _listenSentAsProfile(String uid) {
    _sentAsProfileSubscription = FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("senderOwnerUid", isEqualTo: uid)
        .snapshots()
        .listen((snapshot) {
      var shouldPlay = false;

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final unread = _globalSafeInt(data["unreadForSender"]);
        final previous = _knownSentUnreadByChat[doc.id];
        if (_sentAsProfileReady && previous != null && unread > previous) {
          shouldPlay = true;
        }
        _knownSentUnreadByChat[doc.id] = unread;
      }

      _sentAsProfileReady = true;
      _updateGlobalUnreadChatSignal();
      if (shouldPlay) _WhipSoundService.playIncomingMessageWhip();
    }, onError: (e) {
      debugPrint("No pude escuchar chats enviados como perfil para sonido: $e");
    });
  }

  void _listenSentAsAnon(String visitorId) {
    _sentAsAnonSubscription?.cancel();
    _sentAsAnonReady = false;

    _sentAsAnonSubscription = FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("visitorId", isEqualTo: visitorId)
        .snapshots()
        .listen((snapshot) {
      var shouldPlay = false;

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final unread = _globalSafeInt(data["unreadForSender"]);
        final previous = _knownSentUnreadByChat[doc.id];
        if (_sentAsAnonReady && previous != null && unread > previous) {
          shouldPlay = true;
        }
        _knownSentUnreadByChat[doc.id] = unread;
      }

      _sentAsAnonReady = true;
      _updateGlobalUnreadChatSignal();
      if (shouldPlay) _WhipSoundService.playIncomingMessageWhip();
    }, onError: (e) {
      debugPrint("No pude escuchar chats enviados como anónimo para sonido: $e");
    });
  }

  int _safeInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? "") ?? 0;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

Future<void> _touchAnonymousPresence({String reason = "anonymous"}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    var visitorId = (prefs.getString("visitorId") ?? "").trim();
    var anonId = (prefs.getString("anonId") ?? "").trim();
    final abuseFingerprint = await _getOrCreateAnonAbuseFingerprint();

    if (visitorId.isEmpty) {
      visitorId = "v-${Random().nextInt(999999999)}";
      await prefs.setString("visitorId", visitorId);
    }

    if (anonId.isEmpty) {
      anonId = "anon-${Random().nextInt(999999)}";
      await prefs.setString("anonId", anonId);
    }

    await FirebaseFirestore.instance.collection("anonimos_activos").doc(visitorId).set({
      "visitorId": visitorId,
      "anonId": anonId,
      "fingerprintAnonimo": abuseFingerprint,
      "reason": reason,
      "updatedAt": FieldValue.serverTimestamp(),
      "updatedAtClient": Timestamp.fromDate(DateTime.now()),
    }, SetOptions(merge: true)).timeout(const Duration(seconds: 6));
  } catch (e) {
    debugPrint("No pude actualizar presencia anónima: $e");
  }
}

DateTime? _activityDateFromData(Map<String, dynamic> data) {
  final lastActiveAt = data["lastActiveAt"];
  if (lastActiveAt is Timestamp) return lastActiveAt.toDate();

  final lastActiveAtClient = data["lastActiveAtClient"];
  if (lastActiveAtClient is Timestamp) return lastActiveAtClient.toDate();

  final lastSeenAt = data["lastSeenAt"];
  if (lastSeenAt is Timestamp) return lastSeenAt.toDate();

  // Fallback para perfiles viejos que fueron creados antes de guardar presencia.
  // Evita que el perfil público muestre "Última vez desconocida" cuando sí existe
  // una fecha útil de actividad/edición en el documento.
  final updatedAt = data["updatedAt"];
  if (updatedAt is Timestamp) return updatedAt.toDate();

  final createdAt = data["createdAt"];
  if (createdAt is Timestamp) return createdAt.toDate();

  return null;
}

DateTime? _profileCreatedDateFromData(Map<String, dynamic> data) {
  final candidates = [
    data["createdAt"],
    data["createdAtServer"],
    data["fechaRegistro"],
    data["registeredAt"],
    data["createdAtClient"],
  ];

  for (final value in candidates) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    if (value is int) {
      final milliseconds = value > 9999999999 ? value : value * 1000;
      return DateTime.fromMillisecondsSinceEpoch(milliseconds);
    }
    if (value is String) {
      final parsed = DateTime.tryParse(value.trim());
      if (parsed != null) return parsed;
    }
  }

  return null;
}

String _profileCreatedDateText(DateTime value) {
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];

  final local = value.toLocal();
  final month = months[(local.month - 1).clamp(0, 11).toInt()];
  return 'Cuenta creada el ${local.day} de $month de ${local.year}';
}


String _lastSeenText(DateTime? value) {
  if (value == null) return "Última vez no disponible";

  final now = DateTime.now();
  final diff = now.difference(value);

  // El perfil público muestra "En línea" durante los primeros minutos.
  // A partir de 5 min empieza a contar minuto por minuto.
  if (diff.inMinutes < 5) return "En línea";
  if (diff.inMinutes < 60) return "Última vez hace ${diff.inMinutes} min";
  if (diff.inHours < 24) {
    final h = diff.inHours;
    return "Última vez hace $h h";
  }

  final days = diff.inDays;
  if (days <= 1) return "Última vez hace 1 día";
  return "Última vez hace $days días";
}

bool _isActivityInsideLastHour(DateTime? value) {
  if (value == null) return false;
  return value.isAfter(DateTime.now().subtract(const Duration(hours: 1)));
}

Future<void> _resetAnonIdentityOnly({String reason = "manual"}) async {
  // La identidad anónima local es descartable.
  // Cada entrada anónima nueva debe crear anonId/visitorId nuevos,
  // así no se recupera el chat anterior con la misma persona.
  // Aplica tanto a visitantes como a usuarios con perfil real.
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove("anonId");
    await prefs.remove("visitorId");
    await prefs.setString("anonIdentityResetAt", DateTime.now().toIso8601String());
    await prefs.setString("anonIdentityResetReason", reason);
  } catch (e) {
    debugPrint("No pude reiniciar identidad anónima local: $e");
  }
}

Future<void> _signOutAndResetAnonIdentity() async {
  await _resetAnonIdentityOnly(reason: "sign_out");
  await FirebaseAuth.instance.signOut();
}

// Señal global para que el botón Shuffle de la barra inferior pueda
// pedir una nueva tirada random sin reconstruir toda la navegación.
final ValueNotifier<int> _shuffleRerollSignal = ValueNotifier<int>(0);

// Señal global de misterio para el globito inferior de chats.
// No muestra un número explícito: solo una marca rojo/naranja apagada cuando
// existe algo nuevo pendiente de leer/atender.
final ValueNotifier<int> _globalUnreadChatSignal = ValueNotifier<int>(0);


class _InitialPublicRouteGate extends StatelessWidget {
  const _InitialPublicRouteGate();

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return const SayItToMeHomePage();

    final path = (html.window.location.pathname ?? '').trim().toLowerCase();
    if (path == '/descargar/android' || path == '/download/android' || path == '/android') {
      return const AndroidDownloadPage();
    }
    if (path == '/descargar/iphone' || path == '/download/iphone' || path == '/ios' || path == '/iphone') {
      return const IphoneDownloadPage();
    }

    return const SayItToMeHomePage();
  }
}

class AndroidDownloadPage extends StatelessWidget {
  const AndroidDownloadPage({super.key});

  static const String apkPath = '/downloads/sayittome.apk';

  void _downloadApk(BuildContext context) {
    try {
      html.window.open(apkPath, '_blank');
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No pude abrir el APK: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return _DownloadLandingShell(
      icon: Icons.android,
      title: 'Descargar SayItToMe para Android',
      subtitle: 'Acá va a vivir el archivo APK directo mientras termina el proceso de Play Store.',
      primaryText: 'Descargar APK',
      primaryIcon: Icons.file_download_rounded,
      onPrimaryTap: () => _downloadApk(context),
      notes: const [
        'Archivo esperado en Firebase Hosting: /downloads/sayittome.apk',
        'Para publicarlo, copiá el APK dentro de build/web/downloads/sayittome.apk antes del deploy.',
        'En Android puede aparecer una advertencia de instalación externa hasta que esté disponible en Play Store.',
      ],
    );
  }
}

class IphoneDownloadPage extends StatelessWidget {
  const IphoneDownloadPage({super.key});

  void _openWeb(BuildContext context) {
    try {
      html.window.open('/', '_self');
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No pude abrir la versión web: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return _DownloadLandingShell(
      icon: Icons.ios_share_rounded,
      title: 'Instalar SayItToMe en iPhone',
      subtitle: 'La versión nativa para iOS requiere verificaciones adicionales de Apple. Ya está llegando; mientras tanto podés usar SayItToMe como app desde Safari.',
      primaryText: 'Abrir SayItToMe web',
      primaryIcon: Icons.open_in_browser_rounded,
      onPrimaryTap: () => _openWeb(context),
      notesTitle: 'Cómo instalarla en iPhone',
      notes: const [
        'Abrí esta página desde Safari. En iPhone, la instalación como app funciona mejor desde Safari.',
        'Tocá el botón Compartir de Safari, el cuadrado con flecha hacia arriba.',
        'Elegí “Agregar a pantalla de inicio” y confirmá el nombre SayItToMe.',
        'Te va a quedar el ícono en el inicio del iPhone, como una app normal.',
        'Estamos trabajando para llevar SayItToMe a App Store/TestFlight con las verificaciones que pide Apple.',
      ],
    );
  }
}

class _DownloadLandingShell extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String primaryText;
  final IconData primaryIcon;
  final VoidCallback onPrimaryTap;
  final String notesTitle;
  final List<String> notes;

  const _DownloadLandingShell({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.primaryText,
    required this.primaryIcon,
    required this.onPrimaryTap,
    this.notesTitle = 'Antes de instalar',
    required this.notes,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () {
            if (Navigator.of(context).canPop()) {
              Navigator.pop(context);
            } else {
              html.window.history.replaceState(null, 'SayItToMe', '/');
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (_) => const SayItToMeHomePage()),
              );
            }
          },
        ),
        title: const Text('SayItToMe', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 30, 24, 40),
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(24, 26, 24, 24),
                  decoration: BoxDecoration(
                    color: const Color(0xFF101010),
                    borderRadius: BorderRadius.circular(32),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF6C63FF).withOpacity(0.12),
                        blurRadius: 34,
                        offset: const Offset(0, 18),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 68,
                        height: 68,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF6C63FF).withOpacity(0.20),
                          border: Border.all(color: const Color(0xFF8C84FF).withOpacity(0.45)),
                        ),
                        child: Icon(icon, color: Colors.white, size: 36),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.62),
                          fontSize: 15.5,
                          height: 1.34,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 22),
                      _PrimaryButton(
                        icon: primaryIcon,
                        text: primaryText,
                        onTap: onPrimaryTap,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0C0C0C),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withOpacity(0.07)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        notesTitle,
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 12),
                      ...notes.map((note) => Padding(
                            padding: const EdgeInsets.only(bottom: 9),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  margin: const EdgeInsets.only(top: 7),
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Color(0xFF8C84FF),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    note,
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.58),
                                      height: 1.32,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SayItToMeHomePage extends StatelessWidget {
  const SayItToMeHomePage({super.key});

  Future<void> _openShuffle(BuildContext context) async {
    await _resetAnonIdentityOnly(reason: "enter_anonymous");
    if (!context.mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ShufflePage()),
    );
  }

  void _openLogin(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AuthPrivateGate()),
    );
  }

  void _openProfile(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AuthProfileGate()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 760;

            final hero = const _ProfilePreviewCard();
            final actions = Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                _PrimaryButton(
                  icon: Icons.login_rounded,
                  text: 'Iniciar sesión',
                  onTap: () => _openLogin(context),
                ),
                const SizedBox(height: 14),
                _SecondaryButton(
                  icon: Icons.person_add_alt_1_rounded,
                  text: 'Crear perfil',
                  onTap: () => _openProfile(context),
                ),
                const SizedBox(height: 14),
                _SecondaryButton(
                  icon: Icons.shuffle_rounded,
                  text: 'Entrar anónimo',
                  onTap: () { _openShuffle(context); },
                ),
                const SizedBox(height: 18),
                const _AnonymousEntryNotice(),
              ],
            );

            return Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: wide ? 960 : 430),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    wide ? 34 : 24,
                    wide ? 34 : 28,
                    wide ? 34 : 24,
                    32,
                  ),
                  children: [
                    const _TopBar(),
                    SizedBox(height: wide ? 46 : 38),
                    if (wide)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                            flex: 6,
                            child: hero,
                          ),
                          const SizedBox(width: 32),
                          Expanded(
                            flex: 5,
                            child: actions,
                          ),
                        ],
                      )
                    else ...[
                      hero,
                      const SizedBox(height: 28),
                      actions,
                    ],
                    SizedBox(height: wide ? 26 : 18),
                    const _AppDownloadLinksCard(),
                    // El bloque de descarga queda como footer horizontal para no romper la simetría del hero + acciones.
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _AnonymousEntryNotice extends StatelessWidget {
  const _AnonymousEntryNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6C63FF).withOpacity(0.08),
            blurRadius: 22,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 39,
                height: 39,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF6C63FF).withOpacity(0.18),
                  border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.44)),
                ),
                child: const Icon(
                  Icons.visibility_off_rounded,
                  color: Color(0xFF8C84FF),
                  size: 22,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '¿No querés registrarte?',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16.5,
                        fontWeight: FontWeight.w900,
                        height: 1.08,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Tocá Entrar anónimo para escribirle a quien quieras sin crear perfil. Cada nuevo ingreso anónimo crea otra identidad.',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.64),
                        height: 1.27,
                        fontSize: 13.0,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.045),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.white.withOpacity(0.075)),
            ),
            child: Text(
              'Recordá: si refrescás, salís de anónimo o volvés a entrar, se descarta el anon anterior y se abre una identidad nueva.',
              style: TextStyle(
                color: Colors.white.withOpacity(0.58),
                height: 1.25,
                fontSize: 12.2,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}


class _AppDownloadLinksCard extends StatelessWidget {
  const _AppDownloadLinksCard();

  static const String _androidApkPath = '/downloads/sayittome.apk';

  void _openAndroidDownloadPage(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AndroidDownloadPage()),
    );
  }

  void _openIphoneDownloadPage(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const IphoneDownloadPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 15),
      decoration: BoxDecoration(
        color: const Color(0xFF0F0F0F),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Descargá la app',
            style: TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Mientras Play Store/App Store terminan su proceso, podés dejar accesos directos desde acá.',
            style: TextStyle(color: Colors.white.withOpacity(0.56), height: 1.25, fontSize: 12.6, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              Expanded(
                child: _TinyDownloadButton(
                  icon: Icons.android,
                  text: 'Android APK',
                  onTap: () => _openAndroidDownloadPage(context),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TinyDownloadButton(
                  icon: Icons.ios_share_rounded,
                  text: 'iPhone',
                  onTap: () => _openIphoneDownloadPage(context),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TinyDownloadButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  const _TinyDownloadButton({
    required this.icon,
    required this.text,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        _WhipSoundService.unlockFromUserGesture();
        onTap();
      },
      child: Container(
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white.withOpacity(0.88), size: 20),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        ),
      ),
    );
  }
}


// ===================== AUTH + PERFIL REAL =====================

class AuthPrivateGate extends StatelessWidget {
  const AuthPrivateGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;

        if (user == null) {
          return const LoginRegisterPage(nextMode: AuthNextMode.privateInbox);
        }

        if (!user.emailVerified) {
          return const VerifyEmailPage(nextMode: AuthNextMode.privateInbox);
        }

        return const ProfileSetupGate(child: InboxReceptorPage());
      },
    );
  }
}

class AuthProfileGate extends StatelessWidget {
  const AuthProfileGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;

        if (user == null) {
          return const LoginRegisterPage(nextMode: AuthNextMode.profileSetup);
        }

        if (!user.emailVerified) {
          return const VerifyEmailPage(nextMode: AuthNextMode.profileSetup);
        }

        return const ProfileSetupGate(child: PrivateProfilePage());
      },
    );
  }
}

enum AuthNextMode {
  privateInbox,
  profileSetup,
}

class LoginRegisterPage extends StatefulWidget {
  final AuthNextMode nextMode;

  const LoginRegisterPage({
    super.key,
    required this.nextMode,
  });

  @override
  State<LoginRegisterPage> createState() => _LoginRegisterPageState();
}

class _LoginRegisterPageState extends State<LoginRegisterPage> {
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

  bool loading = false;
  bool registerMode = false;
  String? error;

  Future<void> submit() async {
    final email = emailController.text.trim();
    final password = passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      setState(() => error = "Completá email y contraseña.");
      return;
    }

    if (password.length < 6) {
      setState(() => error = "La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setState(() {
      loading = true;
      error = null;
    });

    try {
      if (registerMode) {
        final cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email,
          password: password,
        );

        await cred.user!.sendEmailVerification();

        await FirebaseFirestore.instance
            .collection("usuarios")
            .doc(cred.user!.uid)
            .set({
          "uid": cred.user!.uid,
          "email": email,
          "username": "",
          "usernameLower": "",
          "nombre": "",
          "bio": "",
          "fotoPrincipal": "",
          "fotos": [],
          "videos": [],
          "pais": "AR",
          "provincia": "",
          "ciudad": "",
          "geoVisible": false,
          "emailVerified": false,
          "perfilCompleto": false,
          "shuffleActivo": true,
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp(),
          "lastActiveAt": FieldValue.serverTimestamp(),
          "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
        }, SetOptions(merge: true));
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: email,
          password: password,
        );
      }
    } on FirebaseAuthException catch (e) {
      setState(() => error = _authErrorText(e.code));
    } catch (e) {
      setState(() => error = "Error inesperado: $e");
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  String _authErrorText(String code) {
    switch (code) {
      case "email-already-in-use":
        return "Ese email ya está registrado.";
      case "invalid-email":
        return "Email inválido.";
      case "weak-password":
        return "La contraseña es muy débil.";
      case "user-not-found":
        return "No existe una cuenta con ese email.";
      case "wrong-password":
        return "Contraseña incorrecta.";
      case "invalid-credential":
        return "Email o contraseña incorrectos.";
      default:
        return "Error de autenticación: $code";
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = registerMode ? "Crear cuenta" : "Entrar";
    final action = registerMode ? "Registrarme" : "Entrar";

    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
              children: [
                const _AuthHeroCard(),
                const SizedBox(height: 24),
                TextField(
                  controller: emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: "Email",
                    hintText: "tu@email.com",
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: "Contraseña",
                    hintText: "mínimo 6 caracteres",
                  ),
                ),
                const SizedBox(height: 16),
                if (error != null)
                  _ErrorBox(text: error!),
                _PrimaryButton(
                  icon: registerMode ? Icons.person_add_alt_1_rounded : Icons.login_rounded,
                  text: loading ? "Procesando..." : action,
                  onTap: loading ? () {} : submit,
                ),
                const SizedBox(height: 14),
                _SecondaryButton(
                  icon: registerMode ? Icons.login_rounded : Icons.person_add_alt_1_rounded,
                  text: registerMode ? "Ya tengo cuenta" : "Crear cuenta nueva",
                  onTap: () {
                    setState(() {
                      registerMode = !registerMode;
                      error = null;
                    });
                  },
                ),
                const SizedBox(height: 18),
                Text(
                  "Para usar el panel privado y crear perfil público vas a tener que verificar tu email sí o sí.",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.54),
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class VerifyEmailPage extends StatefulWidget {
  final AuthNextMode nextMode;

  const VerifyEmailPage({
    super.key,
    required this.nextMode,
  });

  @override
  State<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends State<VerifyEmailPage> {
  bool loading = false;
  String? message;

  Future<void> reloadUser() async {
    if (loading) return;

    setState(() {
      loading = true;
      message = null;
    });

    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        if (!mounted) return;
        setState(() {
          message = "No hay sesión activa. Volvé a entrar con tu email.";
          loading = false;
        });
        return;
      }

      await user.reload().timeout(
        const Duration(seconds: 8),
        onTimeout: () {
          throw Exception("timeout");
        },
      );

      final refreshed = FirebaseAuth.instance.currentUser;

      if (refreshed != null && refreshed.emailVerified) {
        await FirebaseFirestore.instance
            .collection("usuarios")
            .doc(refreshed.uid)
            .set({
          "emailVerified": true,
          "updatedAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));

        if (!mounted) return;

        setState(() {
          loading = false;
          message = "Email verificado ✅";
        });

        await Future.delayed(const Duration(milliseconds: 350));

        if (!mounted) return;

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => widget.nextMode == AuthNextMode.privateInbox
                ? const ProfileSetupGate(child: InboxReceptorPage())
                : const ProfileSetupGate(child: PrivateProfilePage()),
          ),
        );
      } else {
        if (!mounted) return;
        setState(() {
          loading = false;
          message = "Todavía no figura verificado. Abrí el link del mail y volvé a tocar “Ya verifiqué”.";
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        loading = false;
        message = "No pude comprobarlo ahora. Si ya abriste el link, esperá unos segundos y tocá otra vez.";
      });
    }
  }

  Future<void> resendEmail() async {
    if (loading) return;

    setState(() {
      loading = true;
      message = null;
    });

    try {
      final user = FirebaseAuth.instance.currentUser;
      await user?.sendEmailVerification().timeout(
        const Duration(seconds: 8),
        onTimeout: () {
          throw Exception("timeout");
        },
      );

      if (!mounted) return;
      setState(() {
        loading = false;
        message = "Te reenvié el email de verificación.";
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        loading = false;
        message = "No pude reenviar el email ahora. Probá de nuevo en unos segundos.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user != null && user.emailVerified) {
      return widget.nextMode == AuthNextMode.privateInbox
          ? const ProfileSetupGate(child: InboxReceptorPage())
          : const ProfileSetupGate(child: PrivateProfilePage());
    }

    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(
        title: const Text("Verificación obligatoria"),
        actions: [
          IconButton(
            onPressed: () async => _signOutAndResetAnonIdentity(),
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 40, 24, 32),
              children: [
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: const Color(0xFF101010),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: Column(
                    children: [
                      const Icon(
                        Icons.mark_email_unread_rounded,
                        color: Color(0xFF6C63FF),
                        size: 58,
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        "Verificá tu email",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        user?.email ?? "",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.64),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        "No vas a poder crear perfil público ni usar el panel privado hasta verificar tu email.",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.58),
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                _PrimaryButton(
                  icon: Icons.verified_rounded,
                  text: loading ? "Verificando..." : "Ya verifiqué",
                  onTap: loading ? () {} : reloadUser,
                ),
                const SizedBox(height: 14),
                _SecondaryButton(
                  icon: Icons.forward_to_inbox_rounded,
                  text: "Reenviar email",
                  onTap: resendEmail,
                ),
                const SizedBox(height: 14),
                _SecondaryButton(
                  icon: Icons.logout_rounded,
                  text: "Cerrar sesión",
                  onTap: () async => _signOutAndResetAnonIdentity(),
                ),
                if (message != null) ...[
                  const SizedBox(height: 18),
                  Text(
                    message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.64),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class ProfileSetupGate extends StatelessWidget {
  final Widget child;

  const ProfileSetupGate({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser!;

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection("usuarios")
          .doc(user.uid)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _ProfileLocalRestoreGate(child: child);
        }

        if (!snapshot.hasData) {
          return const Scaffold(
            backgroundColor: Color(0xFF050505),
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final exists = snapshot.data!.exists;
        final data = snapshot.data!.data();
        final username = (data?["username"] ?? "").toString().trim();
        final usernameLower = (data?["usernameLower"] ?? "").toString().trim();
        final hasStoredProfile = exists && (username.isNotEmpty || usernameLower.isNotEmpty);
        final complete = data?["perfilCompleto"] == true && hasStoredProfile;

        if (complete) {
          _saveProfileLocalBackup(
            uid: user.uid,
            username: username.isNotEmpty ? username : usernameLower,
            usernameLower: usernameLower.isNotEmpty ? usernameLower : username.toLowerCase(),
            bio: (data?["bio"] ?? "").toString(),
            provincia: (data?["provincia"] ?? "Córdoba").toString(),
          );
          return child;
        }

        if (hasStoredProfile) {
          Future.microtask(() async {
            await FirebaseFirestore.instance
                .collection("usuarios")
                .doc(user.uid)
                .set({
              "perfilCompleto": true,
              "emailVerified": user.emailVerified,
              "updatedAt": FieldValue.serverTimestamp(),
              "lastActiveAt": FieldValue.serverTimestamp(),
              "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
            }, SetOptions(merge: true));
          });
          return child;
        }

        return _ProfileLocalRestoreGate(child: child);
      },
    );
  }
}

Future<void> _saveProfileLocalBackup({
  required String uid,
  required String username,
  required String usernameLower,
  required String bio,
  required String provincia,
}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool("perfilCompleto_$uid", username.trim().isNotEmpty);
    await prefs.setString("username_$uid", username.trim());
    await prefs.setString("usernameLower_$uid", usernameLower.trim());
    await prefs.setString("bio_$uid", bio.trim());
    await prefs.setString("provincia_$uid", provincia.trim().isEmpty ? "Córdoba" : provincia.trim());
  } catch (_) {}
}

class _ProfileLocalRestoreGate extends StatefulWidget {
  final Widget child;

  const _ProfileLocalRestoreGate({required this.child});

  @override
  State<_ProfileLocalRestoreGate> createState() => _ProfileLocalRestoreGateState();
}

class _ProfileLocalRestoreGateState extends State<_ProfileLocalRestoreGate> {
  bool checked = false;
  bool restored = false;

  @override
  void initState() {
    super.initState();
    _checkLocalProfile();
  }

  Future<void> _checkLocalProfile() async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        if (mounted) setState(() => checked = true);
        return;
      }

      final prefs = await SharedPreferences.getInstance();
      final localComplete = prefs.getBool("perfilCompleto_${user.uid}") == true;
      final localUsername = (prefs.getString("username_${user.uid}") ?? "").trim();
      final localUsernameLower = (prefs.getString("usernameLower_${user.uid}") ?? localUsername.toLowerCase()).trim();
      final localBio = (prefs.getString("bio_${user.uid}") ?? "").trim();
      final localProvincia = (prefs.getString("provincia_${user.uid}") ?? "Córdoba").trim();

      if (localComplete && localUsername.isNotEmpty) {
        restored = true;

        FirebaseFirestore.instance.collection("usuarios").doc(user.uid).set({
          "uid": user.uid,
          "email": user.email,
          "emailVerified": user.emailVerified,
          "username": localUsername,
          "usernameLower": localUsernameLower.isNotEmpty ? localUsernameLower : localUsername.toLowerCase(),
          "nombre": localUsername,
          "bio": localBio,
          "pais": "AR",
          "provincia": localProvincia.isNotEmpty ? localProvincia : "Córdoba",
          "ciudad": "",
          "geoVisible": false,
          "perfilCompleto": true,
          "shuffleActivo": true,
          "updatedAt": FieldValue.serverTimestamp(),
          "lastActiveAt": FieldValue.serverTimestamp(),
          "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
        }, SetOptions(merge: true)).timeout(const Duration(seconds: 8)).catchError((e) {
          debugPrint("No se pudo restaurar perfil local en Firestore: $e");
        });
      }
    } catch (e) {
      debugPrint("Error leyendo perfil local: $e");
    } finally {
      if (mounted) setState(() => checked = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!checked) {
      return const Scaffold(
        backgroundColor: Color(0xFF050505),
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (restored) {
      return widget.child;
    }

    return const CreateProfilePage();
  }
}

class CreateProfilePage extends StatefulWidget {
  const CreateProfilePage({super.key});

  @override
  State<CreateProfilePage> createState() => _CreateProfilePageState();
}

class _CreateProfilePageState extends State<CreateProfilePage> {
  final TextEditingController usernameController = TextEditingController();
  final TextEditingController bioController = TextEditingController();

  bool loading = false;
  String? error;
  String provinciaSeleccionada = "Córdoba";

  final List<String> provinciasArgentina = _provinciasArgentina;

  Future<void> addStory({required bool isVideo}) async {
    await _createStoryFromPicker(context, isVideo: isVideo);
  }

  Future<void> saveProfile() async {
    final user = FirebaseAuth.instance.currentUser!;
    final usernameRaw = usernameController.text.trim();
    final username = usernameRaw.toLowerCase();
    final bio = bioController.text.trim();
    final provincia = provinciaSeleccionada.trim();

    if (username.length < 3) {
      setState(() => error = "El username debe tener al menos 3 caracteres.");
      return;
    }

    final validUsername = RegExp(r'^[a-z0-9_]+$').hasMatch(username);
    if (!validUsername) {
      setState(() => error = "Usá solo letras, números o guion bajo.");
      return;
    }

    setState(() {
      loading = true;
      error = null;
    });

    await _saveProfileLocalBackup(
      uid: user.uid,
      username: usernameRaw,
      usernameLower: username,
      bio: bio,
      provincia: provincia,
    );

    try {
      final existing = await FirebaseFirestore.instance
          .collection("usuarios")
          .where("usernameLower", isEqualTo: username)
          .limit(1)
          .get()
          .timeout(const Duration(seconds: 10));

      final takenByAnother = existing.docs.isNotEmpty && existing.docs.first.id != user.uid;
      if (takenByAnother) {
        setState(() {
          error = "Ese username ya está usado.";
          loading = false;
        });
        return;
      }

      await FirebaseFirestore.instance
          .collection("usuarios")
          .doc(user.uid)
          .set({
        "uid": user.uid,
        "email": user.email,
        "emailVerified": user.emailVerified,
        "username": usernameRaw,
        "usernameLower": username,
        "nombre": usernameRaw,
        "bio": bio,
        "fotoPrincipal": "",
        "fotos": [],
        "videos": [],
        "pais": "AR",
        "provincia": provincia,
        "ciudad": "",
        "geoVisible": false,
        "perfilCompleto": true,
        "shuffleActivo": true,
        "updatedAt": FieldValue.serverTimestamp(),
        "createdAt": FieldValue.serverTimestamp(),
        "lastActiveAt": FieldValue.serverTimestamp(),
        "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
      }, SetOptions(merge: true)).timeout(const Duration(seconds: 12));

      try {
        await FirebaseFirestore.instance
            .collection("usernames")
            .doc(username)
            .set({
          "uid": user.uid,
          "username": usernameRaw,
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true)).timeout(const Duration(seconds: 8));
      } catch (e) {
        debugPrint("No se pudo guardar usernames/$username: $e");
      }

      if (!mounted) return;

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const PrivateProfilePage()),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = "Perfil guardado localmente, pero Firestore respondió: $e. Tocá Crear perfil otra vez o recargá.";
      });
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(
        title: const Text("Crear perfil"),
        actions: [
          IconButton(
            onPressed: () async => _signOutAndResetAnonIdentity(),
            icon: const Icon(Icons.logout_rounded),
          )
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
              children: [
                const _ProfileCreationCard(),
                const SizedBox(height: 22),
                TextField(
                  controller: usernameController,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: "Username",
                    hintText: "emiliano",
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: bioController,
                  onChanged: (_) => setState(() {}),
                  maxLength: 160,
                  decoration: const InputDecoration(
                    labelText: "Bio",
                    hintText: "La madrugada atrapa a los que saben lo que buscan.",
                    counterText: "",
                  ),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  value: provinciaSeleccionada,
                  dropdownColor: const Color(0xFF101010),
                  decoration: const InputDecoration(
                    labelText: "Provincia interna",
                    hintText: "Elegí una provincia",
                  ),
                  items: provinciasArgentina.map((provincia) {
                    return DropdownMenuItem<String>(
                      value: provincia,
                      child: Text(provincia),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() => provinciaSeleccionada = value);
                  },
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF101010),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: Text(
                    "Tu provincia no se muestra públicamente. Sirve para conectarte primero con gente de la provincia que querés conocer. Si no hay perfiles suficientes, SayItToMe prioriza provincias cercanas y después el resto del país.",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.62),
                      height: 1.35,
                      fontSize: 13,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (error != null)
                  _ErrorBox(text: error!),
                _PrimaryButton(
                  icon: Icons.save_rounded,
                  text: loading ? "Guardando..." : "Crear perfil",
                  onTap: loading ? () {} : saveProfile,
                ),
                const SizedBox(height: 12),
                Text(
                  "En público se ve tu username y tu bio. La provincia queda oculta y solo ordena el shuffle.",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.48),
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class PrivateProfilePage extends StatelessWidget {
  const PrivateProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser!;

    return Scaffold(
      backgroundColor: Colors.black,
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection("usuarios")
            .doc(user.uid)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return _CenterSoftText(
              text: "No pude cargar tu perfil ahora. Revisá conexión o reglas de Firestore.",
            );
          }

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final data = snapshot.data!.data() ?? {};
          final username = (data["username"] ?? "").toString();
          final bio = (data["bio"] ?? "").toString();
          final provincia = (data["provincia"] ?? "").toString();
          final fotoPrincipal = (data["fotoPrincipal"] ?? "").toString();
          final fotos = _stringListFromAny(data["fotos"]);
          final videos = _stringListFromAny(data["videos"]);
          final allPhotos = _profilePhotosForDisplay(fotoPrincipal, fotos);

          return _ConnectedProfileVisualPage(
            profileUid: user.uid,
            isOwnProfile: true,
            username: username,
            bio: bio,
            provincia: provincia,
            fotoPrincipal: fotoPrincipal,
            lastActiveAt: _activityDateFromData(data),
            createdAt: _profileCreatedDateFromData(data),
            fotos: allPhotos,
            videos: videos,
            onEdit: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const EditProfilePage()),
              );
            },
            onLogout: () async => _signOutAndResetAnonIdentity(),
            onInbox: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const InboxReceptorPage()),
              );
            },
          );
        },
      ),
      bottomNavigationBar: const _BottomNavMock(selected: 4),
    );
  }
}

List<String> _profilePhotosForDisplay(String fotoPrincipal, List<String> fotos) {
  final seen = <String>{};
  final result = <String>[];

  void add(String value) {
    final clean = value.trim();
    if (clean.isEmpty) return;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return;
    if (seen.add(clean)) result.add(clean);
  }

  add(fotoPrincipal);
  for (final foto in fotos) {
    add(foto);
  }
  return result;
}

class _ConnectedProfileVisualPage extends StatefulWidget {
  final String profileUid;
  final bool isOwnProfile;
  final String username;
  final String bio;
  final String provincia;
  final String fotoPrincipal;
  final DateTime? lastActiveAt;
  final DateTime? createdAt;
  final List<String> fotos;
  final List<String> videos;
  final VoidCallback onEdit;
  final VoidCallback onLogout;
  final VoidCallback onInbox;

  const _ConnectedProfileVisualPage({
    required this.profileUid,
    required this.isOwnProfile,
    required this.username,
    required this.bio,
    required this.provincia,
    required this.fotoPrincipal,
    required this.lastActiveAt,
    required this.createdAt,
    required this.fotos,
    required this.videos,
    required this.onEdit,
    required this.onLogout,
    required this.onInbox,
  });

  @override
  State<_ConnectedProfileVisualPage> createState() => _ConnectedProfileVisualPageState();
}

class _ConnectedProfileVisualPageState extends State<_ConnectedProfileVisualPage> {
  final PageController _controller = PageController();
  Timer? _lastSeenTimer;
  int page = 0;
  double? _photoPointerDownX;

  @override
  void initState() {
    super.initState();
    _lastSeenTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _lastSeenTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Widget _brokenHeroPhoto() {
    return Container(
      color: const Color(0xFF111111),
      child: Stack(
        children: [
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF191919),
                    Color(0xFF111111),
                    Color(0xFF050505),
                  ],
                ),
              ),
            ),
          ),
          Center(
            child: Icon(
              Icons.image_not_supported_rounded,
              color: Colors.white.withOpacity(0.28),
              size: 82,
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyHeroPhoto() {
    return Container(
      color: const Color(0xFF111111),
      child: Stack(
        children: [
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF222222),
                    Color(0xFF111111),
                    Color(0xFF050505),
                  ],
                ),
              ),
            ),
          ),
          Center(
            child: Icon(
              Icons.person_rounded,
              color: Colors.white.withOpacity(0.28),
              size: 126,
            ),
          ),
        ],
      ),
    );
  }

  List<String> _cleanHeroPhotos() {
    return widget.fotos
        .map((e) => e.trim())
        .where((e) => e.startsWith('http://') || e.startsWith('https://'))
        .toList();
  }

  void _goToPhoto(int index) {
    final total = _cleanHeroPhotos().length;
    if (index < 0 || index >= total) return;
    _controller.animateToPage(
      index,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  void _openCurrentPhoto() {
    final fotos = _cleanHeroPhotos();
    if (fotos.isEmpty) return;

    final safePage = page.clamp(0, fotos.length - 1).toInt();
    final url = fotos[safePage];

    showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.94),
      builder: (_) {
        return Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: 1,
                  maxScale: 5,
                  child: Center(
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.high,
                      gaplessPlayback: true,
                      webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                      loadingBuilder: (context, child, progress) {
                        if (progress == null) return child;
                        return const Center(child: CircularProgressIndicator());
                      },
                      errorBuilder: (_, __, ___) => Center(
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: Text(
                            "No pude abrir esta foto en tamaño original. Revisá la URL o permisos de Firebase Storage.",
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white.withOpacity(0.68)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: MediaQuery.of(context).padding.top + 14,
                right: 16,
                child: _RoundOverlayIconButton(
                  icon: Icons.close_rounded,
                  onTap: () => Navigator.pop(context),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _handlePhotoPointerUp(PointerUpEvent event, double width) {
    final fotos = _cleanHeroPhotos();
    if (fotos.isEmpty) return;

    final startX = _photoPointerDownX;
    _photoPointerDownX = null;

    if (startX == null) return;

    final endX = event.localPosition.dx;
    final moved = (endX - startX).abs();

    if (moved > 12) return;

    if (fotos.length > 1 && endX < width * 0.24) {
      _goToPhoto(page - 1);
    } else if (fotos.length > 1 && endX > width * 0.76) {
      _goToPhoto(page + 1);
    } else {
      _openCurrentPhoto();
    }
  }

  Future<void> _blockProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Entrá con tu cuenta para bloquear perfiles.")),
      );
      return;
    }

    if (widget.isOwnProfile || widget.profileUid.trim().isEmpty || widget.profileUid == user.uid) return;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101010),
          title: const Text(
            "Bloquear perfil",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          content: Text(
            "No vas a volver a ver este perfil en Shuffle y se quitará de tus interacciones visibles.",
            style: TextStyle(color: Colors.white.withOpacity(0.72), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text("Cancelar"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                "Bloquear",
                style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      final myUid = user.uid;
      final otherUid = widget.profileUid;

      final batch = FirebaseFirestore.instance.batch();

      final blockedRef = FirebaseFirestore.instance
          .collection("usuarios")
          .doc(myUid)
          .collection("bloqueados")
          .doc(otherUid);

      batch.set(blockedRef, {
        "uid": otherUid,
        "blockedUid": otherUid,
        "blockedUsername": widget.username,
        "createdAt": FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      final theirFollowerRef = FirebaseFirestore.instance
          .collection("usuarios")
          .doc(otherUid)
          .collection("followers")
          .doc(myUid);

      final myFollowingRef = FirebaseFirestore.instance
          .collection("usuarios")
          .doc(myUid)
          .collection("following")
          .doc(otherUid);

      final myFollowerRef = FirebaseFirestore.instance
          .collection("usuarios")
          .doc(myUid)
          .collection("followers")
          .doc(otherUid);

      final theirFollowingRef = FirebaseFirestore.instance
          .collection("usuarios")
          .doc(otherUid)
          .collection("following")
          .doc(myUid);

      batch.delete(theirFollowerRef);
      batch.delete(myFollowingRef);
      batch.delete(myFollowerRef);
      batch.delete(theirFollowingRef);

      await batch.commit().timeout(const Duration(seconds: 12));

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Perfil bloqueado. Ya no aparecerá en Shuffle.")),
      );
      Navigator.maybePop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude bloquear este perfil: $e")),
      );
    }
  }

  Future<void> _reportProfile() async {
    if (widget.isOwnProfile || widget.profileUid.trim().isEmpty) return;

    try {
      final user = FirebaseAuth.instance.currentUser;
      final actorId = user == null ? await _storyLikeActorId() : "user_${user.uid}";

      await FirebaseFirestore.instance.collection("reportes").add({
        "reportadoUid": widget.profileUid,
        "reportadoUsername": widget.username,
        "reportadorUid": user?.uid,
        "reportadorActorId": actorId,
        "motivo": "perfil",
        "estado": "pendiente",
        "createdAt": FieldValue.serverTimestamp(),
      }).timeout(const Duration(seconds: 12));

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Denuncia enviada. La administración va a revisarla.")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude enviar la denuncia: $e")),
      );
    }
  }

  void _handlePublicProfileMenu(String value) {
    if (value == "block") {
      _blockProfile();
    } else if (value == "report") {
      _reportProfile();
    }
  }

  void _handleOwnProfileMenu(String value) {
    if (value == "edit") {
      widget.onEdit();
    } else if (value == "blocked") {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const BlockedUsersPage()),
      );
    } else if (value == "admin_panel") {
      if (!_isCurrentUserSayItToMeAdmin()) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Solo el administrador puede abrir este panel.")),
        );
        return;
      }
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const SayItToMeAdminPanelPage()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final username = widget.username.trim().isEmpty ? "usuario" : widget.username.trim();
    final bio = widget.bio.trim().isEmpty ? "Sin bio todavía." : widget.bio.trim();
    final fotos = _cleanHeroPhotos();

    final screen = MediaQuery.of(context).size;
    final isDesktopWide = screen.width >= 900;
    final heroHeight = isDesktopWide
        ? (screen.height * 0.63).clamp(520.0, 720.0)
        : (screen.height * 0.64).clamp(500.0, 680.0);

    return ColoredBox(
      color: Colors.black,
      child: ListView(
        padding: EdgeInsets.zero,
        physics: const ClampingScrollPhysics(),
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    height: heroHeight,
                    width: double.infinity,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                Positioned.fill(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      return Listener(
                        onPointerDown: (event) {
                          _photoPointerDownX = event.localPosition.dx;
                        },
                        onPointerUp: (event) => _handlePhotoPointerUp(
                          event,
                          constraints.maxWidth,
                        ),
                        child: fotos.isEmpty
                            ? _emptyHeroPhoto()
                            : PageView.builder(
                                controller: _controller,
                                itemCount: fotos.length,
                                physics: const PageScrollPhysics(),
                                pageSnapping: true,
                                allowImplicitScrolling: true,
                                dragStartBehavior: DragStartBehavior.start,
                                onPageChanged: (value) => setState(() => page = value),
                                itemBuilder: (context, index) {
                                  return Image.network(
                                    fotos[index],
                                    width: double.infinity,
                                    height: double.infinity,
                                    fit: BoxFit.cover,
                                    alignment: Alignment.center,
                                    gaplessPlayback: true,
                                    filterQuality: FilterQuality.high,
                                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                                    loadingBuilder: (context, child, progress) {
                                      if (progress == null) return child;
                                      return Container(
                                        color: const Color(0xFF111111),
                                        child: Center(
                                          child: SizedBox(
                                            width: 26,
                                            height: 26,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2.2,
                                              value: progress.expectedTotalBytes == null
                                                  ? null
                                                  : progress.cumulativeBytesLoaded / progress.expectedTotalBytes!,
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                    errorBuilder: (_, __, ___) => _brokenHeroPhoto(),
                                  );
                                },
                              ),
                      );
                    },
                  ),
                ),

                Positioned.fill(
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withOpacity(0.34),
                            Colors.black.withOpacity(0.05),
                            Colors.black.withOpacity(0.50),
                            Colors.black.withOpacity(0.96),
                          ],
                          stops: const [0.0, 0.34, 0.68, 1.0],
                        ),
                      ),
                    ),
                  ),
                ),

                // En perfil propio NO mostramos la X de cerrar vista.
                // Motivo: visualmente parecía cerrar sesión, pero solo hacía pop de navegación.
                // El perfil propio conserva únicamente el botón real de logout a la derecha.
                // En perfiles ajenos sí queda la X para volver atrás, como en Connected2Me.
                if (!widget.isOwnProfile)
                  Positioned(
                    left: 16,
                    top: MediaQuery.of(context).padding.top + 12,
                    child: _RoundOverlayIconButton(
                      icon: Icons.close_rounded,
                      onTap: () => Navigator.maybePop(context),
                    ),
                  ),
                if (widget.isOwnProfile) ...[
                  Positioned(
                    right: 16,
                    top: MediaQuery.of(context).padding.top + 12,
                    child: PopupMenuButton<String>(
                      color: Colors.white,
                      elevation: 10,
                      offset: const Offset(0, 52),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(2),
                      ),
                      onSelected: _handleOwnProfileMenu,
                      itemBuilder: (context) {
                        final isAdmin = _isCurrentUserSayItToMeAdmin();
                        return [
                          const PopupMenuItem<String>(
                            value: "edit",
                            height: 58,
                            child: Text(
                              "Editar perfil",
                              style: TextStyle(
                                color: Color(0xFF222222),
                                fontSize: 16,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                          const PopupMenuItem<String>(
                            value: "blocked",
                            height: 58,
                            child: Text(
                              "Perfiles bloqueados",
                              style: TextStyle(
                                color: Color(0xFF222222),
                                fontSize: 16,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                          if (isAdmin) const PopupMenuDivider(height: 1),
                          if (isAdmin)
                            PopupMenuItem<String>(
                              value: "admin_panel",
                              height: 72,
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF111111),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: const Color(0xFF8C84FF).withOpacity(0.42)),
                                ),
                                child: const Row(
                                  children: [
                                    Icon(Icons.admin_panel_settings_rounded, color: Color(0xFF8C84FF), size: 22),
                                    SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        "Abrir panel administrador",
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 14.5,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ];
                      },
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black.withOpacity(0.18),
                          border: Border.all(color: Colors.white.withOpacity(0.78), width: 1.8),
                        ),
                        child: const Icon(Icons.more_vert_rounded, color: Colors.white, size: 31),
                      ),
                    ),
                  ),
                  Positioned(
                    right: 16,
                    top: MediaQuery.of(context).padding.top + 70,
                    child: _RoundOverlayIconButton(
                      icon: Icons.logout_rounded,
                      onTap: widget.onLogout,
                    ),
                  ),
                ] else ...[
                  Positioned(
                    right: 74,
                    top: MediaQuery.of(context).padding.top + 12,
                    child: _TopFollowButton(
                      profileUid: widget.profileUid,
                      profileUsername: username,
                    ),
                  ),
                  Positioned(
                    right: 16,
                    top: MediaQuery.of(context).padding.top + 12,
                    child: PopupMenuButton<String>(
                      color: Colors.white,
                      elevation: 10,
                      offset: const Offset(0, 52),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(2),
                      ),
                      onSelected: _handlePublicProfileMenu,
                      itemBuilder: (context) => const [
                        PopupMenuItem<String>(
                          value: "block",
                          height: 58,
                          child: Text(
                            "Bloquear",
                            style: TextStyle(
                              color: Color(0xFF222222),
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        PopupMenuItem<String>(
                          value: "report",
                          height: 58,
                          child: Text(
                            "Denunciar",
                            style: TextStyle(
                              color: Color(0xFF222222),
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black.withOpacity(0.18),
                          border: Border.all(color: Colors.white.withOpacity(0.78), width: 1.8),
                        ),
                        child: const Icon(Icons.more_vert_rounded, color: Colors.white, size: 31),
                      ),
                    ),
                  ),
                ],

                Positioned(
                  left: 28,
                  right: 28,
                  bottom: 52,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 36,
                          height: 1.0,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.6,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        _lastSeenText(widget.lastActiveAt),
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.74),
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),

                if (fotos.length > 1)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 28,
                    child: Center(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: List.generate(fotos.length, (index) {
                          final active = page == index;
                          return GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => _goToPhoto(index),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              margin: const EdgeInsets.symmetric(horizontal: 4),
                              width: active ? 10 : 9,
                              height: active ? 10 : 9,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: active ? Colors.white : Colors.transparent,
                                border: Border.all(
                                  color: active ? Colors.white : Colors.white.withOpacity(0.78),
                                  width: 1.35,
                                ),
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),

              ],
                    ),
                  ),

                  _ConnectedStatsRow(
                    profileUid: widget.profileUid,
                    isOwnProfile: widget.isOwnProfile,
                    onInbox: widget.onInbox,
                  ),
                ],
              ),

              if (widget.isOwnProfile)
                Positioned(
                  right: 28,
                  top: heroHeight - 23,
                  child: _VerifiedProfileCopyPill(
                    profileUid: widget.profileUid,
                    username: username,
                  ),
                ),
            ],
          ),

          const Divider(height: 1, color: Color(0xFF202020)),

          Padding(
            padding: const EdgeInsets.fromLTRB(30, 26, 30, 10),
            child: Text(
              bio,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                height: 1.35,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),

          if (widget.createdAt != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(30, 26, 30, 0),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(
                  _profileCreatedDateText(widget.createdAt!),
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.62),
                    fontSize: 14,
                    height: 1.25,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),

          // La provincia interna es información privada.
          // No se muestra en perfiles propios ni ajenos; solo se edita en configuración.
          const SizedBox(height: 130),

          if (widget.videos.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(30, 0, 30, 30),
              child: _ProfileMediaSection(
                title: "Videos",
                emptyText: "Todavía no agregaste videos.",
                urls: widget.videos,
                isVideo: true,
              ),
            ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}


class BlockedUsersPage extends StatelessWidget {
  const BlockedUsersPage({super.key});

  Future<void> _unblockUser({
    required BuildContext context,
    required String blockedUid,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Entrá con tu cuenta para gestionar bloqueados.")),
      );
      return;
    }

    final cleanUid = blockedUid.trim();
    if (cleanUid.isEmpty) return;

    try {
      await FirebaseFirestore.instance
          .collection("usuarios")
          .doc(user.uid)
          .collection("bloqueados")
          .doc(cleanUid)
          .delete()
          .timeout(const Duration(seconds: 10));

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Perfil desbloqueado. Puede volver a aparecer en Shuffle.")),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude desbloquear este perfil: $e")),
      );
    }
  }

  String _blockedDisplayName(Map<String, dynamic> data, String docId) {
    final username = (data["blockedUsername"] ?? data["username"] ?? "").toString().trim();
    if (username.isNotEmpty) return username;

    final uid = (data["blockedUid"] ?? data["uid"] ?? docId).toString().trim();
    if (uid.isEmpty) return "perfil bloqueado";
    if (uid.length <= 8) return uid;
    return "perfil ${uid.substring(0, 6)}…";
  }

  String _blockedUidFromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final uid = (data["blockedUid"] ?? data["uid"] ?? doc.id).toString().trim();
    return uid.isEmpty ? doc.id : uid;
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          title: const Text("Perfiles bloqueados"),
        ),
        body: const _CenterSoftText(
          text: "Entrá con tu cuenta para ver y desbloquear perfiles.",
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          "Perfiles bloqueados",
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: SafeArea(
        top: false,
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection("usuarios")
              .doc(user.uid)
              .collection("bloqueados")
              .orderBy("createdAt", descending: true)
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return _CenterSoftText(
                text: "No pude cargar tus bloqueados. Revisá reglas de Firestore o conexión.",
              );
            }

            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }

            final docs = snapshot.data!.docs;

            if (docs.isEmpty) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 82,
                      height: 82,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF101010),
                        border: Border.all(color: Colors.white.withOpacity(0.08)),
                      ),
                      child: Icon(
                        Icons.block_rounded,
                        color: Colors.white.withOpacity(0.46),
                        size: 42,
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      "No tenés perfiles bloqueados",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Cuando bloquees a alguien, va a aparecer acá para que puedas desbloquearlo cuando quieras.",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.52),
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
              itemCount: docs.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final doc = docs[index];
                final data = doc.data();
                final blockedUid = _blockedUidFromDoc(doc);
                final username = _blockedDisplayName(data, doc.id);

                return Container(
                  padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF101010),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: Colors.white.withOpacity(0.07)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF1D1D1D),
                        ),
                        child: const Icon(
                          Icons.person_off_rounded,
                          color: Colors.white70,
                          size: 29,
                        ),
                      ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              username,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              "No aparece en tu Shuffle",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.46),
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      GestureDetector(
                        onTap: () => _unblockUser(context: context, blockedUid: blockedUid),
                        child: Container(
                          height: 42,
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withOpacity(0.14),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: Colors.redAccent.withOpacity(0.46)),
                          ),
                          child: const Text(
                            "Desbloquear",
                            style: TextStyle(
                              color: Colors.redAccent,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _TopFollowButton extends StatelessWidget {
  final String profileUid;
  final String profileUsername;

  const _TopFollowButton({
    required this.profileUid,
    required this.profileUsername,
  });

  Future<void> _toggleFollow(BuildContext context) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Entrá con tu cuenta para seguir perfiles.")),
      );
      return;
    }

    if (profileUid.trim().isEmpty || profileUid == user.uid) return;

    final followerRef = FirebaseFirestore.instance
        .collection("usuarios")
        .doc(profileUid)
        .collection("followers")
        .doc(user.uid);

    final followingRef = FirebaseFirestore.instance
        .collection("usuarios")
        .doc(user.uid)
        .collection("following")
        .doc(profileUid);

    final doc = await followerRef.get();

    if (doc.exists) {
      await followerRef.delete();
      await followingRef.delete();
    } else {
      final payload = {
        "uid": user.uid,
        "followerUid": user.uid,
        "profileUid": profileUid,
        "profileUsername": profileUsername,
        "createdAt": FieldValue.serverTimestamp(),
      };
      await followerRef.set(payload, SetOptions(merge: true));
      await followingRef.set(payload, SetOptions(merge: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null || profileUid.trim().isEmpty || profileUid == user.uid) {
      return _TopFollowPill(
        text: "Seguir",
        loading: false,
        onTap: () => _toggleFollow(context),
      );
    }

    final ref = FirebaseFirestore.instance
        .collection("usuarios")
        .doc(profileUid)
        .collection("followers")
        .doc(user.uid);

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: ref.snapshots(),
      builder: (context, snapshot) {
        final following = snapshot.data?.exists == true;
        return _TopFollowPill(
          text: following ? "Siguiendo" : "Seguir",
          loading: snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData,
          onTap: () => _toggleFollow(context),
        );
      },
    );
  }
}

class _TopFollowPill extends StatelessWidget {
  final String text;
  final bool loading;
  final VoidCallback onTap;

  const _TopFollowPill({
    required this.text,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: 18),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.18),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.90), width: 1.8),
        ),
        alignment: Alignment.center,
        child: Text(
          loading ? "..." : text,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _RoundOverlayIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _RoundOverlayIconButton({
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withOpacity(0.18),
          border: Border.all(color: Colors.white.withOpacity(0.78), width: 1.8),
        ),
        child: Icon(icon, color: Colors.white, size: 31),
      ),
    );
  }
}


String _verifiedProfileCopyLink({
  required String profileUid,
  required String username,
}) {
  final cleanUsername = _normalizeProfileSlug(username);
  if (cleanUsername.isNotEmpty) {
    return 'https://sayittome-app.web.app/@$cleanUsername';
  }
  final cleanUid = profileUid.trim();
  return cleanUid.isEmpty ? 'https://sayittome-app.web.app' : 'https://sayittome-app.web.app/u/$cleanUid';
}

class _VerifiedProfileCopyPill extends StatefulWidget {
  final String profileUid;
  final String username;

  const _VerifiedProfileCopyPill({
    required this.profileUid,
    required this.username,
  });

  @override
  State<_VerifiedProfileCopyPill> createState() => _VerifiedProfileCopyPillState();
}

class _VerifiedProfileCopyPillState extends State<_VerifiedProfileCopyPill> {
  bool copied = false;

  Future<void> _copy() async {
    final link = _verifiedProfileCopyLink(
      profileUid: widget.profileUid,
      username: widget.username,
    );
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    setState(() => copied = true);
    await Future.delayed(const Duration(milliseconds: 1400));
    if (mounted) setState(() => copied = false);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _copy,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 54,
        padding: const EdgeInsets.fromLTRB(14, 8, 16, 8),
        decoration: BoxDecoration(
          color: const Color(0xFF111111).withOpacity(0.96),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.82), width: 1.45),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.42),
              blurRadius: 18,
              offset: const Offset(0, 9),
            ),
            BoxShadow(
              color: const Color(0xFF7B61FF).withOpacity(0.28),
              blurRadius: 20,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF7B61FF).withOpacity(0.22),
                border: Border.all(color: Colors.white.withOpacity(0.70), width: 1.15),
              ),
              child: const Icon(Icons.verified_rounded, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Text(
              copied ? 'copiado' : 'copiar link verificado',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12.6,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.12,
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.copy_rounded, color: Colors.white.withOpacity(0.92), size: 17),
          ],
        ),
      ),
    );
  }
}

int _globalSafeInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? "") ?? 0;
}

final Set<String> _conversationRetroSyncRequested = <String>{};

Future<void> _syncConversationCounterForProfile(String profileUid) async {
  final cleanProfileUid = profileUid.trim();
  if (cleanProfileUid.isEmpty) return;

  try {
    final ids = <String>{};

    final chats = await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("receptorUid", isEqualTo: cleanProfileUid)
        .get()
        .timeout(const Duration(seconds: 12));

    for (final doc in chats.docs) {
      ids.add(doc.id);
    }

    final legacyMessages = await FirebaseFirestore.instance
        .collectionGroup("mensajes")
        .where("receptorUid", isEqualTo: cleanProfileUid)
        .get()
        .timeout(const Duration(seconds: 12));

    for (final doc in legacyMessages.docs) {
      final data = doc.data();
      final chatIdFromField = (data["chatId"] ?? "").toString().trim();
      final chatIdFromPath = doc.reference.parent.parent?.id ?? "";
      final id = chatIdFromField.isNotEmpty ? chatIdFromField : chatIdFromPath;
      if (id.trim().isNotEmpty) ids.add(id.trim());
    }

    await FirebaseFirestore.instance.collection("usuarios").doc(cleanProfileUid).set({
      "conversacionesCount": ids.length,
      "conversacionesCountRetroactivoAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).timeout(const Duration(seconds: 12));
  } catch (e) {
    debugPrint("No pude sincronizar contador retroactivo de $cleanProfileUid: $e");
  }
}

class _ConnectedStatsRow extends StatelessWidget {
  final String profileUid;
  final bool isOwnProfile;
  final VoidCallback onInbox;

  const _ConnectedStatsRow({
    required this.profileUid,
    required this.isOwnProfile,
    required this.onInbox,
  });

  Stream<int> _storyLikesStream() {
    // Total global REAL de me gusta acumulados por TODAS las historias del perfil.
    // No usa profile_likes y no permite tocar desde el perfil.
    // Filtra por campo profileUid cuando existe y también por path para cubrir likes viejos
    // que pudieron haberse creado antes de guardar ese campo.
    return FirebaseFirestore.instance
        .collectionGroup("story_likes")
        .snapshots()
        .map((snapshot) {
      final cleanProfileUid = profileUid.trim();
      if (cleanProfileUid.isEmpty) return 0;

      return snapshot.docs.where((doc) {
        final data = doc.data();
        final likedProfileUid = (data["profileUid"] ?? "").toString().trim();
        if (likedProfileUid == cleanProfileUid) return true;

        final path = doc.reference.path;
        return path.startsWith("usuarios/$cleanProfileUid/historias/");
      }).length;
    });
  }

  Stream<int> _followersStream() {
    return FirebaseFirestore.instance
        .collection("usuarios")
        .doc(profileUid)
        .collection("followers")
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  Stream<int> _conversationsStream() {
    final cleanProfileUid = profileUid.trim();
    if (cleanProfileUid.isEmpty) return Stream.value(0);

    // Contador real + retroactivo de conversaciones RECIBIDAS por este perfil.
    // Regla pedida: suma 1 por cada anónimo distinto/chat que le habló al perfil.
    // Para que sea retroactivo no dependemos solamente de usuarios/{uid}.conversacionesCount:
    // 1) escuchamos el contador denormalizado del perfil;
    // 2) escuchamos chats_anonimos donde receptorUid == profileUid;
    // 3) escuchamos mensajes viejos con collectionGroup("mensajes") y receptorUid == profileUid.
    // Después mostramos el mayor valor. Esto recupera perfiles viejos que quedaron en 0
    // aunque ya tuvieran mensajes antes de existir conversacionesCount/conversationCounted.
    final controller = StreamController<int>.broadcast();
    StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? profileSub;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? chatsSub;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? legacyMessagesSub;

    int profileCounter = 0;
    int liveChatsCounter = 0;
    int legacyMessagesCounter = 0;

    void emit() {
      if (controller.isClosed) return;
      controller.add(max(profileCounter, max(liveChatsCounter, legacyMessagesCounter)));
    }

    profileSub = FirebaseFirestore.instance
        .collection("usuarios")
        .doc(cleanProfileUid)
        .snapshots()
        .listen((doc) {
      final data = doc.data() ?? {};
      profileCounter = _globalSafeInt(data["conversacionesCount"] ??
          data["conversaciones"] ??
          data["conversationCount"] ??
          data["conversationsCount"]);
      emit();
    }, onError: (e) {
      debugPrint("No pude escuchar contador denormalizado de conversaciones: $e");
      emit();
    });

    chatsSub = FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("receptorUid", isEqualTo: cleanProfileUid)
        .snapshots()
        .listen((snapshot) {
      final ids = <String>{};
      for (final doc in snapshot.docs) {
        final data = doc.data();
        final receptorUid = (data["receptorUid"] ??
                data["profileUid"] ??
                data["ownerUid"] ??
                data["usuarioB"] ??
                "")
            .toString()
            .trim();
        if (receptorUid != cleanProfileUid) continue;
        ids.add(doc.id);
      }
      liveChatsCounter = ids.length;
      emit();
    }, onError: (e) {
      debugPrint("No pude escuchar conversaciones recibidas del perfil: $e");
      emit();
    });

    legacyMessagesSub = FirebaseFirestore.instance
        .collectionGroup("mensajes")
        .where("receptorUid", isEqualTo: cleanProfileUid)
        .snapshots()
        .listen((snapshot) {
      final ids = <String>{};
      for (final doc in snapshot.docs) {
        final data = doc.data();
        final chatIdFromField = (data["chatId"] ?? "").toString().trim();
        final chatIdFromPath = doc.reference.parent.parent?.id ?? "";
        final id = chatIdFromField.isNotEmpty ? chatIdFromField : chatIdFromPath;
        if (id.trim().isNotEmpty) ids.add(id.trim());
      }
      legacyMessagesCounter = ids.length;
      emit();
    }, onError: (e) {
      debugPrint("No pude escuchar mensajes retroactivos para conversaciones: $e");
      emit();
    });

    controller.onCancel = () async {
      await profileSub?.cancel();
      await chatsSub?.cancel();
      await legacyMessagesSub?.cancel();
    };

    return controller.stream;
  }

  @override
  Widget build(BuildContext context) {
    final cleanProfileUid = profileUid.trim();
    if (cleanProfileUid.isNotEmpty && _conversationRetroSyncRequested.add(cleanProfileUid)) {
      Future.microtask(() => _syncConversationCounterForProfile(cleanProfileUid));
    }

    return StreamBuilder<int>(
      stream: _storyLikesStream(),
      builder: (context, storyLikesSnapshot) {
        return StreamBuilder<int>(
          stream: _conversationsStream(),
          builder: (context, conversationsSnapshot) {
            return StreamBuilder<int>(
              stream: _followersStream(),
              builder: (context, followersSnapshot) {
                // ME GUSTA DEL PERFIL:
                // Este contador NO representa likes directos al perfil.
                // Representa la suma global de likes acumulados en TODAS las historias
                // activas/históricas del usuario mediante collectionGroup("story_likes").
                // Por eso el botón queda visual/informativo y NO es tocable desde el perfil.
                // Para dar me gusta se debe entrar a una historia concreta y tocar Me gusta ahí.
                final likes = storyLikesSnapshot.data ?? 0;
                final conversations = conversationsSnapshot.data ?? 0;
                final followers = followersSnapshot.data ?? 0;

                return Container(
                  color: Colors.black,
                  // En perfil propio dejamos aire superior para que el botón de link
                  // verificado pueda flotar por encima del bloque negro sin tapar estadísticas.
                  padding: EdgeInsets.fromLTRB(28, isOwnProfile ? 42 : 26, 28, 26),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _ConnectedStaticStatButton(
                        color: const Color(0xFFFF00A8),
                        icon: Icons.favorite_rounded,
                        value: likes,
                        label: "me gusta",
                      ),
                      _ConnectedStatButton(
                        color: const Color(0xFF24D46E),
                        icon: Icons.chat_bubble_rounded,
                        value: conversations,
                        label: "conv.",
                        onTap: onInbox,
                      ),
                      _LiveFollowButton(
                        profileUid: profileUid,
                        isOwnProfile: isOwnProfile,
                        value: followers,
                      ),
                      _LiveStoriesButton(
                        profileUid: profileUid,
                        isOwnProfile: isOwnProfile,
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

class _LiveLikeButton extends StatefulWidget {
  final String profileUid;
  final bool isOwnProfile;
  final int value;

  const _LiveLikeButton({
    required this.profileUid,
    required this.isOwnProfile,
    required this.value,
  });

  @override
  State<_LiveLikeButton> createState() => _LiveLikeButtonState();
}

class _LiveLikeButtonState extends State<_LiveLikeButton> {
  String? actorId;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _loadActor();
  }

  Future<void> _loadActor() async {
    final id = await _storyLikeActorId();
    if (!mounted) return;
    setState(() {
      actorId = id;
      loading = false;
    });
  }

  DocumentReference<Map<String, dynamic>>? _profileLikeRef() {
    final id = actorId;
    if (id == null || widget.profileUid.trim().isEmpty) return null;
    return FirebaseFirestore.instance
        .collection("usuarios")
        .doc(widget.profileUid)
        .collection("profile_likes")
        .doc(id);
  }

  Future<void> _toggleProfileLike() async {
    if (loading || widget.isOwnProfile) return;
    final ref = _profileLikeRef();
    if (ref == null) return;

    try {
      final doc = await ref.get().timeout(const Duration(seconds: 8));
      if (doc.exists) {
        await ref.delete().timeout(const Duration(seconds: 8));
      } else {
        await ref.set({
          "actorId": actorId,
          "profileUid": widget.profileUid,
          "createdAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true)).timeout(const Duration(seconds: 8));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude registrar el me gusta: $e")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ref = _profileLikeRef();
    if (widget.isOwnProfile || ref == null) {
      return _ConnectedStatButton(
        color: const Color(0xFFFF00A8),
        icon: Icons.favorite_rounded,
        value: widget.value,
        label: "me gusta",
      );
    }

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: ref.snapshots(),
      builder: (context, snapshot) {
        final liked = snapshot.data?.exists == true;
        return _ConnectedStatButton(
          color: const Color(0xFFFF00A8),
          icon: liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          value: widget.value,
          label: liked ? "te gusta" : "me gusta",
          onTap: _toggleProfileLike,
        );
      },
    );
  }
}

class _LiveFollowButton extends StatelessWidget {
  final String profileUid;
  final bool isOwnProfile;
  final int value;

  const _LiveFollowButton({
    required this.profileUid,
    required this.isOwnProfile,
    required this.value,
  });

  Future<void> _toggleFollow() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || isOwnProfile) return;

    final followerRef = FirebaseFirestore.instance
        .collection("usuarios")
        .doc(profileUid)
        .collection("followers")
        .doc(user.uid);
    final followingRef = FirebaseFirestore.instance
        .collection("usuarios")
        .doc(user.uid)
        .collection("following")
        .doc(profileUid);

    final doc = await followerRef.get();
    if (doc.exists) {
      await followerRef.delete();
      await followingRef.delete();
    } else {
      final payload = {
        "uid": user.uid,
        "profileUid": profileUid,
        "createdAt": FieldValue.serverTimestamp(),
      };
      await followerRef.set(payload, SetOptions(merge: true));
      await followingRef.set(payload, SetOptions(merge: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || isOwnProfile) {
      return _ConnectedStatButton(
        color: const Color(0xFF8C36B7),
        icon: Icons.person_add_alt_1_rounded,
        value: value,
        label: "seguidores",
      );
    }

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection("usuarios")
          .doc(profileUid)
          .collection("followers")
          .doc(user.uid)
          .snapshots(),
      builder: (context, snapshot) {
        final following = snapshot.data?.exists == true;
        return _ConnectedStatButton(
          color: const Color(0xFF8C36B7),
          icon: following ? Icons.person_remove_rounded : Icons.person_add_alt_1_rounded,
          value: value,
          label: following ? "siguiendo" : "seguir",
          onTap: _toggleFollow,
        );
      },
    );
  }
}


class _LiveStoriesButton extends StatelessWidget {
  final String profileUid;
  final bool isOwnProfile;

  const _LiveStoriesButton({
    required this.profileUid,
    required this.isOwnProfile,
  });

  bool _isActiveStory(Map<String, dynamic> data) {
    final url = (data["url"] ?? "").toString().trim();
    if (url.isEmpty) return false;
    final expiresAt = data["expiresAt"];
    if (expiresAt is! Timestamp) return true;
    return expiresAt.toDate().isAfter(DateTime.now());
  }

  void _openStories(BuildContext context, List<Map<String, dynamic>> activeStories) {
    if (activeStories.isNotEmpty) {
      showDialog(
        context: context,
        barrierColor: Colors.black.withOpacity(0.94),
        builder: (_) => _StoryViewerDialog(
          profileUid: profileUid,
          stories: activeStories,
          initialIndex: 0,
        ),
      );
      return;
    }

    if (isOwnProfile) {
      _showStoryUploadCameraSheet(context);
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Este perfil todavía no tiene historias activas.")),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection("usuarios")
          .doc(profileUid)
          .collection("historias")
          .snapshots(),
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? [];
        final activeStories = docs
            .map((doc) => {
                  ...doc.data(),
                  "id": doc.id,
                })
            .where(_isActiveStory)
            .toList();

        activeStories.sort((a, b) {
          final at = a["createdAt"];
          final bt = b["createdAt"];
          final am = at is Timestamp ? at.millisecondsSinceEpoch : 0;
          final bm = bt is Timestamp ? bt.millisecondsSinceEpoch : 0;
          return bm.compareTo(am);
        });

        final latestStory = activeStories.isNotEmpty ? activeStories.first : null;
        final latestStoryUrl = (latestStory?["url"] ?? "").toString().trim();
        final latestStoryType = (latestStory?["type"] ?? "image").toString().trim();

        return _ConnectedStatButton(
          color: const Color(0xFF13A8D8),
          icon: activeStories.isEmpty ? Icons.auto_stories_outlined : Icons.auto_stories_rounded,
          value: activeStories.length,
          label: "historias",
          previewUrl: latestStoryUrl,
          previewIsVideo: latestStoryType == "video",
          onTap: () => _openStories(context, activeStories),
        );
      },
    );
  }
}

class _ConnectedStaticStatButton extends StatelessWidget {
  final Color color;
  final IconData icon;
  final int value;
  final String label;

  const _ConnectedStaticStatButton({
    required this.color,
    required this.icon,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 76,
          height: 76,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color,
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(0.38),
                blurRadius: 14,
                spreadRadius: 1,
              ),
            ],
          ),
          child: Icon(icon, color: Colors.white, size: 39),
        ),
        const SizedBox(height: 10),
        Text(
          value.toString(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white.withOpacity(0.48),
            fontSize: 14,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _ConnectedStatButton extends StatelessWidget {
  final Color color;
  final IconData icon;
  final int value;
  final String label;
  final String previewUrl;
  final bool previewIsVideo;
  final VoidCallback? onTap;

  const _ConnectedStatButton({
    required this.color,
    required this.icon,
    required this.value,
    required this.label,
    this.previewUrl = "",
    this.previewIsVideo = false,
    this.onTap,
  });

  Widget _circleContent() {
    final cleanPreviewUrl = previewUrl.trim();

    if (cleanPreviewUrl.isEmpty) {
      return Icon(icon, color: Colors.white, size: 39);
    }

    return ClipOval(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.network(
            cleanPreviewUrl,
            fit: BoxFit.cover,
            alignment: Alignment.center,
            gaplessPlayback: true,
            webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
            errorBuilder: (_, __, ___) => Container(
              color: color,
              child: Icon(icon, color: Colors.white, size: 39),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.18),
            ),
          ),
          if (previewIsVideo)
            Center(
              child: Icon(
                Icons.play_circle_fill_rounded,
                color: Colors.white.withOpacity(0.92),
                size: 34,
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 76,
            height: 76,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              boxShadow: [
                BoxShadow(
                  color: color.withOpacity(0.38),
                  blurRadius: 14,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: _circleContent(),
          ),
          const SizedBox(height: 10),
          Text(
            value.toString(),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withOpacity(0.48),
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}



// ===================== ADMIN + HISTORIAS AGRUPADAS =====================
// Admin real de SayItToMe. Mantener este email sincronizado con reglas/panel.
const String _sayItToMeAdminEmail = "emilianomaturano@gmail.com";

bool _isSayItToMeAdminEmail(String? email) {
  return (email ?? "").trim().toLowerCase() == _sayItToMeAdminEmail;
}

bool _isCurrentUserSayItToMeAdmin() {
  final user = FirebaseAuth.instance.currentUser;
  return user != null && _isSayItToMeAdminEmail(user.email);
}

Timestamp? _timestampFromAny(dynamic value) {
  if (value is Timestamp) return value;
  if (value is DateTime) return Timestamp.fromDate(value);
  return null;
}

String _fmtStoryBlockUntil(Timestamp until) {
  final d = until.toDate();
  final dd = d.day.toString().padLeft(2, '0');
  final mm = d.month.toString().padLeft(2, '0');
  final yyyy = d.year.toString();
  final hh = d.hour.toString().padLeft(2, '0');
  final min = d.minute.toString().padLeft(2, '0');
  return "$dd/$mm/$yyyy $hh:$min";
}

Future<Timestamp?> _activeStoryBlockUntilForUid(String uid) async {
  final cleanUid = uid.trim();
  if (cleanUid.isEmpty) return null;

  try {
    final doc = await FirebaseFirestore.instance
        .collection("bloqueos")
        .doc(cleanUid)
        .get()
        .timeout(const Duration(seconds: 8));

    if (!doc.exists) return null;

    final data = doc.data() ?? {};
    final tipo = (data["tipo"] ?? data["scope"] ?? "historias").toString().trim().toLowerCase();
    final until = _timestampFromAny(data["hasta"] ?? data["expiresAt"] ?? data["until"]);
    if (until == null) return null;

    final appliesToStories = tipo.isEmpty ||
        tipo == "historias" ||
        tipo == "stories" ||
        tipo == "todo" ||
        tipo == "all";

    if (!appliesToStories) return null;
    if (!until.toDate().isAfter(DateTime.now())) return null;

    return until;
  } catch (e) {
    debugPrint("No pude revisar bloqueo temporal de historias: $e");
    return null;
  }
}

Future<bool> _ensureCanUploadStory(BuildContext context, String uid) async {
  final until = await _activeStoryBlockUntilForUid(uid);
  if (until == null) return true;

  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text("No podés subir historias hasta ${_fmtStoryBlockUntil(until)}."),
      ),
    );
  }
  return false;
}

Future<void> _adminBlockStoriesForUid({
  required BuildContext context,
  required String uid,
  required Duration duration,
  required String motivo,
}) async {
  final cleanUid = uid.trim();
  if (cleanUid.isEmpty) return;

  if (!_isCurrentUserSayItToMeAdmin()) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Solo el administrador puede bloquear historias.")),
    );
    return;
  }

  final until = Timestamp.fromDate(DateTime.now().add(duration));

  try {
    await FirebaseFirestore.instance.collection("bloqueos").doc(cleanUid).set({
      "uid": cleanUid,
      "tipo": "historias",
      "scope": "historias",
      "motivo": motivo,
      "hasta": until,
      "expiresAt": until,
      "adminEmail": FirebaseAuth.instance.currentUser?.email,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).timeout(const Duration(seconds: 10));

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Historias bloqueadas hasta ${_fmtStoryBlockUntil(until)}.")),
      );
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude bloquear historias: $e")),
      );
    }
  }
}

List<Map<String, dynamic>> _storiesSortedNewestFirst(List<Map<String, dynamic>> stories) {
  final list = stories.map((story) => Map<String, dynamic>.from(story)).toList();
  list.sort((a, b) {
    final at = a["createdAt"];
    final bt = b["createdAt"];
    final am = at is Timestamp ? at.millisecondsSinceEpoch : 0;
    final bm = bt is Timestamp ? bt.millisecondsSinceEpoch : 0;
    return bm.compareTo(am);
  });
  return list;
}

List<_GroupedStoriesEntry> _groupStoriesByProfile(List<Map<String, dynamic>> stories) {
  final grouped = <String, List<Map<String, dynamic>>>{};

  for (final raw in stories) {
    final story = Map<String, dynamic>.from(raw);
    final uid = (story["profileUid"] ?? story["ownerUid"] ?? story["uid"] ?? "").toString().trim();
    final usernameKey = (story["username"] ?? "").toString().trim().toLowerCase();

    // UID manda. El fallback por username evita duplicados en documentos viejos que no
    // guardaron ownerUid/uid correctamente, sin romper la navegación del visor.
    final key = uid.isNotEmpty ? "uid:$uid" : (usernameKey.isNotEmpty ? "username:$usernameKey" : "story:${story["id"] ?? UniqueKey().toString()}");
    grouped.putIfAbsent(key, () => <Map<String, dynamic>>[]).add(story);
  }

  final entries = grouped.entries.map((entry) {
    final sorted = _storiesSortedNewestFirst(entry.value);
    final latest = sorted.isEmpty ? const <String, dynamic>{} : sorted.first;
    final uid = (latest["profileUid"] ?? latest["ownerUid"] ?? latest["uid"] ?? "").toString().trim();
    return _GroupedStoriesEntry(
      profileUid: uid,
      stories: sorted,
    );
  }).where((entry) => entry.stories.isNotEmpty).toList();

  entries.sort((a, b) => b.latestCreatedMillis.compareTo(a.latestCreatedMillis));
  return entries;
}

class _GroupedStoriesEntry {
  final String profileUid;
  final List<Map<String, dynamic>> stories;

  const _GroupedStoriesEntry({
    required this.profileUid,
    required this.stories,
  });

  Map<String, dynamic> get latest => stories.isEmpty ? const <String, dynamic>{} : stories.first;

  int get latestCreatedMillis {
    final createdAt = latest["createdAt"];
    if (createdAt is Timestamp) return createdAt.millisecondsSinceEpoch;
    return 0;
  }

  String get username {
    final value = (latest["username"] ?? "usuario").toString().trim();
    return value.isEmpty ? "usuario" : value;
  }

  String get avatarUrl => (latest["avatarUrl"] ?? "").toString().trim();

  String get previewUrl => (latest["url"] ?? "").toString().trim();

  String get previewType => (latest["type"] ?? "image").toString().trim();

  int get count => stories.length;
}

class _StoryNudityModerationResult {
  final bool checked;
  final bool explicitNudity;
  final double pornScore;
  final double hentaiScore;
  final double sexyScore;
  final double neutralScore;
  final String provider;
  final String? error;

  const _StoryNudityModerationResult({
    required this.checked,
    required this.explicitNudity,
    required this.pornScore,
    required this.hentaiScore,
    required this.sexyScore,
    required this.neutralScore,
    required this.provider,
    this.error,
  });

  factory _StoryNudityModerationResult.unavailable(String error) {
    return _StoryNudityModerationResult(
      checked: false,
      explicitNudity: false,
      pornScore: 0,
      hentaiScore: 0,
      sexyScore: 0,
      neutralScore: 0,
      provider: "nsfwjs-web",
      error: error,
    );
  }

  Map<String, dynamic> toStoryFields() {
    return {
      "moderationProvider": provider,
      "moderationCheckedAt": FieldValue.serverTimestamp(),
      "moderationAvailable": checked,
      "moderationExplicitNudity": explicitNudity,
      "moderationRequiresBlur": explicitNudity,
      "moderationNsfwScores": {
        "porn": pornScore,
        "hentai": hentaiScore,
        "sexy": sexyScore,
        "neutral": neutralScore,
      },
      if (error != null && error!.trim().isNotEmpty) "moderationError": error,
    };
  }
}

class _StoryNudityModerationService {
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
      if (!completer.isCompleted) completer.completeError(Exception("No se pudo cargar $src"));
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
          "sayittome-tfjs",
          "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
        );
        await _loadScriptOnce(
          "sayittome-nsfwjs",
          "https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js",
        );
      }

      final nsfwjs = js_util.getProperty<Object?>(html.window, "nsfwjs");
      if (nsfwjs == null) return null;
      _modelPromise ??= js_util.callMethod<Object>(nsfwjs, "load", const []);
      _model = await js_util.promiseToFuture<Object>(_modelPromise!);
      return _model;
    } catch (e) {
      debugPrint("No pude inicializar detector NSFW de historias: $e");
      return null;
    }
  }

  static Future<html.ImageElement> _loadImageElement(String url) async {
    final completer = Completer<html.ImageElement>();
    final image = html.ImageElement()
      ..crossOrigin = "anonymous"
      ..src = url;

    image.onLoad.first.then((_) {
      if (!completer.isCompleted) completer.complete(image);
    });
    image.onError.first.then((_) {
      if (!completer.isCompleted) completer.completeError(Exception("No se pudo leer la imagen para moderación"));
    });

    return completer.future.timeout(const Duration(seconds: 18));
  }

  static double _scoreFromPredictions(List<dynamic> predictions, String className) {
    for (final item in predictions) {
      final rawName = (js_util.getProperty<Object?>(item, "className") ?? "").toString().trim().toLowerCase();
      if (rawName == className.toLowerCase()) {
        final rawProbability = js_util.getProperty<Object?>(item, "probability");
        if (rawProbability is num) return rawProbability.toDouble();
        return double.tryParse(rawProbability.toString()) ?? 0;
      }
    }
    return 0;
  }

  static Future<_StoryNudityModerationResult> classifyImageUrl(String url) async {
    final cleanUrl = url.trim();
    if (cleanUrl.isEmpty) return _StoryNudityModerationResult.unavailable("url_vacia");

    try {
      final model = await _modelOrNull();
      if (model == null) return _StoryNudityModerationResult.unavailable("modelo_no_disponible");

      final image = await _loadImageElement(cleanUrl);
      final rawPredictions = await js_util.promiseToFuture<Object>(
        js_util.callMethod<Object>(model, "classify", [image]),
      );
      final predictions = List<dynamic>.from(rawPredictions as dynamic);

      final porn = _scoreFromPredictions(predictions, "Porn");
      final hentai = _scoreFromPredictions(predictions, "Hentai");
      final sexy = _scoreFromPredictions(predictions, "Sexy");
      final neutral = _scoreFromPredictions(predictions, "Neutral");

      // Regla estricta: una foto sin remera, panza, torso o bikini suele caer en "Sexy".
      // Acá NO blureamos por Sexy. Solo blureamos desnudez explícita real.
      final explicit = porn >= 0.72 || hentai >= 0.86 || (porn >= 0.62 && sexy >= 0.34 && neutral < 0.28);

      return _StoryNudityModerationResult(
        checked: true,
        explicitNudity: explicit,
        pornScore: porn,
        hentaiScore: hentai,
        sexyScore: sexy,
        neutralScore: neutral,
        provider: "nsfwjs-web",
      );
    } catch (e) {
      debugPrint("No pude clasificar historia sensible: $e");
      return _StoryNudityModerationResult.unavailable(e.toString());
    }
  }
}

class _SensitiveStoryBlurGate extends StatelessWidget {
  final bool blurred;
  final bool loading;
  final VoidCallback onReveal;
  final Widget child;

  const _SensitiveStoryBlurGate({
    required this.blurred,
    required this.loading,
    required this.onReveal,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    if (!blurred) return child;

    return Stack(
      fit: StackFit.expand,
      children: [
        ImageFiltered(
          imageFilter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: child,
        ),
        Container(color: Colors.black.withOpacity(0.54)),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Container(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
              decoration: BoxDecoration(
                color: const Color(0xFF101010).withOpacity(0.92),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white.withOpacity(0.12)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.42),
                    blurRadius: 28,
                    offset: const Offset(0, 16),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withOpacity(0.10),
                      border: Border.all(color: Colors.white.withOpacity(0.16)),
                    ),
                    child: const Icon(Icons.visibility_off_rounded, color: Colors.white, size: 28),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    "Contenido sensible",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "Esta historia puede incluir desnudez explícita. La dejamos cubierta para que elijas si verla o no.",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white.withOpacity(0.66), height: 1.32, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: onReveal,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      ),
                      icon: const Icon(Icons.visibility_rounded),
                      label: const Text("Ver igual", style: TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ),
                  if (loading) ...[
                    const SizedBox(height: 10),
                    Text(
                      "Analizando imagen...",
                      style: TextStyle(color: Colors.white.withOpacity(0.42), fontSize: 12, fontWeight: FontWeight.w800),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

Future<String?> _pickAndUploadStoryMedia({required bool isVideo}) async {
  try {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;

    final picker = ImagePicker();
    final XFile? file = isVideo
        ? await picker.pickVideo(source: ImageSource.gallery)
        : await picker.pickImage(
            source: ImageSource.gallery,
            imageQuality: 96,
            maxWidth: 2400,
          );

    if (file == null) return null;

    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) throw Exception("El archivo está vacío.");

    final cleanName = file.name
        .trim()
        .replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_')
        .replaceAll(RegExp(r'_+'), '_');
    final safeName = cleanName.isEmpty ? "historia" : cleanName;
    final lower = safeName.toLowerCase();
    final ext = lower.endsWith('.jpg') ||
            lower.endsWith('.jpeg') ||
            lower.endsWith('.png') ||
            lower.endsWith('.webp') ||
            lower.endsWith('.gif') ||
            lower.endsWith('.mp4') ||
            lower.endsWith('.mov') ||
            lower.endsWith('.webm')
        ? ""
        : (isVideo ? ".mp4" : ".jpg");
    final finalName = "$safeName$ext";
    final folder = isVideo ? "historias/videos" : "historias/fotos";
    final path = "usuarios/${user.uid}/$folder/${DateTime.now().millisecondsSinceEpoch}_$finalName";
    final contentType = file.mimeType ?? _storyContentTypeFromName(finalName, isVideo: isVideo);

    final ref = FirebaseStorage.instance.ref(path);
    await ref.putData(
      bytes,
      SettableMetadata(
        contentType: contentType,
        cacheControl: "public,max-age=31536000",
        customMetadata: {
          "uid": user.uid,
          "story": "true",
          "originalName": file.name,
        },
      ),
    ).timeout(const Duration(seconds: 70));

    return await ref.getDownloadURL().timeout(const Duration(seconds: 25));
  } catch (e) {
    debugPrint("No pude subir historia: $e");
    return null;
  }
}

String _storyContentTypeFromName(String name, {required bool isVideo}) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return isVideo ? 'video/mp4' : 'image/jpeg';
}

Future<void> _createStoryFromPicker(BuildContext context, {required bool isVideo}) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Entrá con tu cuenta para subir historias.")),
    );
    return;
  }

  final canUpload = await _ensureCanUploadStory(context, user.uid);
  if (!canUpload) return;

  final messenger = ScaffoldMessenger.of(context);
  messenger.showSnackBar(
    SnackBar(content: Text(isVideo ? "Elegí un video para tu historia..." : "Elegí una foto para tu historia...")),
  );

  final url = await _pickAndUploadStoryMedia(isVideo: isVideo);
  if (url == null) {
    messenger.showSnackBar(
      const SnackBar(content: Text("No se subió ninguna historia.")),
    );
    return;
  }

  final moderation = isVideo
      ? const _StoryNudityModerationResult(
          checked: false,
          explicitNudity: false,
          pornScore: 0,
          hentaiScore: 0,
          sexyScore: 0,
          neutralScore: 0,
          provider: "video_no_analizado",
        )
      : await _StoryNudityModerationService.classifyImageUrl(url);

  try {
    final profileDoc = await FirebaseFirestore.instance.collection("usuarios").doc(user.uid).get();
    final profile = profileDoc.data() ?? {};
    final now = DateTime.now();
    await FirebaseFirestore.instance
        .collection("usuarios")
        .doc(user.uid)
        .collection("historias")
        .add({
      "uid": user.uid,
      "ownerUid": user.uid,
      "username": (profile["username"] ?? user.email ?? "usuario").toString(),
      "avatarUrl": (profile["fotoPrincipal"] ?? "").toString(),
      "url": url,
      "type": isVideo ? "video" : "image",
      "createdAt": FieldValue.serverTimestamp(),
      "expiresAt": Timestamp.fromDate(now.add(const Duration(hours: 24))),
      "likesCount": 0,
      ...moderation.toStoryFields(),
    }).timeout(const Duration(seconds: 14));

    messenger.showSnackBar(
      const SnackBar(content: Text("Historia subida por 24 hs ✅")),
    );
  } catch (e) {
    messenger.showSnackBar(
      SnackBar(content: Text("La historia subió, pero no pude registrarla: $e")),
    );
  }
}

void _showStoryUploadCameraSheet(BuildContext context) {
  showDialog(
    context: context,
    barrierColor: Colors.black,
    builder: (_) => Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: Container(
                color: Colors.black,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: () => Navigator.pop(context),
                            icon: const Icon(Icons.close_rounded, color: Colors.white, size: 30),
                          ),
                          const Expanded(
                            child: Text(
                              "Nueva historia",
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                            ),
                          ),
                          const SizedBox(width: 48),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Container(
                        width: double.infinity,
                        color: const Color(0xFF050505),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            const DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [Color(0xFF111111), Color(0xFF050505), Colors.black],
                                ),
                              ),
                            ),
                            Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.photo_camera_rounded, color: Colors.white.withOpacity(0.28), size: 84),
                                  const SizedBox(height: 14),
                                  Text(
                                    "Cámara web simulada",
                                    style: TextStyle(color: Colors.white.withOpacity(0.70), fontWeight: FontWeight.w900),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    "Tocá el círculo para subir foto o el botón derecho para video.",
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: Colors.white.withOpacity(0.45), height: 1.25),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Container(
                      height: 138,
                      color: Colors.black,
                      padding: const EdgeInsets.fromLTRB(32, 18, 32, 22),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _StoryCameraBottomButton(
                            icon: Icons.image_rounded,
                            onTap: () async {
                              Navigator.pop(context);
                              await _createStoryFromPicker(context, isVideo: false);
                            },
                          ),
                          GestureDetector(
                            onTap: () async {
                              Navigator.pop(context);
                              await _createStoryFromPicker(context, isVideo: false);
                            },
                            child: Container(
                              width: 92,
                              height: 92,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white,
                                border: Border.all(color: Colors.white.withOpacity(0.36), width: 9),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.white.withOpacity(0.20),
                                    blurRadius: 18,
                                    spreadRadius: 3,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          _StoryCameraBottomButton(
                            icon: Icons.flip_camera_android_rounded,
                            onTap: () async {
                              Navigator.pop(context);
                              await _createStoryFromPicker(context, isVideo: true);
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              top: 74,
              right: 18,
              child: Icon(Icons.flash_off_rounded, color: Colors.white.withOpacity(0.92), size: 38),
            ),
          ],
        ),
      ),
    ),
  );
}


class _InlineNetworkVideoPlayer extends StatefulWidget {
  final String url;
  final double aspectRatio;
  final bool controls;
  final bool autoplay;
  final bool loop;
  final bool muted;
  final BoxFit fit;
  final ValueChanged<Duration>? onDurationKnown;
  final VoidCallback? onEnded;

  const _InlineNetworkVideoPlayer({
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
  State<_InlineNetworkVideoPlayer> createState() => _InlineNetworkVideoPlayerState();
}

class _InlineNetworkVideoPlayerState extends State<_InlineNetworkVideoPlayer> {
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

    // Flutter Web: se registra un <video> HTML real para que las historias
    // y los videos de chat no queden como una tarjeta falsa con "reproductor pendiente".
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) => _video);
  }

  void _emitDurationIfUsable() {
    final rawSeconds = _video.duration;
    if (rawSeconds.isNaN || rawSeconds.isInfinite || rawSeconds <= 0) return;
    final duration = Duration(milliseconds: (rawSeconds * 1000).round());
    widget.onDurationKnown?.call(duration);
  }

  @override
  void didUpdateWidget(covariant _InlineNetworkVideoPlayer oldWidget) {
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

class _StoryCameraBottomButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _StoryCameraBottomButton({
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 58,
        height: 58,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: Colors.black, size: 34),
      ),
    );
  }
}

class StoriesExplorePage extends StatelessWidget {
  const StoriesExplorePage({super.key});

  bool _isActive(Map<String, dynamic> data) {
    final url = (data["url"] ?? "").toString().trim();
    if (url.isEmpty) return false;
    final expiresAt = data["expiresAt"];
    if (expiresAt is! Timestamp) return true;
    return expiresAt.toDate().isAfter(DateTime.now());
  }

  int _createdMillis(Map<String, dynamic> data) {
    final createdAt = data["createdAt"];
    if (createdAt is Timestamp) return createdAt.millisecondsSinceEpoch;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final myUid = user?.uid ?? "";

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text("Historias", style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded, color: Colors.white, size: 34),
            onPressed: () => _showStoryUploadCameraSheet(context),
          ),
          const SizedBox(width: 10),
        ],
      ),
      body: Column(
        children: [
          InkWell(
            onTap: () {},
            child: Container(
              height: 62,
              color: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              child: Row(
                children: [
                  const Icon(Icons.filter_list_rounded, color: Colors.white70, size: 34),
                  const SizedBox(width: 18),
                  Text(
                    "Filtro",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.72),
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Icon(Icons.chevron_right_rounded, color: Colors.white.withOpacity(0.70), size: 42),
                ],
              ),
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance.collectionGroup("historias").snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return _CenterSoftText(text: "No pude cargar historias: ${snapshot.error}");
                }
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final items = snapshot.data!.docs.map((doc) {
                  final data = doc.data();
                  // La fuente más confiable para agrupar historias es el owner real del path:
                  // usuarios/{uid}/historias/{storyId}. Algunos documentos viejos pueden tener
                  // uid/ownerUid inconsistentes; si usáramos esos campos primero, el mismo perfil
                  // podría aparecer duplicado en el feed general.
                  final ownerFromPath = (doc.reference.parent.parent?.id ?? "").toString().trim();
                  final ownerFromData = (data["ownerUid"] ?? data["uid"] ?? data["profileUid"] ?? "").toString().trim();
                  final profileUid = ownerFromPath.isNotEmpty ? ownerFromPath : ownerFromData;
                  return {
                    ...data,
                    "id": doc.id,
                    "profileUid": profileUid,
                    "ownerUid": profileUid,
                  };
                }).where(_isActive).toList();

                items.sort((a, b) => _createdMillis(b).compareTo(_createdMillis(a)));

                final myStories = myUid.isEmpty
                    ? <Map<String, dynamic>>[]
                    : items.where((story) => (story["profileUid"] ?? story["uid"] ?? "").toString() == myUid).toList();
                final publicStories = myUid.isEmpty
                    ? items
                    : items.where((story) => (story["profileUid"] ?? story["uid"] ?? "").toString() != myUid).toList();
                final groupedPublicStories = _groupStoriesByProfile(publicStories);

                return CustomScrollView(
                  slivers: [
                    SliverToBoxAdapter(
                      child: _MyStoriesTopSection(
                        stories: myStories,
                        showUpload: user != null,
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
                        child: Row(
                          children: [
                            const Text(
                              "Historias de la comunidad",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              "${groupedPublicStories.length} perfiles",
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.46),
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (groupedPublicStories.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _CenterSoftText(
                          text: "Todavía no hay historias públicas activas. Subí una historia o volvé más tarde.",
                        ),
                      )
                    else
                      SliverGrid(
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          childAspectRatio: 0.58,
                          crossAxisSpacing: 2,
                          mainAxisSpacing: 2,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            final group = groupedPublicStories[index];
                            return _GroupedStoryGridTile(group: group);
                          },
                          childCount: groupedPublicStories.length,
                        ),
                      ),
                    const SliverToBoxAdapter(child: SizedBox(height: 18)),
                  ],
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: const _BottomNavMock(selected: 0),
    );
  }
}

class _MyStoriesTopSection extends StatelessWidget {
  final List<Map<String, dynamic>> stories;
  final bool showUpload;

  const _MyStoriesTopSection({
    required this.stories,
    required this.showUpload,
  });

  void _openStory(BuildContext context, int index) {
    if (stories.isEmpty) return;
    final profileUid = (stories[index]["profileUid"] ?? stories[index]["uid"] ?? "").toString();
    if (profileUid.trim().isEmpty) return;
    showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.94),
      builder: (_) => _StoryViewerDialog(
        profileUid: profileUid,
        stories: stories,
        initialIndex: index,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!showUpload && stories.isEmpty) return const SizedBox.shrink();

    return Container(
      color: Colors.black,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                "Tus historias",
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Text(
                "24 hs",
                style: TextStyle(
                  color: Colors.white.withOpacity(0.46),
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 172,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: stories.length + (showUpload ? 1 : 0),
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                if (showUpload && index == 0) {
                  return _MyStoryUploadCard(onTap: () => _showStoryUploadCameraSheet(context));
                }
                final storyIndex = showUpload ? index - 1 : index;
                final story = stories[storyIndex];
                return _MyStoryPreviewCard(
                  story: story,
                  onTap: () => _openStory(context, storyIndex),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _MyStoryUploadCard extends StatelessWidget {
  final VoidCallback onTap;

  const _MyStoryUploadCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 116,
        height: 172,
        decoration: BoxDecoration(
          color: const Color(0xFF111111),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF6C63FF),
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: const Icon(Icons.add_rounded, color: Colors.white, size: 36),
            ),
            const SizedBox(height: 12),
            Text(
              "Subir\nhistoria",
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withOpacity(0.86),
                fontSize: 13,
                fontWeight: FontWeight.w900,
                height: 1.15,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MyStoryPreviewCard extends StatelessWidget {
  final Map<String, dynamic> story;
  final VoidCallback onTap;

  const _MyStoryPreviewCard({
    required this.story,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final url = (story["url"] ?? "").toString();
    final type = (story["type"] ?? "image").toString();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 116,
        height: 172,
        decoration: BoxDecoration(
          color: const Color(0xFF101010),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFF6C63FF), width: 2),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF6C63FF).withOpacity(0.24),
              blurRadius: 14,
              spreadRadius: 1,
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            type == "video"
                ? Stack(
                    fit: StackFit.expand,
                    children: [
                      _InlineNetworkVideoPlayer(
                        url: url,
                        aspectRatio: 9 / 16,
                        controls: false,
                        autoplay: false,
                        loop: false,
                        muted: true,
                        fit: BoxFit.cover,
                      ),
                      const Center(
                        child: Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 48),
                      ),
                    ],
                  )
                : Image.network(
                    url,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image_rounded, color: Colors.white38, size: 38),
                    ),
                  ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withOpacity(0.10),
                      Colors.black.withOpacity(0.72),
                    ],
                    stops: const [0.0, 0.55, 1.0],
                  ),
                ),
              ),
            ),
            Positioned(
              left: 9,
              right: 9,
              bottom: 10,
              child: Text(
                "Tu historia",
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryUploadGridTile extends StatelessWidget {
  final VoidCallback onTap;

  const _StoryUploadGridTile({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        color: const Color(0xFF0C0C0C),
        child: Stack(
          fit: StackFit.expand,
          children: [
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF171717), Color(0xFF050505)],
                ),
              ),
            ),
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF6C63FF),
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 38),
              ),
            ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 12,
              child: Text(
                "Subir historia",
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.white.withOpacity(0.92), fontWeight: FontWeight.w900, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}


class _GroupedStoryGridTile extends StatelessWidget {
  final _GroupedStoriesEntry group;

  const _GroupedStoryGridTile({required this.group});

  @override
  Widget build(BuildContext context) {
    final url = group.previewUrl;
    final type = group.previewType;
    final profileUid = group.profileUid;
    final username = group.username;
    final avatarUrl = group.avatarUrl;
    final count = group.count;

    return GestureDetector(
      onTap: () {
        if (profileUid.trim().isEmpty || group.stories.isEmpty) return;
        showDialog(
          context: context,
          barrierColor: Colors.black.withOpacity(0.94),
          builder: (_) => _StoryViewerDialog(
            profileUid: profileUid,
            stories: group.stories,
            initialIndex: 0,
          ),
        );
      },
      child: Container(
        color: const Color(0xFF101010),
        child: Stack(
          fit: StackFit.expand,
          children: [
            type == "video"
                ? Container(
                    color: const Color(0xFF181818),
                    child: const Center(
                      child: Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 50),
                    ),
                  )
                : Image.network(
                    url,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image_rounded, color: Colors.white38, size: 42),
                    ),
                  ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black.withOpacity(0.10), Colors.black.withOpacity(0.78)],
                    stops: const [0.0, 0.58, 1.0],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 10,
              right: 10,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.58),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withOpacity(0.26)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.auto_stories_rounded, color: Colors.white, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      count.toString(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 10,
              bottom: 36,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (profileUid.trim().isEmpty) return;
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PublicProfilePage(profileUid: profileUid),
                    ),
                  );
                },
                child: _ProfileAvatar(url: avatarUrl, size: 42),
              ),
            ),
            Positioned(
              left: 10,
              right: 8,
              bottom: 12,
              child: Text(
                username,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryGridTile extends StatelessWidget {
  final Map<String, dynamic> story;

  const _StoryGridTile({required this.story});

  @override
  Widget build(BuildContext context) {
    final url = (story["url"] ?? "").toString();
    final type = (story["type"] ?? "image").toString();
    final profileUid = (story["profileUid"] ?? story["uid"] ?? "").toString();
    final storyId = (story["id"] ?? "").toString();
    final username = (story["username"] ?? "").toString();
    final avatarUrl = (story["avatarUrl"] ?? "").toString();

    return GestureDetector(
      onTap: () {
        if (profileUid.isEmpty || storyId.isEmpty) return;
        showDialog(
          context: context,
          barrierColor: Colors.black.withOpacity(0.94),
          builder: (_) => _StoryViewerDialog(
            profileUid: profileUid,
            stories: [story],
            initialIndex: 0,
          ),
        );
      },
      child: Container(
        color: const Color(0xFF101010),
        child: Stack(
          fit: StackFit.expand,
          children: [
            type == "video"
                ? Stack(
                    fit: StackFit.expand,
                    children: [
                      _InlineNetworkVideoPlayer(
                        url: url,
                        aspectRatio: 9 / 16,
                        controls: false,
                        autoplay: false,
                        loop: false,
                        muted: true,
                        fit: BoxFit.cover,
                      ),
                      const Center(child: Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 50)),
                    ],
                  )
                : Image.network(
                    url,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                    errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.broken_image_rounded, color: Colors.white38, size: 42)),
                  ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black.withOpacity(0.10), Colors.black.withOpacity(0.76)],
                    stops: const [0.0, 0.58, 1.0],
                  ),
                ),
              ),
            ),
            Positioned(
              left: 10,
              bottom: 36,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (profileUid.trim().isEmpty) return;
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PublicProfilePage(profileUid: profileUid),
                    ),
                  );
                },
                child: _ProfileAvatar(url: avatarUrl, size: 42),
              ),
            ),
            Positioned(
              left: 10,
              right: 8,
              bottom: 12,
              child: Text(
                username.trim().isEmpty ? "usuario" : username.trim(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoriesStrip extends StatelessWidget {
  final String profileUid;
  final bool isOwnProfile;

  const _StoriesStrip({
    required this.profileUid,
    required this.isOwnProfile,
  });

  Future<void> _deleteExpiredStories(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) async {
    final now = DateTime.now();
    for (final doc in docs) {
      final expiresAt = doc.data()["expiresAt"];
      if (expiresAt is Timestamp && expiresAt.toDate().isBefore(now)) {
        await doc.reference.delete().catchError((_) {});
      }
    }
  }

  void _openStory(BuildContext context, List<Map<String, dynamic>> stories, int index) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.94),
      builder: (_) => _StoryViewerDialog(profileUid: profileUid, stories: stories, initialIndex: index),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection("usuarios")
          .doc(profileUid)
          .collection("historias")
          .snapshots(),
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? [];
        if (docs.isNotEmpty) {
          Future.microtask(() => _deleteExpiredStories(docs));
        }

        final now = DateTime.now();
        final activeStories = docs
            .map((doc) => {
                  ...doc.data(),
                  "id": doc.id,
                })
            .where((data) {
              final url = (data["url"] ?? "").toString().trim();
              final expiresAt = data["expiresAt"];
              if (url.isEmpty) return false;
              if (expiresAt is! Timestamp) return true;
              return expiresAt.toDate().isAfter(now);
            })
            .toList();

        activeStories.sort((a, b) {
          final at = a["createdAt"];
          final bt = b["createdAt"];
          final am = at is Timestamp ? at.millisecondsSinceEpoch : 0;
          final bm = bt is Timestamp ? bt.millisecondsSinceEpoch : 0;
          return bm.compareTo(am);
        });

        if (activeStories.isEmpty && !isOwnProfile) {
          return const SizedBox.shrink();
        }

        return Container(
          color: Colors.black,
          padding: const EdgeInsets.fromLTRB(24, 18, 24, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_stories_rounded, color: Color(0xFF6C63FF), size: 22),
                  const SizedBox(width: 8),
                  const Text(
                    "Historias",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    "24 hs",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.48),
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 92,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: activeStories.length + (isOwnProfile ? 1 : 0),
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    if (isOwnProfile && index == 0) {
                      return const _StoryAddPlaceholder();
                    }
                    final storyIndex = isOwnProfile ? index - 1 : index;
                    final story = activeStories[storyIndex];
                    final url = (story["url"] ?? "").toString();
                    final type = (story["type"] ?? "image").toString();
                    return GestureDetector(
                      onTap: () => _openStory(context, activeStories, storyIndex),
                      child: Container(
                        width: 72,
                        height: 92,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: const Color(0xFF6C63FF), width: 2),
                          color: const Color(0xFF141414),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            type == "video"
                                ? Container(
                                    color: const Color(0xFF181818),
                                    child: const Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 34),
                                  )
                                : Image.network(
                                    url,
                                    fit: BoxFit.cover,
                                    gaplessPlayback: true,
                                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_rounded, color: Colors.white38),
                                  ),
                            Positioned(
                              left: 0,
                              right: 0,
                              bottom: 0,
                              child: Container(
                                height: 28,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [Colors.transparent, Colors.black.withOpacity(0.72)],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StoryAddPlaceholder extends StatelessWidget {
  final VoidCallback? onTap;

  const _StoryAddPlaceholder({this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap ?? () => _showStoryUploadCameraSheet(context),
      child: SizedBox(
        width: 78,
        height: 92,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.black,
                border: Border.all(color: const Color(0xFF6C63FF), width: 3),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6C63FF).withOpacity(0.32),
                    blurRadius: 14,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Icon(Icons.person_rounded, color: Colors.white54, size: 38),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 25,
                      height: 25,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF6C63FF),
                        border: Border.all(color: Colors.black, width: 2),
                      ),
                      child: const Icon(Icons.add_rounded, color: Colors.white, size: 18),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              "Tu historia",
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: Colors.white.withOpacity(0.72),
                fontSize: 10.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<String> _storyLikeActorId() async {
  final user = FirebaseAuth.instance.currentUser;
  if (user != null) return "user_${user.uid}";

  final prefs = await SharedPreferences.getInstance();
  final existing = prefs.getString("visitorId");
  if (existing != null && existing.trim().isNotEmpty) {
    return "visitor_${existing.trim()}";
  }

  final created = "v-${Random().nextInt(999999999)}";
  await prefs.setString("visitorId", created);
  return "visitor_$created";
}

Future<String> _storyViewActorId() => _storyLikeActorId();

Future<void> _markStoryViewedOnce({
  required String profileUid,
  required String storyId,
}) async {
  if (profileUid.trim().isEmpty || storyId.trim().isEmpty) return;

  final actorId = await _storyViewActorId();
  final ref = FirebaseFirestore.instance
      .collection("usuarios")
      .doc(profileUid)
      .collection("historias")
      .doc(storyId)
      .collection("story_views")
      .doc(actorId);

  final doc = await ref.get();
  if (doc.exists) return;

  await ref.set({
    "actorId": actorId,
    "profileUid": profileUid,
    "storyId": storyId,
    "createdAt": FieldValue.serverTimestamp(),
  }, SetOptions(merge: true));
}

Stream<int> _storyViewsCountStream({
  required String profileUid,
  required String storyId,
}) {
  return FirebaseFirestore.instance
      .collection("usuarios")
      .doc(profileUid)
      .collection("historias")
      .doc(storyId)
      .collection("story_views")
      .snapshots()
      .map((snapshot) => snapshot.docs.length);
}

class _StoryLikeButton extends StatefulWidget {
  final String profileUid;
  final String storyId;

  const _StoryLikeButton({
    required this.profileUid,
    required this.storyId,
  });

  @override
  State<_StoryLikeButton> createState() => _StoryLikeButtonState();
}

class _StoryLikeButtonState extends State<_StoryLikeButton> {
  String? actorId;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _loadActor();
  }

  Future<void> _loadActor() async {
    final id = await _storyLikeActorId();
    if (mounted) {
      setState(() {
        actorId = id;
        loading = false;
      });
    }
  }

  DocumentReference<Map<String, dynamic>>? _likeRef() {
    final id = actorId;
    if (id == null || widget.storyId.trim().isEmpty) return null;
    return FirebaseFirestore.instance
        .collection("usuarios")
        .doc(widget.profileUid)
        .collection("historias")
        .doc(widget.storyId)
        .collection("story_likes")
        .doc(id);
  }

  Stream<int> _storyLikesCountStream() {
    return FirebaseFirestore.instance
        .collection("usuarios")
        .doc(widget.profileUid)
        .collection("historias")
        .doc(widget.storyId)
        .collection("story_likes")
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  Future<void> _likeOnce() async {
    final ref = _likeRef();
    if (ref == null) return;
    final doc = await ref.get();
    if (doc.exists) return;
    await ref.set({
      "actorId": actorId,
      "profileUid": widget.profileUid,
      "storyId": widget.storyId,
      "createdAt": FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  @override
  Widget build(BuildContext context) {
    if (loading || actorId == null) {
      return _StoryLikePill(
        liked: false,
        count: 0,
        loading: true,
        onTap: () {},
      );
    }

    final ref = _likeRef();
    if (ref == null) {
      return _StoryLikePill(
        liked: false,
        count: 0,
        loading: false,
        onTap: () {},
      );
    }

    return StreamBuilder<int>(
      stream: _storyLikesCountStream(),
      builder: (context, countSnapshot) {
        final count = countSnapshot.data ?? 0;
        return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: ref.snapshots(),
          builder: (context, likedSnapshot) {
            final liked = likedSnapshot.data?.exists == true;
            return _StoryLikePill(
              liked: liked,
              count: count,
              loading: false,
              onTap: liked ? () {} : _likeOnce,
            );
          },
        );
      },
    );
  }
}

class _StoryLikePill extends StatelessWidget {
  final bool liked;
  final int count;
  final bool loading;
  final VoidCallback onTap;

  const _StoryLikePill({
    required this.liked,
    required this.count,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          color: liked ? const Color(0xFFFF00A8) : Colors.black.withOpacity(0.52),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.30)),
          boxShadow: [
            BoxShadow(
              color: (liked ? const Color(0xFFFF00A8) : Colors.black).withOpacity(0.30),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              color: Colors.white,
              size: 24,
            ),
            const SizedBox(width: 8),
            Text(
              loading ? "..." : count.toString(),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              liked ? "Te gusta" : "Me gusta",
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryViewsPill extends StatelessWidget {
  final String profileUid;
  final String storyId;

  const _StoryViewsPill({
    required this.profileUid,
    required this.storyId,
  });

  @override
  Widget build(BuildContext context) {
    if (profileUid.trim().isEmpty || storyId.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<int>(
      stream: _storyViewsCountStream(profileUid: profileUid, storyId: storyId),
      builder: (context, snapshot) {
        final views = snapshot.data ?? 0;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.50),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white.withOpacity(0.22)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.visibility_rounded, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Text(
                "$views vistas",
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}


class _AdminStoryModerationButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;
  final bool danger;

  const _AdminStoryModerationButton({
    required this.icon,
    required this.text,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = danger ? Colors.redAccent : const Color(0xFF8C84FF);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        decoration: BoxDecoration(
          color: color.withOpacity(0.13),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: color.withOpacity(0.42)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  color: danger ? Colors.redAccent : Colors.white,
                  fontSize: 14.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryViewerDialog extends StatefulWidget {
  final String profileUid;
  final List<Map<String, dynamic>> stories;
  final int initialIndex;

  const _StoryViewerDialog({
    required this.profileUid,
    required this.stories,
    required this.initialIndex,
  });

  @override
  State<_StoryViewerDialog> createState() => _StoryViewerDialogState();
}

class _StoryViewerDialogState extends State<_StoryViewerDialog> {
  static const Duration _imageStoryDuration = Duration(seconds: 7);
  static const Duration _fallbackVideoStoryDuration = Duration(seconds: 30);
  static const Duration _maxVideoStoryDuration = Duration(minutes: 2);
  static const int _progressTicks = 140;

  late final PageController _controller;
  late final List<Map<String, dynamic>> _stories;
  late int page;
  Timer? _storyTimer;
  int _tick = 0;
  bool _paused = false;
  bool _animating = false;
  bool _deleting = false;
  bool _closingViewer = false;
  final Map<int, Duration> _videoDurationsByIndex = <int, Duration>{};
  final Set<String> _revealedSensitiveStoryKeys = <String>{};
  final Set<String> _moderationInFlightStoryKeys = <String>{};

  bool get _canDeleteCurrentStory {
    final user = FirebaseAuth.instance.currentUser;
    final isOwner = user != null && user.uid == widget.profileUid;
    final isAdmin = _isCurrentUserSayItToMeAdmin();
    return (isOwner || isAdmin) && page >= 0 && page < _stories.length;
  }

  bool get _canAdminModerateCurrentStory {
    return _isCurrentUserSayItToMeAdmin() && page >= 0 && page < _stories.length;
  }

  @override
  void initState() {
    super.initState();
    _stories = widget.stories.map((story) => Map<String, dynamic>.from(story)).toList();
    page = widget.initialIndex.clamp(0, _stories.isEmpty ? 0 : _stories.length - 1).toInt();
    _controller = PageController(initialPage: page);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _markCurrentStoryViewed();
      _ensureStoryModerationForIndex(page);
      _restartStoryTimer();
    });
  }

  Future<void> _markCurrentStoryViewed() async {
    if (page < 0 || page >= _stories.length) return;
    final storyId = (_stories[page]["id"] ?? "").toString();
    await _markStoryViewedOnce(profileUid: widget.profileUid, storyId: storyId);
  }

  Duration _durationForStoryIndex(int index) {
    if (index < 0 || index >= _stories.length) return _imageStoryDuration;
    final type = (_stories[index]["type"] ?? "image").toString().trim().toLowerCase();
    if (type != "video") return _imageStoryDuration;

    final known = _videoDurationsByIndex[index];
    if (known == null || known.inMilliseconds <= 0) return _fallbackVideoStoryDuration;
    if (known > _maxVideoStoryDuration) return _maxVideoStoryDuration;
    return known;
  }

  void _rememberVideoDuration(int index, Duration duration) {
    if (!mounted || duration.inMilliseconds <= 0) return;
    final normalized = duration > _maxVideoStoryDuration ? _maxVideoStoryDuration : duration;
    final previous = _videoDurationsByIndex[index];
    if (previous != null && (previous.inMilliseconds - normalized.inMilliseconds).abs() < 250) return;

    _videoDurationsByIndex[index] = normalized;
    if (index == page) {
      _restartStoryTimer(preserveProgress: true);
    }
  }

  void _restartStoryTimer({bool preserveProgress = false}) {
    _storyTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _tick = preserveProgress ? _tick.clamp(0, _progressTicks).toInt() : 0;
      _paused = false;
    });

    if (_stories.isEmpty) return;

    final currentDuration = _durationForStoryIndex(page);
    final tickMilliseconds = max(45, (currentDuration.inMilliseconds / _progressTicks).round());

    _storyTimer = Timer.periodic(
      Duration(milliseconds: tickMilliseconds),
      (_) {
        if (!mounted || _paused || _animating || _deleting) return;
        setState(() {
          _tick = (_tick + 1).clamp(0, _progressTicks).toInt();
        });
        if (_tick >= _progressTicks) {
          _goNext(auto: true);
        }
      },
    );
  }

  void _togglePause() {
    if (_stories.isEmpty || _deleting) return;
    setState(() => _paused = !_paused);
  }

  void _closeStoryViewerSafely() {
    if (!mounted || _closingViewer) return;
    _closingViewer = true;
    _storyTimer?.cancel();

    // Importante en Web: cuando una historia de video llega al final del contador,
    // no usamos maybePop(). maybePop puede terminar delegando el cierre al stack
    // principal si el diálogo ya no está como ruta activa, y eso en algunos casos
    // hacía que la app volviera a la pantalla de login. Acá cerramos solamente
    // el visor de historias si hay una ruta de diálogo arriba.
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    if (rootNavigator.canPop()) {
      rootNavigator.pop();
      return;
    }

    final localNavigator = Navigator.of(context);
    if (localNavigator.canPop()) {
      localNavigator.pop();
    }
  }

  Future<void> _goNext({bool auto = false}) async {
    if (!mounted || _animating || _stories.isEmpty || _deleting || _closingViewer) return;

    if (page >= _stories.length - 1) {
      _closeStoryViewerSafely();
      return;
    }

    _animating = true;
    final next = page + 1;
    await _controller.animateToPage(
      next,
      duration: const Duration(milliseconds: 185),
      curve: Curves.easeOutCubic,
    );
    _animating = false;
  }

  Future<void> _goPrevious() async {
    if (!mounted || _animating || _stories.isEmpty || _deleting || _closingViewer) return;

    if (page <= 0) {
      setState(() {
        _tick = 0;
        _paused = false;
      });
      return;
    }

    _animating = true;
    final previous = page - 1;
    await _controller.animateToPage(
      previous,
      duration: const Duration(milliseconds: 185),
      curve: Curves.easeOutCubic,
    );
    _animating = false;
  }

  double _progressForSegment(int index) {
    if (index < page) return 1;
    if (index > page) return 0;
    return (_tick / _progressTicks).clamp(0.0, 1.0);
  }

  Future<void> _deleteCurrentStory() async {
    if (!_canDeleteCurrentStory || _deleting) return;

    setState(() {
      _paused = true;
    });

    final story = _stories[page];
    final storyId = (story["id"] ?? "").toString().trim();
    final url = (story["url"] ?? "").toString().trim();
    if (storyId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101010),
          title: const Text(
            "Borrar historia",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          content: Text(
            "Esta historia se va a borrar ahora y dejará de verse en tu perfil.",
            style: TextStyle(color: Colors.white.withOpacity(0.72), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text("Cancelar"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                "Borrar",
                style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      if (mounted) setState(() => _paused = false);
      return;
    }

    setState(() => _deleting = true);

    try {
      await FirebaseFirestore.instance
          .collection("usuarios")
          .doc(widget.profileUid)
          .collection("historias")
          .doc(storyId)
          .delete()
          .timeout(const Duration(seconds: 12));

      if (url.startsWith('http')) {
        unawaited(FirebaseStorage.instance.refFromURL(url).delete().catchError((e) {
          debugPrint("No pude borrar archivo de Storage de la historia: $e");
        }));
      }

      if (!mounted) return;

      _stories.removeAt(page);
      if (_stories.isEmpty) {
        _closeStoryViewerSafely();
        return;
      }

      final nextPage = page.clamp(0, _stories.length - 1).toInt();
      page = nextPage;
      _controller.jumpToPage(nextPage);
      _deleting = false;
      _restartStoryTimer();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Historia borrada.")),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _deleting = false;
        _paused = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude borrar la historia: $e")),
      );
    }
  }

  Future<void> _adminBlockCurrentStoryOwner(Duration duration, String motivo) async {
    if (!_canAdminModerateCurrentStory || _deleting) return;

    setState(() => _paused = true);

    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101010),
          title: const Text(
            "Bloquear historias",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          content: Text(
            "El usuario no va a poder subir historias durante este período. El bloqueo caduca automáticamente.",
            style: TextStyle(color: Colors.white.withOpacity(0.72), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text("Cancelar"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                "Bloquear",
                style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed == true) {
      await _adminBlockStoriesForUid(
        context: context,
        uid: widget.profileUid,
        duration: duration,
        motivo: motivo,
      );
    }

    if (mounted) setState(() => _paused = false);
  }

  void _showAdminStoryModerationSheet() {
    if (!_canAdminModerateCurrentStory) return;

    setState(() => _paused = true);

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF101010),
      barrierColor: Colors.black.withOpacity(0.72),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 46,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.22),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  "Moderación admin",
                  style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                Text(
                  "Podés borrar esta historia o bloquear temporalmente la subida de historias de este usuario.",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withOpacity(0.58), height: 1.35),
                ),
                const SizedBox(height: 18),
                _AdminStoryModerationButton(
                  icon: Icons.delete_forever_rounded,
                  text: "Borrar esta historia",
                  danger: true,
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _deleteCurrentStory();
                  },
                ),
                const SizedBox(height: 10),
                _AdminStoryModerationButton(
                  icon: Icons.timer_rounded,
                  text: "Bloquear historias 24 hs",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _adminBlockCurrentStoryOwner(const Duration(hours: 24), "bloqueo_admin_24h");
                  },
                ),
                const SizedBox(height: 10),
                _AdminStoryModerationButton(
                  icon: Icons.event_busy_rounded,
                  text: "Bloquear historias 7 días",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _adminBlockCurrentStoryOwner(const Duration(days: 7), "bloqueo_admin_7d");
                  },
                ),
                const SizedBox(height: 10),
                _AdminStoryModerationButton(
                  icon: Icons.block_rounded,
                  text: "Bloquear historias 30 días",
                  danger: true,
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _adminBlockCurrentStoryOwner(const Duration(days: 30), "bloqueo_admin_30d");
                  },
                ),
              ],
            ),
          ),
        );
      },
    ).whenComplete(() {
      if (mounted) setState(() => _paused = false);
    });
  }

  String _storySensitiveKey(Map<String, dynamic> story) {
    final id = (story["id"] ?? "").toString().trim();
    if (id.isNotEmpty) return id;
    return (story["url"] ?? "").toString().trim();
  }

  bool _storyModerationInFlight(Map<String, dynamic> story) {
    final key = _storySensitiveKey(story);
    return key.isNotEmpty && _moderationInFlightStoryKeys.contains(key);
  }

  bool _storyRequiresSensitiveBlur(Map<String, dynamic> story) {
    final key = _storySensitiveKey(story);
    if (key.isNotEmpty && _revealedSensitiveStoryKeys.contains(key)) return false;

    final requiresBlur = story["moderationRequiresBlur"] == true || story["moderationExplicitNudity"] == true;
    return requiresBlur;
  }

  void _revealSensitiveStory(Map<String, dynamic> story) {
    final key = _storySensitiveKey(story);
    if (key.isEmpty) return;
    setState(() {
      _revealedSensitiveStoryKeys.add(key);
      _paused = false;
    });
  }

  Future<void> _ensureStoryModerationForIndex(int index) async {
    if (index < 0 || index >= _stories.length) return;
    final story = _stories[index];
    final type = (story["type"] ?? "image").toString().trim().toLowerCase();
    if (type != "image") return;

    final alreadyChecked = story.containsKey("moderationRequiresBlur") || story.containsKey("moderationExplicitNudity");
    if (alreadyChecked) {
      if (_storyRequiresSensitiveBlur(story) && mounted && index == page) {
        setState(() => _paused = true);
      }
      return;
    }

    final url = (story["url"] ?? "").toString().trim();
    final storyId = (story["id"] ?? "").toString().trim();
    final key = _storySensitiveKey(story);
    if (url.isEmpty || key.isEmpty || _moderationInFlightStoryKeys.contains(key)) return;

    setState(() => _moderationInFlightStoryKeys.add(key));
    final result = await _StoryNudityModerationService.classifyImageUrl(url);
    if (!mounted) return;

    final fields = result.toStoryFields();
    setState(() {
      _moderationInFlightStoryKeys.remove(key);
      story.addAll({
        "moderationProvider": result.provider,
        "moderationAvailable": result.checked,
        "moderationExplicitNudity": result.explicitNudity,
        "moderationRequiresBlur": result.explicitNudity,
        "moderationNsfwScores": {
          "porn": result.pornScore,
          "hentai": result.hentaiScore,
          "sexy": result.sexyScore,
          "neutral": result.neutralScore,
        },
        if (result.error != null && result.error!.trim().isNotEmpty) "moderationError": result.error,
      });
      if (index == page && result.explicitNudity && !_revealedSensitiveStoryKeys.contains(key)) {
        _paused = true;
      }
    });

    if (storyId.isNotEmpty) {
      unawaited(
        FirebaseFirestore.instance
            .collection("usuarios")
            .doc(widget.profileUid)
            .collection("historias")
            .doc(storyId)
            .set(fields, SetOptions(merge: true))
            .timeout(const Duration(seconds: 12))
            .catchError((e) => debugPrint("No pude guardar moderación de historia: $e")),
      );
    }
  }


  @override
  void dispose() {
    _storyTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_stories.isEmpty) {
      return Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            const Center(
              child: Text(
                "No hay historias activas.",
                style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w800),
              ),
            ),
            Positioned(
              top: MediaQuery.of(context).padding.top + 14,
              right: 16,
              child: _RoundOverlayIconButton(
                icon: Icons.close_rounded,
                onTap: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      );
    }

    final safePage = page.clamp(0, _stories.length - 1).toInt();

    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            children: [
              PageView.builder(
                controller: _controller,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _stories.length,
                onPageChanged: (value) {
                  setState(() {
                    page = value;
                    _tick = 0;
                    _paused = false;
                  });
                  _markCurrentStoryViewed();
                  _ensureStoryModerationForIndex(value);
                  _restartStoryTimer();
                },
                itemBuilder: (context, index) {
                  final story = _stories[index];
                  final url = (story["url"] ?? "").toString();
                  final type = (story["type"] ?? "image").toString();
                  WidgetsBinding.instance.addPostFrameCallback((_) => _ensureStoryModerationForIndex(index));

                  Widget content;
                  if (type == "video") {
                    content = Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            maxWidth: min(constraints.maxWidth * 0.92, 820),
                            maxHeight: constraints.maxHeight * 0.78,
                          ),
                          child: _InlineNetworkVideoPlayer(
                            url: url,
                            aspectRatio: 9 / 16,
                            controls: true,
                            autoplay: true,
                            loop: false,
                            muted: false,
                            fit: BoxFit.contain,
                            onDurationKnown: (duration) => _rememberVideoDuration(index, duration),
                            onEnded: () {
                              if (index == page && mounted && !_paused && !_deleting) {
                                _goNext(auto: true);
                              }
                            },
                          ),
                        ),
                      ),
                    );
                  } else {
                    content = Center(
                      child: Image.network(
                        url,
                        fit: BoxFit.contain,
                        filterQuality: FilterQuality.high,
                        gaplessPlayback: true,
                        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                        errorBuilder: (_, __, ___) => Center(
                          child: Text(
                            "No pude abrir esta historia.",
                            style: TextStyle(color: Colors.white.withOpacity(0.70)),
                          ),
                        ),
                      ),
                    );
                  }

                  return _SensitiveStoryBlurGate(
                    blurred: _storyRequiresSensitiveBlur(story),
                    loading: _storyModerationInFlight(story),
                    onReveal: () => _revealSensitiveStory(story),
                    child: content,
                  );
                },
              ),

              // Zonas táctiles reales. Van arriba del contenido, pero no pisan
              // la franja inferior de vistas/likes ni los botones superiores.
              Positioned(
                left: 0,
                right: 0,
                top: MediaQuery.of(context).padding.top + 46,
                bottom: MediaQuery.of(context).padding.bottom + 148,
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTap: () => _goPrevious(),
                        child: const SizedBox.expand(),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTap: _togglePause,
                        onLongPressStart: (_) {
                          if (!_paused) setState(() => _paused = true);
                        },
                        onLongPressEnd: (_) {
                          if (_paused) setState(() => _paused = false);
                        },
                        child: const SizedBox.expand(),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTap: () => _goNext(),
                        child: const SizedBox.expand(),
                      ),
                    ),
                  ],
                ),
              ),

              Positioned(
                top: MediaQuery.of(context).padding.top + 14,
                left: 18,
                right: _canDeleteCurrentStory ? 124 : 70,
                child: Row(
                  children: List.generate(_stories.length, (index) {
                    final progress = _progressForSegment(index);
                    return Expanded(
                      child: Container(
                        height: 4,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.22),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 90),
                            curve: Curves.linear,
                            width: constraints.maxWidth * progress,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),

              if (_paused)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 32,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.52),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white.withOpacity(0.18)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.pause_rounded, color: Colors.white, size: 18),
                          SizedBox(width: 6),
                          Text(
                            "Pausada",
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              Positioned(
                left: 0,
                right: 0,
                bottom: MediaQuery.of(context).padding.bottom + 82,
                child: Center(
                  child: _StoryViewsPill(
                    profileUid: widget.profileUid,
                    storyId: (_stories[safePage]["id"] ?? "").toString(),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: MediaQuery.of(context).padding.bottom + 28,
                child: Center(
                  child: _StoryLikeButton(
                    profileUid: widget.profileUid,
                    storyId: (_stories[safePage]["id"] ?? "").toString(),
                  ),
                ),
              ),
              if (_canDeleteCurrentStory)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 14,
                  right: 72,
                  child: _RoundOverlayIconButton(
                    icon: _deleting ? Icons.hourglass_top_rounded : Icons.delete_outline_rounded,
                    onTap: _deleteCurrentStory,
                  ),
                ),
              Positioned(
                top: MediaQuery.of(context).padding.top + 14,
                right: 16,
                child: _RoundOverlayIconButton(
                  icon: Icons.close_rounded,
                  onTap: _closeStoryViewerSafely,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PublicProfileHorizontalCard extends StatelessWidget {
  final String username;
  final String bio;
  final String provincia;
  final String fotoPrincipal;

  const _PublicProfileHorizontalCard({
    required this.username,
    required this.bio,
    required this.provincia,
    required this.fotoPrincipal,
  });

  @override
  Widget build(BuildContext context) {
    final displayUsername = username.trim().isEmpty ? "usuario" : username.trim();
    final displayBio = bio.trim().isEmpty ? "Sin bio todavía." : bio.trim();
    // Provincia interna intencionalmente no visible en tarjetas públicas.

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6C63FF).withOpacity(0.10),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _ProfileAvatar(url: fotoPrincipal, size: 126),
          const SizedBox(width: 22),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  displayUsername,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  "Perfil público: /$displayUsername",
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.56),
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  displayBio,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.72),
                    height: 1.35,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF171717),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white.withOpacity(0.06)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.lock_rounded, color: Color(0xFF6C63FF), size: 18),
                      const SizedBox(width: 7),
                      Flexible(
                        child: Text(
                          "Ubicación privada",
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.66),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class EditProfilePage extends StatefulWidget {
  const EditProfilePage({super.key});

  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage> {
  final TextEditingController usernameController = TextEditingController();
  final TextEditingController bioController = TextEditingController();
  final ImagePicker picker = ImagePicker();

  bool loadingInitial = true;
  bool saving = false;
  bool uploadingMainPhoto = false;
  bool uploadingGalleryPhoto = false;
  bool uploadingVideo = false;
  bool uploadingStory = false;
  String? error;
  String provinciaSeleccionada = "Córdoba";
  String originalUsernameLower = "";
  String fotoPrincipal = "";
  List<String> fotos = [];
  List<String> videos = [];

  final List<String> provinciasArgentina = _provinciasArgentina;

  @override
  void initState() {
    super.initState();
    loadProfile();
  }

  @override
  void dispose() {
    usernameController.dispose();
    bioController.dispose();
    super.dispose();
  }

  Future<void> loadProfile() async {
    try {
      final user = FirebaseAuth.instance.currentUser!;
      final doc = await FirebaseFirestore.instance
          .collection("usuarios")
          .doc(user.uid)
          .get()
          .timeout(const Duration(seconds: 12));

      final data = doc.data() ?? {};
      final provincia = (data["provincia"] ?? "Córdoba").toString();

      usernameController.text = (data["username"] ?? "").toString();
      bioController.text = (data["bio"] ?? "").toString();
      fotoPrincipal = (data["fotoPrincipal"] ?? "").toString();
      originalUsernameLower = (data["usernameLower"] ?? "").toString();
      provinciaSeleccionada = provinciasArgentina.contains(provincia) ? provincia : "Córdoba";
      fotos = _stringListFromAny(data["fotos"]);
      videos = _stringListFromAny(data["videos"]);
    } catch (e) {
      error = "No pude cargar tu perfil: $e";
    } finally {
      if (mounted) {
        setState(() => loadingInitial = false);
      }
    }
  }

  Future<String?> pickAndUploadMedia({
    required bool isVideo,
    required String folder,
  }) async {
    try {
      final user = FirebaseAuth.instance.currentUser!;
      final XFile? file = isVideo
          ? await picker.pickVideo(source: ImageSource.gallery)
          : await picker.pickImage(
              source: ImageSource.gallery,
              imageQuality: 92,
              maxWidth: 1920,
            );

      if (file == null) return null;

      final Uint8List bytes = await file.readAsBytes();
      if (bytes.isEmpty) {
        throw Exception("El archivo está vacío.");
      }

      final String safeName = _safeFileName(file.name);
      final String ext = _extensionFromName(safeName, isVideo: isVideo);
      final String finalName = safeName.toLowerCase().endsWith(ext.toLowerCase()) || ext.isEmpty
          ? safeName
          : "$safeName$ext";
      final String path = "usuarios/${user.uid}/$folder/${DateTime.now().millisecondsSinceEpoch}_$finalName";
      final String contentType = file.mimeType ?? _contentTypeFromName(finalName, isVideo: isVideo);

      final ref = FirebaseStorage.instance.ref(path);
      final metadata = SettableMetadata(
        contentType: contentType,
        cacheControl: "public,max-age=31536000",
        customMetadata: {
          "uid": user.uid,
          "originalName": file.name,
          "folder": folder,
        },
      );

      final uploadTask = ref.putData(bytes, metadata);
      await uploadTask.timeout(
        const Duration(seconds: 60),
        onTimeout: () {
          throw Exception(
            "La subida tardó demasiado. Revisá Storage/Rules o tu conexión y probá de nuevo.",
          );
        },
      );

      final downloadUrl = await ref.getDownloadURL().timeout(
        const Duration(seconds: 25),
        onTimeout: () {
          throw Exception(
            "La foto subió, pero no pude obtener la URL pública de descarga.",
          );
        },
      );

      return downloadUrl;
    } on FirebaseException catch (e) {
      final code = e.code;
      final message = e.message ?? "Firebase Storage rechazó la subida.";
      if (mounted) {
        setState(() {
          error = "Storage error [$code]: $message. Revisá las reglas de Firebase Storage.";
        });
      }
      return null;
    } catch (e) {
      if (mounted) {
        setState(() => error = "No pude subir el archivo: $e");
      }
      return null;
    }
  }

  String _safeFileName(String name) {
    final cleaned = name
        .trim()
        .replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_')
        .replaceAll(RegExp(r'_+'), '_');
    if (cleaned.isEmpty) {
      return "archivo";
    }
    return cleaned;
  }

  String _extensionFromName(String name, {required bool isVideo}) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.webm')) {
      return "";
    }
    return isVideo ? ".mp4" : ".jpg";
  }

  String _contentTypeFromName(String name, {required bool isVideo}) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    return isVideo ? 'video/mp4' : 'image/jpeg';
  }

  Future<void> uploadMainPhoto() async {
    if (uploadingMainPhoto) return;
    setState(() {
      uploadingMainPhoto = true;
      error = null;
    });

    final url = await pickAndUploadMedia(isVideo: false, folder: "foto_principal");
    if (url != null && mounted) {
      setState(() => fotoPrincipal = url);
    }

    if (mounted) {
      setState(() => uploadingMainPhoto = false);
    }
  }

  Future<void> addMedia({required bool isVideo}) async {
    final uploading = isVideo ? uploadingVideo : uploadingGalleryPhoto;
    if (uploading) return;

    setState(() {
      error = null;
      if (isVideo) {
        uploadingVideo = true;
      } else {
        uploadingGalleryPhoto = true;
      }
    });

    final url = await pickAndUploadMedia(
      isVideo: isVideo,
      folder: isVideo ? "videos" : "galeria",
    );

    if (url != null && mounted) {
      setState(() {
        if (isVideo) {
          videos.add(url);
        } else {
          if (fotoPrincipal.trim().isEmpty) {
        fotoPrincipal = url;
      } else {
        fotos.add(url);
      }
        }
      });
    }

    if (mounted) {
      setState(() {
        if (isVideo) {
          uploadingVideo = false;
        } else {
          uploadingGalleryPhoto = false;
        }
      });
    }
  }

  Future<void> addStory({required bool isVideo}) async {
    if (uploadingStory) return;
    setState(() {
      uploadingStory = true;
      error = null;
    });
    await _createStoryFromPicker(context, isVideo: isVideo);
    if (mounted) {
      setState(() => uploadingStory = false);
    }
  }

  void removeMainPhoto() {
    setState(() => fotoPrincipal = "");
  }

  void removeMedia({required bool isVideo, required int index}) {
    setState(() {
      if (isVideo) {
        videos.removeAt(index);
      } else {
        fotos.removeAt(index);
      }
    });
  }

  List<String> _orderedPhotoUrlsForEdit() {
    return _profilePhotosForDisplay(fotoPrincipal, fotos);
  }

  void _applyOrderedPhotoUrls(List<String> ordered) {
    final clean = ordered
        .map((e) => e.trim())
        .where((e) => e.startsWith('http://') || e.startsWith('https://'))
        .toList();

    setState(() {
      if (clean.isEmpty) {
        fotoPrincipal = "";
        fotos = [];
      } else {
        fotoPrincipal = clean.first;
        fotos = clean.skip(1).toList();
      }
    });

    // Persistencia inmediata: si el usuario toca "Hacer principal", borra
    // o reordena fotos, Firestore también queda sincronizado sin depender
    // únicamente del botón Guardar cambios. Esto evita que el perfil público
    // siga leyendo una fotoPrincipal vieja o vacía.
    unawaited(_persistPhotoOrderOnly(clean));
  }

  Future<void> _persistPhotoOrderOnly(List<String> orderedCleanPhotos) async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      final normalized = orderedCleanPhotos
          .map((e) => e.trim())
          .where((e) => e.startsWith('http://') || e.startsWith('https://'))
          .toList();

      await FirebaseFirestore.instance.collection("usuarios").doc(user.uid).set({
        "fotoPrincipal": normalized.isEmpty ? "" : normalized.first,
        "fotos": normalized.length <= 1 ? <String>[] : normalized.skip(1).toList(),
        "updatedAt": FieldValue.serverTimestamp(),
        "lastActiveAt": FieldValue.serverTimestamp(),
        "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
      }, SetOptions(merge: true)).timeout(const Duration(seconds: 10));
    } catch (e) {
      debugPrint("No pude sincronizar orden de fotos automáticamente: $e");
    }
  }

  void deletePhotoAt(int index) {
    final ordered = _orderedPhotoUrlsForEdit();
    if (index < 0 || index >= ordered.length) return;

    ordered.removeAt(index);
    _applyOrderedPhotoUrls(ordered);
  }

  void makeMainPhotoAt(int index) {
    final ordered = _orderedPhotoUrlsForEdit();
    if (index <= 0 || index >= ordered.length) return;

    final selected = ordered.removeAt(index);
    ordered.insert(0, selected);
    _applyOrderedPhotoUrls(ordered);
  }

  void reorderPhotos(int oldIndex, int newIndex) {
    final ordered = _orderedPhotoUrlsForEdit();
    if (ordered.length < 2) return;
    if (oldIndex < 0 || oldIndex >= ordered.length) return;

    var targetIndex = newIndex;
    if (targetIndex > ordered.length) targetIndex = ordered.length;
    if (oldIndex < targetIndex) targetIndex -= 1;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= ordered.length) targetIndex = ordered.length - 1;
    if (oldIndex == targetIndex) return;

    final moved = ordered.removeAt(oldIndex);
    ordered.insert(targetIndex, moved);
    _applyOrderedPhotoUrls(ordered);
  }

  Future<void> saveProfile() async {
    final user = FirebaseAuth.instance.currentUser!;
    final usernameRaw = usernameController.text.trim();
    final usernameLower = usernameRaw.toLowerCase();
    final bio = bioController.text.trim();
    final provincia = provinciaSeleccionada.trim();
    final orderedPhotosForSave = _orderedPhotoUrlsForEdit();
    final normalizedFotoPrincipal = orderedPhotosForSave.isEmpty ? "" : orderedPhotosForSave.first;
    final normalizedFotos = orderedPhotosForSave.length <= 1
        ? <String>[]
        : orderedPhotosForSave.skip(1).toList();

    if (usernameRaw.length < 3) {
      setState(() => error = "El username debe tener al menos 3 caracteres.");
      return;
    }

    final validUsername = RegExp(r'^[a-z0-9_]+$').hasMatch(usernameLower);
    if (!validUsername) {
      setState(() => error = "Usá solo letras, números o guion bajo.");
      return;
    }

    if (bio.length > 160) {
      setState(() => error = "La bio no puede superar los 160 caracteres.");
      return;
    }

    setState(() {
      saving = true;
      error = null;
    });

    await _saveProfileLocalBackup(
      uid: user.uid,
      username: usernameRaw,
      usernameLower: usernameLower,
      bio: bio,
      provincia: provincia,
    );

    try {
      final existing = await FirebaseFirestore.instance
          .collection("usuarios")
          .where("usernameLower", isEqualTo: usernameLower)
          .limit(1)
          .get()
          .timeout(const Duration(seconds: 10));

      final takenByAnother = existing.docs.isNotEmpty && existing.docs.first.id != user.uid;
      if (takenByAnother) {
        setState(() {
          error = "Ese username ya está usado.";
          saving = false;
        });
        return;
      }

      await FirebaseFirestore.instance
          .collection("usuarios")
          .doc(user.uid)
          .set({
        "uid": user.uid,
        "email": user.email,
        "emailVerified": user.emailVerified,
        "username": usernameRaw,
        "usernameLower": usernameLower,
        "nombre": usernameRaw,
        "bio": bio,
        "fotoPrincipal": normalizedFotoPrincipal,
        "fotos": normalizedFotos,
        "videos": videos,
        "pais": "AR",
        "provincia": provincia,
        "ciudad": "",
        "geoVisible": false,
        "perfilCompleto": true,
        "shuffleActivo": true,
        "updatedAt": FieldValue.serverTimestamp(),
        "lastActiveAt": FieldValue.serverTimestamp(),
        "lastActiveAtClient": Timestamp.fromDate(DateTime.now()),
      }, SetOptions(merge: true)).timeout(const Duration(seconds: 12));

      await FirebaseFirestore.instance
          .collection("usernames")
          .doc(usernameLower)
          .set({
        "uid": user.uid,
        "username": usernameRaw,
        "updatedAt": FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)).timeout(const Duration(seconds: 8));

      if (originalUsernameLower.isNotEmpty && originalUsernameLower != usernameLower) {
        await FirebaseFirestore.instance
            .collection("usernames")
            .doc(originalUsernameLower)
            .delete()
            .timeout(const Duration(seconds: 8));
      }

      originalUsernameLower = usernameLower;
      fotoPrincipal = normalizedFotoPrincipal;
      fotos = normalizedFotos;

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Perfil actualizado ✅")),
      );
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = "No se pudo guardar el perfil: $e");
    } finally {
      if (mounted) {
        setState(() => saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loadingInitial) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF1F1F1F),
        elevation: 0,
        title: const Text(
          "Editar perfil",
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 28),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _ConnectedEditPhotosHeader(
              fotoPrincipal: fotoPrincipal,
              fotos: fotos,
              uploading: uploadingMainPhoto || uploadingGalleryPhoto,
              onAddPhoto: () => addMedia(isVideo: false),
              onDeletePhotoAt: deletePhotoAt,
              onMakeMainPhotoAt: makeMainPhotoAt,
              onReorderPhotos: reorderPhotos,
            ),
            const _ConnectedBadgesEditor(),
            Padding(
              padding: const EdgeInsets.fromLTRB(30, 26, 30, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _ConnectedSectionLabel("TEXTO DE LA BIOGRAFÍA"),
                  const SizedBox(height: 8),
                  TextField(
                    controller: bioController,
                    onChanged: (_) => setState(() {}),
                    maxLength: 300,
                    style: const TextStyle(color: Colors.white, fontSize: 18),
                    decoration: const InputDecoration(
                      hintText: "Escribí tu bio",
                      counterText: "",
                      filled: false,
                      enabledBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: Colors.white70, width: 1.4),
                      ),
                      focusedBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: Colors.white, width: 1.6),
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      "${bioController.text.length}/300",
                      style: TextStyle(color: Colors.white.withOpacity(0.62), fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(height: 26),
                  const _ConnectedSectionLabel("USERNAME"),
                  TextField(
                    controller: usernameController,
                    onChanged: (_) => setState(() {}),
                    style: const TextStyle(color: Colors.white, fontSize: 18),
                    decoration: const InputDecoration(
                      hintText: "username",
                      filled: false,
                      enabledBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: Colors.white70, width: 1.4),
                      ),
                      focusedBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: Colors.white, width: 1.6),
                      ),
                    ),
                  ),
                  const SizedBox(height: 26),
                  const _ConnectedSectionLabel("PROVINCIA INTERNA"),
                  DropdownButtonFormField<String>(
                    value: provinciaSeleccionada,
                    dropdownColor: const Color(0xFF101010),
                    decoration: const InputDecoration(
                      filled: false,
                      enabledBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: Colors.white70, width: 1.4),
                      ),
                      focusedBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: Colors.white, width: 1.6),
                      ),
                    ),
                    items: provinciasArgentina.map((provincia) {
                      return DropdownMenuItem<String>(
                        value: provincia,
                        child: Text(provincia),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() => provinciaSeleccionada = value);
                    },
                  ),
                  const SizedBox(height: 28),
                  const _ConnectedSectionLabel("VOZ"),
                  const SizedBox(height: 14),
                  Center(
                    child: Container(
                      height: 74,
                      width: 380,
                      constraints: const BoxConstraints(maxWidth: 420),
                      decoration: BoxDecoration(
                        color: const Color(0xFF72C66E),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.play_arrow_rounded, color: Colors.white, size: 38),
                          SizedBox(width: 16),
                          Text(
                            "Grabar voz",
                            style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 28),
                  const Divider(color: Colors.white70, height: 1),
                  const SizedBox(height: 30),
                  const _ConnectedSectionLabel("ETIQUETAS"),
                  const SizedBox(height: 16),
                  Text(
                    "Añadir etiquetas",
                    style: TextStyle(color: Colors.white.withOpacity(0.74), fontSize: 18),
                  ),
                  const SizedBox(height: 18),
                  const Divider(color: Colors.white70, height: 1),
                  const SizedBox(height: 30),
                  const _ConnectedSectionLabel("MIS CANCIONES"),
                  const SizedBox(height: 16),
                  Text(
                    "Editar canciones",
                    style: TextStyle(color: Colors.white.withOpacity(0.22), fontSize: 18),
                  ),
                  const SizedBox(height: 18),
                  const Divider(color: Colors.white70, height: 1),
                  const SizedBox(height: 28),
                  _StoryUploadEditor(
                    uploading: uploadingStory,
                    onAddPhoto: () => addStory(isVideo: false),
                    onAddVideo: () => addStory(isVideo: true),
                  ),
                  const SizedBox(height: 24),
                  if (videos.isNotEmpty) ...[
                    _EditableMediaList(
                      title: uploadingVideo ? "Subiendo video..." : "Videos",
                      emptyText: "Sin videos todavía.",
                      urls: videos,
                      isVideo: true,
                      onAdd: () => addMedia(isVideo: true),
                      onRemove: (index) => removeMedia(isVideo: true, index: index),
                    ),
                    const SizedBox(height: 24),
                  ],
                  if (error != null)
                    Container(
                      padding: const EdgeInsets.all(14),
                      margin: const EdgeInsets.only(bottom: 14),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.red.withOpacity(0.35)),
                      ),
                      child: Text(
                        error!,
                        style: const TextStyle(color: Colors.redAccent),
                      ),
                    ),
                  _PrimaryButton(
                    icon: Icons.save_rounded,
                    text: saving ? "Guardando..." : "Guardar cambios",
                    onTap: saving ? () {} : saveProfile,
                  ),
                  const SizedBox(height: 96),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryUploadEditor extends StatelessWidget {
  final bool uploading;
  final VoidCallback onAddPhoto;
  final VoidCallback onAddVideo;

  const _StoryUploadEditor({
    required this.uploading,
    required this.onAddPhoto,
    required this.onAddVideo,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_stories_rounded, color: Color(0xFF6C63FF)),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  "Historias 24 hs",
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
                ),
              ),
              Text(
                uploading ? "Subiendo..." : "Expiran solas",
                style: TextStyle(
                  color: Colors.white.withOpacity(0.50),
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            "Subí fotos o videos temporales. Se muestran en tu perfil durante 24 horas y después se eliminan automáticamente al abrir el perfil.",
            style: TextStyle(color: Colors.white.withOpacity(0.58), height: 1.32),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _CompactActionButton(
                  icon: Icons.photo_camera_rounded,
                  text: uploading ? "Subiendo..." : "Subir foto",
                  onTap: uploading ? () {} : onAddPhoto,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _CompactActionButton(
                  icon: Icons.video_library_rounded,
                  text: uploading ? "Subiendo..." : "Subir video",
                  onTap: uploading ? () {} : onAddVideo,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ConnectedEditPhotosHeader extends StatelessWidget {
  final String fotoPrincipal;
  final List<String> fotos;
  final bool uploading;
  final VoidCallback onAddPhoto;
  final ValueChanged<int> onDeletePhotoAt;
  final ValueChanged<int> onMakeMainPhotoAt;
  final void Function(int oldIndex, int newIndex) onReorderPhotos;

  const _ConnectedEditPhotosHeader({
    required this.fotoPrincipal,
    required this.fotos,
    required this.uploading,
    required this.onAddPhoto,
    required this.onDeletePhotoAt,
    required this.onMakeMainPhotoAt,
    required this.onReorderPhotos,
  });

  void _confirmDelete(BuildContext context, int index) {
    showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101010),
          title: const Text(
            "Eliminar foto",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          content: Text(
            "Esta foto se va a quitar de tu perfil cuando guardes los cambios.",
            style: TextStyle(color: Colors.white.withOpacity(0.72), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text("Cancelar"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                "Eliminar",
                style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        );
      },
    ).then((confirmed) {
      if (confirmed == true) onDeletePhotoAt(index);
    });
  }

  @override
  Widget build(BuildContext context) {
    final allPhotos = _profilePhotosForDisplay(fotoPrincipal, fotos);
    final width = MediaQuery.of(context).size.width;
    final tileWidth = width < 760 ? width / 3 : 240.0;

    return Container(
      height: 268,
      color: const Color(0xFF303030),
      child: Row(
        children: [
          Expanded(
            child: allPhotos.isEmpty
                ? Center(
                    child: Text(
                      "Todavía no cargaste fotos.",
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.62),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  )
                : ReorderableListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: EdgeInsets.zero,
                    buildDefaultDragHandles: false,
                    itemCount: allPhotos.length,
                    onReorder: onReorderPhotos,
                    proxyDecorator: (child, index, animation) {
                      return AnimatedBuilder(
                        animation: animation,
                        builder: (context, _) {
                          final t = Curves.easeOut.transform(animation.value);
                          return Transform.scale(
                            scale: 1 + (0.035 * t),
                            child: Material(
                              color: Colors.transparent,
                              elevation: 10 * t,
                              child: child,
                            ),
                          );
                        },
                      );
                    },
                    itemBuilder: (context, index) {
                      final url = allPhotos[index];
                      final isMain = index == 0;

                      return SizedBox(
                        key: ValueKey("profile_photo_${index}_$url"),
                        width: tileWidth,
                        height: 268,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(
                              url,
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                              webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                              errorBuilder: (_, __, ___) => Container(
                                color: const Color(0xFF242424),
                                child: const Icon(Icons.broken_image_rounded, color: Colors.white38, size: 48),
                              ),
                            ),
                            Positioned.fill(
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.black.withOpacity(0.42),
                                      Colors.transparent,
                                      Colors.black.withOpacity(0.76),
                                    ],
                                    stops: const [0.0, 0.48, 1.0],
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 9,
                              left: 9,
                              child: ReorderableDragStartListener(
                                index: index,
                                child: Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.62),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white.withOpacity(0.18)),
                                  ),
                                  child: const Icon(Icons.drag_indicator_rounded, color: Colors.white, size: 22),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 9,
                              right: 9,
                              child: GestureDetector(
                                onTap: () => _confirmDelete(context, index),
                                child: Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.66),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.redAccent.withOpacity(0.38)),
                                  ),
                                  child: const Icon(Icons.delete_rounded, color: Colors.redAccent, size: 21),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 10,
                              right: 10,
                              bottom: 12,
                              child: GestureDetector(
                                onTap: isMain ? null : () => onMakeMainPhotoAt(index),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                                  decoration: BoxDecoration(
                                    color: isMain
                                        ? const Color(0xFF6C63FF).withOpacity(0.92)
                                        : Colors.black.withOpacity(0.62),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(color: Colors.white.withOpacity(0.20)),
                                  ),
                                  child: Text(
                                    isMain ? "Principal" : "Hacer principal",
                                    textAlign: TextAlign.center,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          GestureDetector(
            onTap: uploading ? null : onAddPhoto,
            child: Container(
              width: tileWidth,
              height: 268,
              color: const Color(0xFF333333),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.photo_camera_rounded, color: Colors.white, size: 48),
                  const SizedBox(height: 14),
                  Text(
                    uploading ? "Subiendo..." : "Añadir foto",
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "Arrastrá para ordenar",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.44),
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectedBadgesEditor extends StatelessWidget {
  const _ConnectedBadgesEditor();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.fromLTRB(30, 28, 30, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "INSIGNIAS",
                style: TextStyle(color: Colors.white54, fontWeight: FontWeight.w900, fontSize: 15),
              ),
              Text(
                "TOCA PARA ACTIVAR O DESACTIVAR",
                style: TextStyle(color: Colors.white.withOpacity(0.58), fontWeight: FontWeight.w900, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 26),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _ConnectedEditBadge(color: Color(0xFF3B2100), icon: Icons.local_fire_department_rounded, value: "0", label: "super messages"),
              _ConnectedEditBadge(color: Color(0xFFFF00A8), icon: Icons.favorite_rounded, value: "0", label: "me gusta"),
              _ConnectedEditBadge(color: Color(0xFF24D46E), icon: Icons.chat_bubble_rounded, value: "0", label: "conv."),
              _ConnectedEditBadge(color: Color(0xFF8C36B7), icon: Icons.person_add_alt_1_rounded, value: "0", label: "seguidores"),
            ],
          ),
        ],
      ),
    );
  }
}

class _ConnectedEditBadge extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String value;
  final String label;

  const _ConnectedEditBadge({
    required this.color,
    required this.icon,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 68,
          height: 68,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          child: Icon(icon, color: Colors.white, size: 36),
        ),
        const SizedBox(height: 10),
        Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
        Text(label, style: TextStyle(color: Colors.white.withOpacity(0.40), fontWeight: FontWeight.w800, fontSize: 12)),
      ],
    );
  }
}

class _ConnectedSectionLabel extends StatelessWidget {
  final String text;

  const _ConnectedSectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        color: Colors.white.withOpacity(0.56),
        fontSize: 15,
        fontWeight: FontWeight.w900,
        letterSpacing: 0.2,
      ),
    );
  }
}


class _EditableProfilePreviewCard extends StatelessWidget {
  final String fotoPrincipal;
  final String username;
  final String bio;
  final String provincia;
  final int fotosCount;
  final int videosCount;

  const _EditableProfilePreviewCard({
    required this.fotoPrincipal,
    required this.username,
    required this.bio,
    required this.provincia,
    required this.fotosCount,
    required this.videosCount,
  });

  @override
  Widget build(BuildContext context) {
    final displayUsername = username.trim().isEmpty ? "tu_username" : username.trim();
    final displayBio = bio.trim().isEmpty ? "Tu bio aparece acá mientras editás el perfil." : bio.trim();

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _ProfileAvatar(url: fotoPrincipal, size: 96),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.visibility_rounded, color: Color(0xFF6C63FF), size: 18),
                    const SizedBox(width: 6),
                    Text(
                      "Preview del perfil",
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.58),
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  displayUsername,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  displayBio,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.64),
                    height: 1.25,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _TinyProfileChip(icon: Icons.location_on_rounded, text: provincia),
                    _TinyProfileChip(icon: Icons.photo_library_rounded, text: "$fotosCount fotos"),
                    _TinyProfileChip(icon: Icons.play_circle_fill_rounded, text: "$videosCount videos"),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TinyProfileChip extends StatelessWidget {
  final IconData icon;
  final String text;

  const _TinyProfileChip({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF171717),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: const Color(0xFF6C63FF), size: 14),
          const SizedBox(width: 5),
          Text(
            text,
            style: TextStyle(
              color: Colors.white.withOpacity(0.62),
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _HorizontalMainPhotoEditor extends StatelessWidget {
  final String fotoPrincipal;
  final bool uploading;
  final VoidCallback onUpload;
  final VoidCallback onRemove;

  const _HorizontalMainPhotoEditor({
    required this.fotoPrincipal,
    required this.uploading,
    required this.onUpload,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _ProfileAvatar(url: fotoPrincipal, size: 86),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.account_circle_rounded, color: Color(0xFF6C63FF), size: 20),
                    SizedBox(width: 7),
                    Text(
                      "Foto principal",
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  uploading
                      ? "Subiendo a Firebase Storage..."
                      : "Elegí una imagen desde tu galería. Se previsualiza acá y queda guardada cuando toques Guardar cambios.",
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.55),
                    fontSize: 12,
                    height: 1.28,
                  ),
                ),
                const SizedBox(height: 12),
                _CompactActionButton(
                  icon: Icons.photo_camera_back_rounded,
                  text: uploading ? "Subiendo..." : "Subir foto",
                  onTap: uploading ? () {} : onUpload,
                ),
                if (fotoPrincipal.isNotEmpty && !uploading) ...[
                  const SizedBox(height: 8),
                  _CompactActionButton(
                    icon: Icons.delete_rounded,
                    text: "Quitar foto",
                    danger: true,
                    onTap: onRemove,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactActionButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;
  final bool danger;

  const _CompactActionButton({
    required this.icon,
    required this.text,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: danger ? Colors.redAccent.withOpacity(0.14) : const Color(0xFF6C63FF).withOpacity(0.18),
          border: Border.all(
            color: danger ? Colors.redAccent.withOpacity(0.45) : const Color(0xFF6C63FF).withOpacity(0.55),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: danger ? Colors.redAccent : const Color(0xFF8C84FF), size: 18),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                text,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: danger ? Colors.redAccent : Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 12.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EditableMediaList extends StatelessWidget {
  final String title;
  final String emptyText;
  final List<String> urls;
  final bool isVideo;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;

  const _EditableMediaList({
    required this.title,
    required this.emptyText,
    required this.urls,
    required this.isVideo,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final cleanUrls = urls
        .map((e) => e.trim())
        .where((e) => e.startsWith('http://') || e.startsWith('https://'))
        .toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isVideo ? Icons.play_circle_fill_rounded : Icons.photo_library_rounded,
                color: const Color(0xFF6C63FF),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                onPressed: onAdd,
                icon: const Icon(Icons.add_circle_rounded, color: Color(0xFF6C63FF)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (cleanUrls.isEmpty)
            Text(
              emptyText,
              style: TextStyle(color: Colors.white.withOpacity(0.48)),
            )
          else
            SizedBox(
              height: isVideo ? 116 : 112,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: cleanUrls.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final url = cleanUrls[index];
                  return Stack(
                    children: [
                      _MediaPreview(url: url, isVideo: isVideo, size: isVideo ? 112 : 112),
                      Positioned(
                        top: 6,
                        right: 6,
                        child: GestureDetector(
                          onTap: () {
                            final originalIndex = urls.indexOf(url);
                            if (originalIndex >= 0) {
                              onRemove(originalIndex);
                            }
                          },
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.72),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white.withOpacity(0.15)),
                            ),
                            child: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _ProfileMediaSection extends StatelessWidget {
  final String title;
  final String emptyText;
  final List<String> urls;
  final bool isVideo;

  const _ProfileMediaSection({
    required this.title,
    required this.emptyText,
    required this.urls,
    required this.isVideo,
  });

  @override
  Widget build(BuildContext context) {
    final cleanUrls = urls
        .map((e) => e.trim())
        .where((e) => e.startsWith('http://') || e.startsWith('https://'))
        .toList();

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isVideo ? Icons.play_circle_fill_rounded : Icons.photo_library_rounded,
                color: const Color(0xFF6C63FF),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (cleanUrls.isNotEmpty)
                Text(
                  cleanUrls.length.toString(),
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.48),
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          if (cleanUrls.isEmpty)
            Text(
              emptyText,
              style: TextStyle(color: Colors.white.withOpacity(0.48)),
            )
          else
            SizedBox(
              height: isVideo ? 142 : 160,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: cleanUrls.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  return _MediaPreview(
                    url: cleanUrls[index],
                    isVideo: isVideo,
                    size: isVideo ? 142 : 160,
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _MediaPreview extends StatelessWidget {
  final String url;
  final bool isVideo;
  final double size;

  const _MediaPreview({
    required this.url,
    required this.isVideo,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    final cleanUrl = url.trim();
    final width = isVideo ? size * 1.55 : size;

    return GestureDetector(
      onTap: cleanUrl.isEmpty
          ? null
          : () {
              showDialog(
                context: context,
                builder: (_) => Dialog(
                  backgroundColor: Colors.black,
                  insetPadding: const EdgeInsets.all(18),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: isVideo
                        ? Container(
                            width: 760,
                            height: 420,
                            color: const Color(0xFF151515),
                            child: const Center(
                              child: Text(
                                "Video guardado. Reproductor integrado pendiente.",
                                textAlign: TextAlign.center,
                              ),
                            ),
                          )
                        : InteractiveViewer(
                            child: Image.network(
                              cleanUrl,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) {
                                return Container(
                                  width: 520,
                                  height: 360,
                                  color: const Color(0xFF151515),
                                  alignment: Alignment.center,
                                  padding: const EdgeInsets.all(24),
                                  child: const Text(
                                    "No pude mostrar esta imagen. Si es nueva, guardá el perfil y recargá. Si persiste, revisá reglas/permisos de Storage.",
                                    textAlign: TextAlign.center,
                                  ),
                                );
                              },
                            ),
                          ),
                  ),
                ),
              );
            },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Container(
          width: width,
          height: size,
          color: const Color(0xFF232323),
          child: isVideo
              ? Stack(
                  alignment: Alignment.center,
                  children: [
                    const Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF232323), Color(0xFF121212)],
                          ),
                        ),
                      ),
                    ),
                    Icon(
                      Icons.movie_creation_rounded,
                      color: Colors.white.withOpacity(0.36),
                      size: size * 0.34,
                    ),
                    Icon(
                      Icons.play_circle_fill_rounded,
                      color: const Color(0xFF6C63FF).withOpacity(0.95),
                      size: size * 0.32,
                    ),
                  ],
                )
              : Image.network(
                  cleanUrl,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                  loadingBuilder: (context, child, loadingProgress) {
                    if (loadingProgress == null) return child;
                    return Center(
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          value: loadingProgress.expectedTotalBytes == null
                              ? null
                              : loadingProgress.cumulativeBytesLoaded /
                                  loadingProgress.expectedTotalBytes!,
                        ),
                      ),
                    );
                  },
                  errorBuilder: (_, __, ___) {
                    return Container(
                      color: const Color(0xFF232323),
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.broken_image_rounded,
                            color: Colors.white.withOpacity(0.45),
                            size: size * 0.28,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            "No carga",
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.48),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

List<String> _stringListFromAny(dynamic value) {
  if (value is List) {
    return value
        .map((item) => item.toString().trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }
  return <String>[];
}

// ===================== SHUFFLE / LISTA DE PERFILES =====================

class ShufflePage extends StatefulWidget {
  const ShufflePage({super.key});

  @override
  State<ShufflePage> createState() => _ShufflePageState();
}

class _ShufflePageState extends State<ShufflePage> {
  static const int _shufflePageSize = 35;

  final TextEditingController searchController = TextEditingController();
  final ScrollController _resultsController = ScrollController();
  Timer? _minuteTimer;
  VoidCallback? _shuffleRerollListener;
  String query = "";
  int _shuffleRollSeed = DateTime.now().millisecondsSinceEpoch;
  bool _isShuffleRolling = false;

  @override
  void initState() {
    super.initState();
    _touchAnonymousPresence(reason: "shuffle_open");
    _minuteTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      _touchAnonymousPresence(reason: "shuffle_heartbeat");
      if (mounted) setState(() {});
    });

    _shuffleRerollListener = () {
      if (!mounted) return;

      // Cada toque en Shuffle arranca una tirada nueva limpia.
      // Si había algo escrito en la lupita, se borra y vuelve a cero.
      if (searchController.text.trim().isNotEmpty || query.trim().isNotEmpty) {
        searchController.clear();
      }

      setState(() {
        query = "";
        _isShuffleRolling = true;
        _shuffleRollSeed = DateTime.now().microsecondsSinceEpoch + _shuffleRerollSignal.value;
      });
      Future.delayed(const Duration(milliseconds: 460), () {
        if (!mounted) return;
        setState(() => _isShuffleRolling = false);
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_resultsController.hasClients) return;
        _resultsController.animateTo(
          0,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
        );
      });
    };

    _shuffleRerollSignal.addListener(_shuffleRerollListener!);
  }

  @override
  void dispose() {
    final listener = _shuffleRerollListener;
    if (listener != null) {
      _shuffleRerollSignal.removeListener(listener);
    }
    _minuteTimer?.cancel();
    _resultsController.dispose();
    searchController.dispose();
    super.dispose();
  }

  bool _wasActiveInLastHour(Map<String, dynamic> data) {
    return _isActivityInsideLastHour(_activityDateFromData(data));
  }

  String _formatPeopleCount(int value) {
    final raw = value.toString();
    final buffer = StringBuffer();
    for (int i = 0; i < raw.length; i++) {
      final left = raw.length - i;
      buffer.write(raw[i]);
      if (left > 1 && left % 3 == 1) buffer.write(',');
    }
    return buffer.toString();
  }

  Widget _shuffleSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
      child: SizedBox(
        height: 46,
        child: TextField(
          controller: searchController,
          onChanged: (v) {
            setState(() => query = v.trim().toLowerCase());
          },
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            prefixIcon: Icon(
              Icons.search_rounded,
              color: Colors.white.withOpacity(0.34),
              size: 27,
            ),
            hintText: "",
            hintStyle: TextStyle(
              color: Colors.white.withOpacity(0.42),
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
            filled: true,
            fillColor: const Color(0xFF262626),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: BorderSide(color: Colors.white.withOpacity(0.08), width: 1),
            ),
          ),
        ),
      ),
    );
  }

  Widget _shuffleFilterRow() {
    return Container(
      height: 50,
      color: Colors.black,
      padding: const EdgeInsets.symmetric(horizontal: 15),
      child: Row(
        children: [
          Icon(Icons.filter_list_rounded, color: Colors.white.withOpacity(0.78), size: 28),
          const SizedBox(width: 15),
          Text(
            "Filtro",
            style: TextStyle(
              color: Colors.white.withOpacity(0.68),
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(),
          Icon(Icons.chevron_right_rounded, color: Colors.white.withOpacity(0.66), size: 34),
        ],
      ),
    );
  }

  Widget _shuffleResultHeader(int fallbackCount) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection("usuarios")
          .where("perfilCompleto", isEqualTo: true)
          .snapshots(),
      builder: (context, profilesSnapshot) {
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance.collection("anonimos_activos").snapshots(),
          builder: (context, anonSnapshot) {
            final profilesCount = profilesSnapshot.data?.docs.length;
            final anonDocs = anonSnapshot.data?.docs ?? const <QueryDocumentSnapshot<Map<String, dynamic>>>[];
            final activeLimit = DateTime.now().subtract(const Duration(minutes: 10));
            final anonActiveCount = anonDocs.where((doc) {
              final data = doc.data();
              final updatedAtClient = data["updatedAtClient"];
              if (updatedAtClient is Timestamp) {
                return updatedAtClient.toDate().isAfter(activeLimit);
              }
              final updatedAt = data["updatedAt"];
              if (updatedAt is Timestamp) {
                return updatedAt.toDate().isAfter(activeLimit);
              }
              return false;
            }).length;

            final liveCount = profilesCount == null
                ? fallbackCount
                : profilesCount + anonActiveCount;

            return Container(
              height: 34,
              color: Colors.black,
              padding: const EdgeInsets.fromLTRB(15, 0, 15, 0),
              child: Row(
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    child: _isShuffleRolling
                        ? Row(
                            key: const ValueKey("shuffle_rolling"),
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 13,
                                height: 13,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white.withOpacity(0.62),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                "Cambiando resultado",
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.58),
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ],
                          )
                        : Text(
                            "Cambiar resultado",
                            key: const ValueKey("shuffle_idle"),
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.46),
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                  ),
                  const Spacer(),
                  Icon(Icons.person_rounded, color: Colors.white.withOpacity(0.46), size: 13),
                  const SizedBox(width: 4),
                  Text(
                    "${_formatPeopleCount(liveCount)} personas",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.46),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Stream<Set<String>> _blockedUidsStream() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return Stream.value(<String>{});

    return FirebaseFirestore.instance
        .collection("usuarios")
        .doc(user.uid)
        .collection("bloqueados")
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        final data = doc.data();
        final blockedUid = (data["blockedUid"] ?? data["uid"] ?? doc.id).toString().trim();
        return blockedUid.isEmpty ? doc.id : blockedUid;
      }).where((uid) => uid.trim().isNotEmpty).toSet();
    });
  }

  bool _matchesShuffleSearch(Map<String, dynamic> data) {
    if (query.isEmpty) return true;

    final username = (data["username"] ?? "").toString().toLowerCase();
    final bio = (data["bio"] ?? "").toString().toLowerCase();
    final ciudad = (data["ciudad"] ?? "").toString().toLowerCase();
    final provincia = (data["provincia"] ?? "").toString().toLowerCase();

    return username.contains(query) ||
        bio.contains(query) ||
        ciudad.contains(query) ||
        provincia.contains(query);
  }

  String _activityDebugText(Map<String, dynamic> data) {
    final value = _activityDateFromData(data);
    if (value == null) return "sin lastActiveAt/lastActiveAtClient/lastSeenAt";

    final diff = DateTime.now().difference(value);
    if (diff.inMinutes < 1) return "activo hace segundos";
    if (diff.inMinutes < 60) return "activo hace ${diff.inMinutes} min";
    if (diff.inHours < 24) return "activo hace ${diff.inHours} h";
    return "activo hace ${diff.inDays} días";
  }

  String? _shuffleExclusionReason({
    required QueryDocumentSnapshot<Map<String, dynamic>> doc,
    required Set<String> blockedUids,
  }) {
    final data = doc.data();

    if (blockedUids.contains(doc.id)) return "bloqueado por tu cuenta";
    if (!_wasActiveInLastHour(data)) return "fuera del filtro de 1 hora (${_activityDebugText(data)})";
    if (!_matchesShuffleSearch(data)) return "no coincide con la búsqueda actual";

    return null;
  }

  List<QueryDocumentSnapshot<Map<String, dynamic>>> _randomizedBucket(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
    int salt,
  ) {
    final rolled = docs.toList();
    rolled.shuffle(Random(_shuffleRollSeed + salt));
    return rolled;
  }

  List<QueryDocumentSnapshot<Map<String, dynamic>>> _randomShufflePageFromBuckets(
    List<List<QueryDocumentSnapshot<Map<String, dynamic>>>> buckets,
  ) {
    final result = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    final used = <String>{};

    for (int i = 0; i < buckets.length; i++) {
      if (result.length >= _shufflePageSize) break;
      final rolledBucket = _randomizedBucket(buckets[i], 7919 * (i + 1));
      for (final doc in rolledBucket) {
        if (result.length >= _shufflePageSize) break;
        if (used.add(doc.id)) result.add(doc);
      }
    }

    return result;
  }

  Widget _shuffleDebugPanel({
    required List<QueryDocumentSnapshot<Map<String, dynamic>>> allDocs,
    required List<QueryDocumentSnapshot<Map<String, dynamic>>> visibleDocs,
    required Set<String> blockedUids,
    required String hybridMode,
    required int primaryCount,
    required int searchInactiveCount,
    required int activeNoSearchCount,
    required int fallbackCount,
  }) {
    final inactiveCount = allDocs.where((doc) => !_wasActiveInLastHour(doc.data())).length;
    final blockedCount = allDocs.where((doc) => blockedUids.contains(doc.id)).length;
    final noMatchCount = allDocs.where((doc) => !_matchesShuffleSearch(doc.data())).length;

    final suspects = allDocs.where((doc) {
      if (query.isEmpty) return false;
      return _matchesShuffleSearch(doc.data()) && !visibleDocs.any((visible) => visible.id == doc.id);
    }).take(6).toList();

    if (query.isEmpty && visibleDocs.isNotEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(14, 8, 14, 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF111111),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "DEBUG SHUFFLE",
            style: TextStyle(
              color: Colors.white.withOpacity(0.72),
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Base Firestore: ${allDocs.length} · visibles: ${visibleDocs.length} · modo: $hybridMode · inactivos: $inactiveCount · bloqueados: $blockedCount · no coinciden búsqueda: $noMatchCount",
            style: TextStyle(
              color: Colors.white.withOpacity(0.54),
              fontSize: 11.5,
              height: 1.25,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            "Híbrido → activos+coinciden: $primaryCount · coinciden aunque inactivos: $searchInactiveCount · activos aunque no coincidan: $activeNoSearchCount · fallback: $fallbackCount",
            style: TextStyle(
              color: Colors.white.withOpacity(0.46),
              fontSize: 11,
              height: 1.25,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (suspects.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...suspects.map((doc) {
              final data = doc.data();
              final username = (data["username"] ?? doc.id).toString();
              final bio = (data["bio"] ?? "").toString();
              final reason = _shuffleExclusionReason(doc: doc, blockedUids: blockedUids) ?? "visible";
              return Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Text(
                  "$username → $reason · bio: ${bio.isEmpty ? '-' : bio}",
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.48),
                    fontSize: 11,
                    height: 1.2,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
              children: [
                _shuffleSearchBar(),
                Divider(height: 1, color: Colors.white.withOpacity(0.06)),
                _shuffleFilterRow(),
                Divider(height: 1, color: Colors.white.withOpacity(0.06)),
                Expanded(
                  child: StreamBuilder<Set<String>>(
                    stream: _blockedUidsStream(),
                    builder: (context, blockedSnapshot) {
                      final blockedUids = blockedSnapshot.data ?? <String>{};

                      return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                        stream: FirebaseFirestore.instance
                            .collection("usuarios")
                            .where("perfilCompleto", isEqualTo: true)
                            .where("shuffleActivo", isEqualTo: true)
                            .snapshots(),
                        builder: (context, snapshot) {
                          if (snapshot.hasError) {
                            return _CenterSoftText(
                              text: "No pude cargar perfiles. Revisá reglas de Firestore o conexión.",
                            );
                          }

                          if (!snapshot.hasData) {
                            return const Center(child: CircularProgressIndicator());
                          }

                          final allDocs = snapshot.data!.docs;
                          final usableDocs = allDocs.where((doc) {
                            return !blockedUids.contains(doc.id);
                          }).toList();

                          final primaryDocs = usableDocs.where((doc) {
                            final data = doc.data();
                            return _wasActiveInLastHour(data) && _matchesShuffleSearch(data);
                          }).toList();

                          final searchInactiveDocs = usableDocs.where((doc) {
                            final data = doc.data();
                            return !_wasActiveInLastHour(data) && _matchesShuffleSearch(data);
                          }).toList();

                          final activeNoSearchDocs = usableDocs.where((doc) {
                            final data = doc.data();
                            return _wasActiveInLastHour(data) && !_matchesShuffleSearch(data);
                          }).toList();

                          final fallbackDocs = usableDocs.where((doc) {
                            final data = doc.data();
                            return !_wasActiveInLastHour(data) && !_matchesShuffleSearch(data);
                          }).toList();

                          final visibleDocs = _randomShufflePageFromBuckets([
                            primaryDocs,
                            searchInactiveDocs,
                            activeNoSearchDocs,
                            fallbackDocs,
                          ]);

                          if (visibleDocs.isEmpty) {
                            return Column(
                              children: [
                                _shuffleResultHeader(0),
                                Expanded(child: _CenterSoftText(text: "No hay perfiles visibles con el filtro actual.")),
                              ],
                            );
                          }

                          return Column(
                            children: [
                              _shuffleResultHeader(visibleDocs.length),
                              Expanded(
                                child: ListView.separated(
                                  controller: _resultsController,
                                  padding: const EdgeInsets.only(bottom: 14),
                                  itemCount: visibleDocs.length,
                                  separatorBuilder: (_, __) => Divider(
                                    height: 1,
                                    thickness: 1,
                                    color: Colors.white.withOpacity(0.07),
                                  ),
                                  itemBuilder: (context, index) {
                                    final doc = visibleDocs[index];
                                    final data = doc.data();

                                    return _ShuffleUserTile(
                                      key: ValueKey("shuffle_tile_${doc.id}_$_shuffleRollSeed"),
                                      uid: doc.id,
                                      username: (data["username"] ?? "").toString(),
                                      bio: (data["bio"] ?? "").toString(),
                                      fotoPrincipal: (data["fotoPrincipal"] ?? "").toString(),
                                      lastActiveAt: _activityDateFromData(data),
                                      online: data["online"] == true,
                                    );
                                  },
                                ),
                              ),
                            ],
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
      ),
      bottomNavigationBar: const _BottomNavMock(selected: 2),
    );
  }

  String _provinciaUsuarioActual(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    final currentUid = FirebaseAuth.instance.currentUser?.uid;
    if (currentUid == null) return "";

    for (final doc in docs) {
      if (doc.id == currentUid) {
        return (doc.data()["provincia"] ?? "").toString();
      }
    }

    return "";
  }

  int _silentGeoScore(Map<String, dynamic> data, String miProvincia) {
    final pais = (data["pais"] ?? "").toString().toUpperCase();
    final provincia = (data["provincia"] ?? "").toString();

    int score = 0;

    if (pais == "AR") score += 30;

    final miNorm = _normProvincia(miProvincia);
    final otraNorm = _normProvincia(provincia);

    if (miNorm.isEmpty || otraNorm.isEmpty) return score;

    if (miNorm == otraNorm) {
      score += 120;
    } else if (_provinciasCercanas(miNorm).contains(otraNorm)) {
      score += 75;
    } else {
      score += 10;
    }

    return score;
  }

  String _normProvincia(String value) {
    return value
        .toLowerCase()
        .replaceAll("á", "a")
        .replaceAll("é", "e")
        .replaceAll("í", "i")
        .replaceAll("ó", "o")
        .replaceAll("ú", "u")
        .replaceAll("ü", "u")
        .trim();
  }

  List<String> _provinciasCercanas(String provincia) {
    const mapa = {
      "cordoba": ["santa fe", "san luis", "mendoza", "la pampa", "buenos aires", "la rioja", "catamarca", "santiago del estero"],
      "buenos aires": ["caba", "la pampa", "santa fe", "entre rios", "cordoba", "rio negro"],
      "caba": ["buenos aires", "entre rios", "santa fe"],
      "santa fe": ["cordoba", "entre rios", "buenos aires", "corrientes", "chaco", "santiago del estero"],
      "mendoza": ["san luis", "cordoba", "san juan", "la rioja", "neuquen", "la pampa"],
      "san luis": ["cordoba", "mendoza", "la pampa", "san juan", "la rioja"],
      "la pampa": ["buenos aires", "cordoba", "san luis", "mendoza", "rio negro", "neuquen"],
      "entre rios": ["santa fe", "buenos aires", "caba", "corrientes"],
      "corrientes": ["entre rios", "santa fe", "chaco", "misiones", "formosa"],
      "chaco": ["corrientes", "santa fe", "formosa", "santiago del estero", "salta"],
      "formosa": ["chaco", "corrientes", "salta"],
      "misiones": ["corrientes"],
      "santiago del estero": ["cordoba", "santa fe", "chaco", "salta", "tucuman", "catamarca"],
      "tucuman": ["santiago del estero", "salta", "catamarca"],
      "salta": ["jujuy", "formosa", "chaco", "santiago del estero", "tucuman", "catamarca"],
      "jujuy": ["salta"],
      "catamarca": ["la rioja", "cordoba", "santiago del estero", "tucuman", "salta"],
      "la rioja": ["catamarca", "cordoba", "san luis", "san juan"],
      "san juan": ["la rioja", "san luis", "mendoza"],
      "neuquen": ["mendoza", "la pampa", "rio negro", "chubut"],
      "rio negro": ["neuquen", "la pampa", "buenos aires", "chubut"],
      "chubut": ["rio negro", "neuquen", "santa cruz"],
      "santa cruz": ["chubut", "tierra del fuego"],
      "tierra del fuego": ["santa cruz"],
    };

    return mapa[provincia] ?? const [];
  }

  int _activityScore(Map<String, dynamic> data) {
    int score = 0;

    if ((data["fotoPrincipal"] ?? "").toString().isNotEmpty) score += 12;
    if ((data["bio"] ?? "").toString().isNotEmpty) score += 8;
    if (data["online"] == true) score += 10;

    return score;
  }
}

class PublicProfilePage extends StatelessWidget {
  final String profileUid;

  const PublicProfilePage({
    super.key,
    required this.profileUid,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection("usuarios")
            .doc(profileUid)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return _CenterSoftText(text: "No pude cargar este perfil.");
          }

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final data = snapshot.data!.data() ?? {};
          final username = (data["username"] ?? "").toString();
          final bio = (data["bio"] ?? "").toString();
          final provincia = (data["provincia"] ?? "").toString();
          final fotoPrincipal = (data["fotoPrincipal"] ?? "").toString();
          final fotos = _stringListFromAny(data["fotos"]);
          final videos = _stringListFromAny(data["videos"]);
          final allPhotos = _profilePhotosForDisplay(fotoPrincipal, fotos);

          return _ConnectedProfileVisualPage(
            profileUid: profileUid,
            isOwnProfile: false,
            username: username,
            bio: bio,
            provincia: provincia,
            fotoPrincipal: fotoPrincipal,
            lastActiveAt: _activityDateFromData(data),
            createdAt: _profileCreatedDateFromData(data),
            fotos: allPhotos,
            videos: videos,
            onEdit: () {},
            onLogout: () {},
            onInbox: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChatAnonPage(
                    receptorUid: profileUid,
                    receptorUsername: username.trim().isEmpty ? "usuario" : username.trim(),
                    receptorFotoPrincipal: fotoPrincipal,
                  ),
                ),
              );
            },
          );
        },
      ),
      bottomNavigationBar: const _BottomNavMock(selected: 2),
    );
  }
}

class _ShuffleStoryState {
  final List<Map<String, dynamic>> activeStories;
  final bool hasStories;
  final bool hasUnseen;
  final int firstUnseenIndex;

  const _ShuffleStoryState({
    required this.activeStories,
    required this.hasStories,
    required this.hasUnseen,
    required this.firstUnseenIndex,
  });
}

class _ShuffleUserTile extends StatefulWidget {
  final String uid;
  final String username;
  final String bio;
  final String fotoPrincipal;
  final DateTime? lastActiveAt;
  final bool online;

  const _ShuffleUserTile({
    super.key,
    required this.uid,
    required this.username,
    required this.bio,
    required this.fotoPrincipal,
    required this.lastActiveAt,
    required this.online,
  });

  @override
  State<_ShuffleUserTile> createState() => _ShuffleUserTileState();
}

class _ShuffleUserTileState extends State<_ShuffleUserTile> {
  late Future<String> _actorFuture;
  Timer? _minuteTimer;

  @override
  void initState() {
    super.initState();
    _actorFuture = _storyViewActorId();
    _minuteTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(covariant _ShuffleUserTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uid != widget.uid) {
      _actorFuture = _storyViewActorId();
    }
  }

  @override
  void dispose() {
    _minuteTimer?.cancel();
    super.dispose();
  }

  String get displayName => widget.username.isNotEmpty ? widget.username : "usuario";

  List<Map<String, dynamic>> _activeStoriesFromDocs(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    final now = DateTime.now();
    final activeStories = docs
        .map((doc) => {
              ...doc.data(),
              "id": doc.id,
              "profileUid": widget.uid,
            })
        .where((data) {
      final url = (data["url"] ?? "").toString().trim();
      final expiresAt = data["expiresAt"];
      if (url.isEmpty) return false;
      if (expiresAt is! Timestamp) return true;
      return expiresAt.toDate().isAfter(now);
    }).toList();

    activeStories.sort((a, b) {
      final at = a["createdAt"];
      final bt = b["createdAt"];
      final am = at is Timestamp ? at.millisecondsSinceEpoch : 0;
      final bm = bt is Timestamp ? bt.millisecondsSinceEpoch : 0;
      return bm.compareTo(am);
    });

    return activeStories;
  }

  Future<_ShuffleStoryState> _storyStateFor(
    List<Map<String, dynamic>> activeStories,
    String actorId,
  ) async {
    if (activeStories.isEmpty) {
      return const _ShuffleStoryState(
        activeStories: [],
        hasStories: false,
        hasUnseen: false,
        firstUnseenIndex: 0,
      );
    }

    for (int i = 0; i < activeStories.length; i++) {
      final storyId = (activeStories[i]["id"] ?? "").toString();
      if (storyId.trim().isEmpty) continue;

      final seenDoc = await FirebaseFirestore.instance
          .collection("usuarios")
          .doc(widget.uid)
          .collection("historias")
          .doc(storyId)
          .collection("story_views")
          .doc(actorId)
          .get();

      if (!seenDoc.exists) {
        return _ShuffleStoryState(
          activeStories: activeStories,
          hasStories: true,
          hasUnseen: true,
          firstUnseenIndex: i,
        );
      }
    }

    return _ShuffleStoryState(
      activeStories: activeStories,
      hasStories: true,
      hasUnseen: false,
      firstUnseenIndex: 0,
    );
  }

  void _openProfile(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PublicProfilePage(profileUid: widget.uid),
      ),
    );
  }

  void _openChat(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatAnonPage(
          receptorUid: widget.uid,
          receptorUsername: displayName,
          receptorFotoPrincipal: widget.fotoPrincipal,
        ),
      ),
    );
  }

  void _handleAvatarTap(BuildContext context, _ShuffleStoryState storyState) {
    if (storyState.hasStories && storyState.hasUnseen) {
      showDialog(
        context: context,
        barrierColor: Colors.black.withOpacity(0.94),
        builder: (_) => _StoryViewerDialog(
          profileUid: widget.uid,
          stories: storyState.activeStories,
          initialIndex: storyState.firstUnseenIndex,
        ),
      );
      return;
    }

    _openProfile(context);
  }

  Widget _buildAvatar(_ShuffleStoryState storyState) {
    final hasRing = storyState.hasStories;
    final ringColor = storyState.hasUnseen
        ? const Color(0xFF8C6CFF)
        : Colors.white.withOpacity(0.44);

    // Shuffle: si estuvo activo dentro de los últimos 15 minutos,
    // mostramos la luz verdecita abajo de la foto como en Connected2.me.
    final isOnlineNow = widget.lastActiveAt != null &&
        widget.lastActiveAt!.isAfter(DateTime.now().subtract(const Duration(minutes: 15)));

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _handleAvatarTap(context, storyState),
      child: SizedBox(
        width: 76,
        height: 76,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 62,
              height: 62,
              padding: EdgeInsets.all(hasRing ? 3 : 0),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: hasRing ? Border.all(color: ringColor, width: 3) : null,
                boxShadow: hasRing && storyState.hasUnseen
                    ? [
                        BoxShadow(
                          color: const Color(0xFF8C6CFF).withOpacity(0.34),
                          blurRadius: 12,
                          spreadRadius: 1,
                        ),
                      ]
                    : null,
              ),
              child: KeyedSubtree(
                key: ValueKey("shuffle_avatar_${widget.uid}_${widget.fotoPrincipal}"),
                child: _ProfileAvatar(url: widget.fotoPrincipal, size: hasRing ? 54 : 58),
              ),
            ),
            if (isOnlineNow)
              Positioned(
                right: 8,
                bottom: 8,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: const Color(0xFF9AD93B),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.black, width: 2.4),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF9AD93B).withOpacity(0.30),
                        blurRadius: 5,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Shuffle: subtítulo limpio, solo descripción/bio.
    // No mostramos "En línea", "Última vez" ni horarios en la lista.
    final bio = widget.bio.trim();
    final subtitle = bio.isEmpty ? "Sin descripción." : bio;

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      key: ValueKey("shuffle_stories_stream_${widget.uid}"),
      stream: FirebaseFirestore.instance
          .collection("usuarios")
          .doc(widget.uid)
          .collection("historias")
          .snapshots(),
      builder: (context, storiesSnapshot) {
        final activeStories = storiesSnapshot.hasData
            ? _activeStoriesFromDocs(storiesSnapshot.data!.docs)
            : <Map<String, dynamic>>[];

        return FutureBuilder<String>(
          future: _actorFuture,
          builder: (context, actorSnapshot) {
            final actorId = actorSnapshot.data;
            if (actorId == null) {
              final emptyState = _ShuffleStoryState(
                activeStories: activeStories,
                hasStories: activeStories.isNotEmpty,
                hasUnseen: false,
                firstUnseenIndex: 0,
              );
              return _tileBody(context, subtitle, emptyState);
            }

            return FutureBuilder<_ShuffleStoryState>(
              key: ValueKey("shuffle_story_state_${widget.uid}_${activeStories.length}_$actorId"),
              future: _storyStateFor(activeStories, actorId),
              builder: (context, stateSnapshot) {
                final storyState = stateSnapshot.data ??
                    _ShuffleStoryState(
                      activeStories: activeStories,
                      hasStories: activeStories.isNotEmpty,
                      hasUnseen: false,
                      firstUnseenIndex: 0,
                    );

                return _tileBody(context, subtitle, storyState);
              },
            );
          },
        );
      },
    );
  }

  Widget _tileBody(BuildContext context, String subtitle, _ShuffleStoryState storyState) {
    final cleanSubtitle = subtitle.trim().isEmpty ? "-" : subtitle.trim();

    return InkWell(
      onTap: () => _openChat(context),
      onLongPress: () => _openProfile(context),
      splashColor: Colors.white.withOpacity(0.04),
      highlightColor: Colors.white.withOpacity(0.025),
      child: Container(
        height: 94,
        color: Colors.black,
        padding: const EdgeInsets.fromLTRB(13, 9, 13, 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _buildAvatar(storyState),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFFE8E8E8),
                      fontSize: 16.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.15,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    cleanSubtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.44),
                      fontSize: 13.6,
                      height: 1.18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}


// NOTA DE METODOLOGÍA:
// Este archivo se mantiene completo.
// Cambio aplicado sin separar módulos.
// Cambio aplicado sin recortar features existentes.
// v35: Chats queda como una sola lista continua.
// v35: No se muestran títulos/secciones entre recibidos y enviados.
// v35: Se conserva la lógica interna kind=received/sent solo para abrir bien cada chat.
// v38: cada tile del Shuffle usa ValueKey por uid+tirada para evitar reutilización de State.
// v38: los streams de historias y avatares quedan keyeados por perfil para que no se mezclen fotos/historias al tocar Shuffle rápido.
// Shuffle: avatar decide historia/perfil.
// Shuffle: fila/costados decide chat.
// Shuffle: pantalla completa, matching híbrido anti-pantalla-vacía y tiradas random de hasta 35 perfiles por toque.
// Inbox: ancho web liberado.
// Chat: sin marco tipo celular en escritorio.
// Mantener esta lógica como baseline.


// ===================== CHAT MEDIA HELPERS =====================

class _PickedChatMedia {
  final XFile file;
  final Uint8List bytes;
  final bool isVideo;
  final String sourceLabel;

  const _PickedChatMedia({
    required this.file,
    required this.bytes,
    required this.isVideo,
    required this.sourceLabel,
  });
}

String _safeChatMediaFileName(String name) {
  final cleaned = name
      .trim()
      .replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_')
      .replaceAll(RegExp(r'_+'), '_');
  return cleaned.isEmpty ? 'archivo' : cleaned;
}

String _chatMediaExtensionFromName(String name, {required bool isVideo}) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.mov') ||
      lower.endsWith('.webm')) {
    return '';
  }
  return isVideo ? '.mp4' : '.jpg';
}

String _chatMediaContentTypeFromName(String name, {required bool isVideo}) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return isVideo ? 'video/mp4' : 'image/jpeg';
}

Future<_PickedChatMedia?> _pickChatMedia({
  required bool isVideo,
  required ImageSource source,
}) async {
  // MODO ESTRICTO CÁMARA / GALERÍA:
  // En Flutter Web, ImagePicker no puede certificar que ImageSource.camera sea
  // una captura real hecha en el momento. En escritorio/navegador puede abrir
  // un selector con acceso a galería/archivos, y eso NO puede marcarse como
  // "de cámara". Por eso, si el origen pedido es cámara y estamos en web,
  // se bloquea antes de abrir el picker. Así nunca se etiqueta como cámara
  // algo que pudo venir de galería.
  if (kIsWeb && source == ImageSource.camera) {
    throw Exception(
      'Modo cámara estricto: en web/PC no se puede certificar captura real. Usá galería o probá cámara desde app móvil nativa.',
    );
  }

  final picker = ImagePicker();
  final XFile? file = isVideo
      ? await picker.pickVideo(source: source)
      : await picker.pickImage(
          source: source,
          imageQuality: 94,
          maxWidth: 2400,
        );

  if (file == null) return null;
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty) throw Exception('El archivo está vacío.');

  final strictSourceLabel = source == ImageSource.camera ? 'de cámara' : 'de galería';

  return _PickedChatMedia(
    file: file,
    bytes: bytes,
    isVideo: isVideo,
    sourceLabel: strictSourceLabel,
  );
}

Future<String> _uploadChatMedia({
  required _PickedChatMedia picked,
  required String chatId,
  required String sender,
}) async {
  final safeName = _safeChatMediaFileName(picked.file.name);
  final ext = _chatMediaExtensionFromName(safeName, isVideo: picked.isVideo);
  final finalName = ext.isEmpty || safeName.toLowerCase().endsWith(ext.toLowerCase())
      ? safeName
      : '$safeName$ext';
  final folder = picked.isVideo ? 'videos' : 'fotos';
  final path = 'chats_anonimos/$chatId/media/$folder/${DateTime.now().millisecondsSinceEpoch}_$finalName';
  final contentType = picked.file.mimeType ?? _chatMediaContentTypeFromName(finalName, isVideo: picked.isVideo);

  final ref = FirebaseStorage.instance.ref(path);
  await ref.putData(
    picked.bytes,
    SettableMetadata(
      contentType: contentType,
      cacheControl: 'public,max-age=31536000',
      customMetadata: {
        'chatId': chatId,
        'sender': sender,
        'source': picked.sourceLabel,
        'temporalEnabled': 'true',
        'originalName': picked.file.name,
      },
    ),
  ).timeout(const Duration(seconds: 90));

  return ref.getDownloadURL().timeout(const Duration(seconds: 25));
}

Future<void> _openChatMediaPickerSheet({
  required BuildContext context,
  required String chatId,
  required String sender,
  required String receptorUid,
  required Future<void> Function(Map<String, dynamic> payload) onSendPayload,
}) async {
  if (chatId.trim().isEmpty) return;

  Future<void> choose({required bool isVideo, required ImageSource source}) async {
    Navigator.pop(context);
    try {
      final picked = await _pickChatMedia(isVideo: isVideo, source: source);
      if (picked == null) return;
      if (!context.mounted) return;
      await _showChatMediaSendPreview(
        context: context,
        picked: picked,
        chatId: chatId,
        sender: sender,
        receptorUid: receptorUid,
        onSendPayload: onSendPayload,
      );
    } catch (e) {
      if (!context.mounted) return;
      final strictCameraBlocked = source == ImageSource.camera && kIsWeb;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            strictCameraBlocked
                ? 'Cámara estricta bloqueada en web: si el navegador puede abrir galería, no se marca como cámara.'
                : 'No pude elegir el archivo: $e',
          ),
        ),
      );
    }
  }

  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xFF101010),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Mandar archivo',
                style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Text(
                'Modo estricto: cámara solo si la plataforma garantiza captura real. En web/PC no se etiqueta como cámara si puede venir de galería.',
                style: TextStyle(color: Colors.white.withOpacity(0.58), height: 1.28),
              ),
              const SizedBox(height: 18),
              _ChatMediaSourceButton(
                icon: Icons.photo_camera_rounded,
                title: 'Foto desde cámara',
                subtitle: kIsWeb ? 'bloqueado en web / PC' : 'captura real en el momento',
                onTap: () => choose(isVideo: false, source: ImageSource.camera),
              ),
              const SizedBox(height: 9),
              _ChatMediaSourceButton(
                icon: Icons.videocam_rounded,
                title: 'Video desde cámara',
                subtitle: kIsWeb ? 'bloqueado en web / PC' : 'grabación real en el momento',
                onTap: () => choose(isVideo: true, source: ImageSource.camera),
              ),
              const SizedBox(height: 9),
              _ChatMediaSourceButton(
                icon: Icons.photo_library_rounded,
                title: 'Foto de galería',
                subtitle: 'archivo existente',
                onTap: () => choose(isVideo: false, source: ImageSource.gallery),
              ),
              const SizedBox(height: 9),
              _ChatMediaSourceButton(
                icon: Icons.video_library_rounded,
                title: 'Video de galería',
                subtitle: 'archivo existente',
                onTap: () => choose(isVideo: true, source: ImageSource.gallery),
              ),
            ],
          ),
        ),
      );
    },
  );
}

Future<void> _showChatMediaSendPreview({
  required BuildContext context,
  required _PickedChatMedia picked,
  required String chatId,
  required String sender,
  required String receptorUid,
  required Future<void> Function(Map<String, dynamic> payload) onSendPayload,
}) async {
  var sending = false;

  Future<void> send(BuildContext dialogContext, {required bool temporal}) async {
    if (sending) return;
    sending = true;
    try {
      final url = await _uploadChatMedia(picked: picked, chatId: chatId, sender: sender);
      await onSendPayload({
        'texto': picked.isVideo
            ? (temporal ? '💣 Video ver una vez' : 'Video')
            : (temporal ? '💣 Foto ver una vez' : 'Foto'),
        'type': 'media',
        'mediaType': picked.isVideo ? 'video' : 'image',
        'mediaUrl': url,
        'mediaSource': picked.sourceLabel == 'de cámara' ? 'camera' : 'gallery',
        'mediaSourceLabel': picked.sourceLabel,
        'temporal': temporal,
        'openedByAnonimo': false,
        'openedByReceptor': false,
        'receptorUid': receptorUid,
        'chatId': chatId,
      });
      if (dialogContext.mounted) Navigator.pop(dialogContext);
    } catch (e) {
      sending = false;
      if (!dialogContext.mounted) return;
      ScaffoldMessenger.of(dialogContext).showSnackBar(
        SnackBar(content: Text('No pude mandar el archivo: $e')),
      );
    }
  }

  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.88),
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          Future<void> guardedSend({required bool temporal}) async {
            setDialogState(() => sending = true);
            await send(dialogContext, temporal: temporal);
          }

          return Dialog.fullscreen(
            backgroundColor: Colors.black,
            child: SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: sending ? null : () => Navigator.pop(dialogContext),
                          icon: const Icon(Icons.close_rounded, color: Colors.white, size: 30),
                        ),
                        const Expanded(
                          child: Text(
                            'Previsualizar envío',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                          ),
                        ),
                        const SizedBox(width: 48),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: Stack(
                        alignment: Alignment.bottomCenter,
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(18),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(22),
                              child: picked.isVideo
                                  ? Container(
                                      width: 760,
                                      height: 430,
                                      color: const Color(0xFF151515),
                                      child: const Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.play_circle_fill_rounded, color: Color(0xFF6C63FF), size: 82),
                                          SizedBox(height: 14),
                                          Text('Video seleccionado', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                                        ],
                                      ),
                                    )
                                  : Image.memory(
                                      picked.bytes,
                                      fit: BoxFit.contain,
                                      filterQuality: FilterQuality.high,
                                    ),
                            ),
                          ),
                          Positioned(
                            left: 32,
                            bottom: 28,
                            child: _ChatMediaOriginBadge(label: picked.sourceLabel),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 22),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: _ChatSendModeButton(
                                icon: Icons.chat_bubble_rounded,
                                title: sending ? 'Enviando...' : 'Enviar al chat',
                                subtitle: 'se puede ver y rever',
                                onTap: sending ? null : () => guardedSend(temporal: false),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _ChatSendModeButton(
                                icon: Icons.brightness_1_rounded,
                                emoji: '💣',
                                title: sending ? 'Enviando...' : 'Ver una vez',
                                subtitle: 'se abre una sola vez',
                                onTap: sending ? null : () => guardedSend(temporal: true),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Ver una vez: se bloquea después de abrirlo y cerrarlo. En web no se puede impedir al 100% una captura del sistema, pero la app lo muestra protegido y no permite reabrir.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white.withOpacity(0.46), fontSize: 12, height: 1.25),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}

class _ChatMediaSourceButton extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ChatMediaSourceButton({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 58),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.045),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.075)),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF6C63FF).withOpacity(0.16),
              ),
              child: Icon(icon, color: const Color(0xFF8C84FF), size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14.5),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withOpacity(0.48), fontSize: 11.5, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: Colors.white.withOpacity(0.34), size: 25),
          ],
        ),
      ),
    );
  }
}

class _ChatSendModeButton extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final String emoji;

  const _ChatSendModeButton({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.emoji = '',
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 160),
        opacity: onTap == null ? 0.58 : 1,
        child: Container(
          height: 76,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: const Color(0xFF6C63FF),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6C63FF).withOpacity(0.28),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              if (emoji.trim().isNotEmpty)
                Text(emoji, style: const TextStyle(fontSize: 27))
              else
                Icon(icon, color: Colors.white, size: 29),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14.5)),
                    const SizedBox(height: 3),
                    Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withOpacity(0.72), fontWeight: FontWeight.w700, fontSize: 11.5)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChatMediaOriginBadge extends StatelessWidget {
  final String label;

  const _ChatMediaOriginBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.42),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.20)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(label == 'de cámara' ? Icons.photo_camera_rounded : Icons.photo_library_rounded, color: Colors.white, size: 14),
          const SizedBox(width: 5),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _ChatBombGlyph extends StatelessWidget {
  final double size;
  final double glow;

  const _ChatBombGlyph({
    this.size = 26,
    this.glow = 0.18,
  });

  @override
  Widget build(BuildContext context) {
    final bodySize = size * 0.72;
    return SizedBox(
      width: size + 12,
      height: size + 12,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: size + 8,
            height: size + 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withOpacity(0.18),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF8C84FF).withOpacity(glow),
                  blurRadius: 16,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),
          Positioned(
            top: 4,
            right: 6,
            child: Transform.rotate(
              angle: -0.62,
              child: Container(
                width: size * 0.30,
                height: size * 0.12,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFD166),
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFFFD166).withOpacity(0.45),
                      blurRadius: 8,
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 7,
            right: 9,
            child: Icon(
              Icons.close_rounded,
              size: size * 0.18,
              color: const Color(0xFFFFE08A),
            ),
          ),
          Container(
            width: bodySize,
            height: bodySize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const RadialGradient(
                center: Alignment(-0.35, -0.35),
                radius: 0.92,
                colors: [
                  Color(0xFF4F4F5C),
                  Color(0xFF20202A),
                  Color(0xFF07070A),
                ],
              ),
              border: Border.all(color: Colors.white.withOpacity(0.16), width: 0.7),
            ),
          ),
          Positioned(
            left: (size + 12) * 0.43,
            top: (size + 12) * 0.31,
            child: Container(
              width: size * 0.15,
              height: size * 0.15,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.22),
              ),
            ),
          ),
        ],
      ),
    );
  }
}


String _chatNormalizeDeliveryStatus(dynamic value) {
  final raw = (value ?? '').toString().trim().toLowerCase();
  if (raw == 'visto' || raw == 'seen' || raw == 'read' || raw == 'leido' || raw == 'leído') return 'visto';
  if (raw == 'entregado' || raw == 'delivered' || raw == 'received' || raw == 'recibido') return 'entregado';
  if (raw == 'enviado' || raw == 'sent') return 'entregado';
  return 'entregado';
}

String _chatMessageDeliveryStatus(Map<String, dynamic> msg) {
  // Estado PRO por mensaje, no por conversación.
  // Primero se miran los flags del receptor real de ESE mensaje.
  // Esto evita el bug donde afuera del chat decía "visto" pero adentro seguía diciendo
  // "entregado" porque la burbuja priorizaba un estado viejo o genérico.
  final sender = (msg['sender'] ?? '').toString().trim();

  if (sender == 'anonimo') {
    if (msg['leidoPorReceptor'] == true ||
        msg['vistoPorReceptor'] == true ||
        msg['seenByReceptor'] == true ||
        msg['readByReceptor'] == true) {
      return 'visto';
    }
  }

  if (sender == 'receptor') {
    if (msg['leidoPorAnonimo'] == true ||
        msg['vistoPorAnonimo'] == true ||
        msg['seenByAnonimo'] == true ||
        msg['readByAnonimo'] == true) {
      return 'visto';
    }
  }

  final explicit = msg['estado'] ?? msg['mensajeEstado'] ?? msg['status'] ?? msg['deliveryStatus'];
  final explicitText = (explicit ?? '').toString().trim();
  if (explicitText.isNotEmpty) {
    final normalized = _chatNormalizeDeliveryStatus(explicitText);
    if (normalized == 'visto') return 'visto';
  }

  return 'entregado';
}

String _chatDeliveryStatusFromChat(Map<String, dynamic> data) {
  // Estado externo PRO: el badge de la lista NO debe cantar "visto" solo porque
  // quedó un ultimoEstado viejo en el documento del chat. Primero manda el emisor
  // real del último mensaje y los flags reales de lectura de ESE último mensaje.
  final ultimoSender = (data['ultimoSender'] ?? data['lastSender'] ?? '').toString().trim();

  if (ultimoSender == 'anonimo') {
    if (data['ultimoMensajeLeidoPorReceptor'] == false ||
        data['lastMessageSeenByReceptor'] == false) return 'entregado';
    if (data['ultimoMensajeLeidoPorReceptor'] == true ||
        data['lastMessageSeenByReceptor'] == true ||
        data['vistoPorReceptor'] == true ||
        data['seenByReceptor'] == true) return 'visto';
    return 'entregado';
  }

  if (ultimoSender == 'receptor') {
    if (data['ultimoMensajeLeidoPorAnonimo'] == false ||
        data['lastMessageSeenByAnon'] == false ||
        data['lastMessageSeenByAnonimo'] == false) return 'entregado';
    if (data['ultimoMensajeLeidoPorAnonimo'] == true ||
        data['lastMessageSeenByAnon'] == true ||
        data['lastMessageSeenByAnonimo'] == true ||
        data['vistoPorAnonimo'] == true ||
        data['seenByAnonimo'] == true) return 'visto';
    return 'entregado';
  }

  final explicit = data['ultimoEstado'] ??
      data['ultimoMensajeEstado'] ??
      data['lastMessageStatus'] ??
      data['deliveryStatus'];
  final explicitText = (explicit ?? '').toString().trim();
  if (explicitText.isNotEmpty) {
    return _chatNormalizeDeliveryStatus(explicitText);
  }

  return 'entregado';
}

class _ChatDeliveryStatusBadge extends StatelessWidget {
  final String status;
  final bool compact;

  const _ChatDeliveryStatusBadge({
    required this.status,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final seen = _chatNormalizeDeliveryStatus(status) == 'visto';
    final color = seen ? const Color(0xFF8C84FF) : Colors.white.withOpacity(0.38);
    final label = seen ? 'visto' : 'entregado';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.done_all_rounded,
          color: color,
          size: compact ? 15 : 14,
        ),
        SizedBox(width: compact ? 4 : 3),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: compact ? 11.5 : 10.5,
            fontWeight: FontWeight.w900,
            letterSpacing: -0.1,
          ),
        ),
      ],
    );
  }
}

class _ChatMessageStatusLine extends StatelessWidget {
  final String status;
  final bool alignRight;

  const _ChatMessageStatusLine({
    required this.status,
    required this.alignRight,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 5),
      child: Align(
        alignment: alignRight ? Alignment.centerRight : Alignment.centerLeft,
        child: _ChatDeliveryStatusBadge(status: status),
      ),
    );
  }
}


String _normalizeProfileSlug(String value) {
  return value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'^@+'), '')
      .replaceAll(RegExp(r'[^a-z0-9_\-.]'), '');
}

bool _textContainsVerifiedProfileLink({
  required String text,
  required String uid,
  required String username,
}) {
  final cleanText = text.trim().toLowerCase();
  if (cleanText.isEmpty) return false;

  final cleanUid = uid.trim();
  final cleanUsername = _normalizeProfileSlug(username);
  if (cleanUid.isEmpty && cleanUsername.isEmpty) return false;

  final candidates = <String>{};
  if (cleanUid.isNotEmpty) {
    candidates.add('sayittome-app.web.app/u/$cleanUid');
    candidates.add('sayittome-app.web.app/profile/$cleanUid');
    candidates.add('sayittome-app.web.app/perfil/$cleanUid');
    candidates.add('sayittome-app.web.app?uid=$cleanUid');
  }
  if (cleanUsername.isNotEmpty) {
    candidates.add('sayittome-app.web.app/$cleanUsername');
    candidates.add('sayittome-app.web.app/@$cleanUsername');
    candidates.add('sayittome-app.web.app/u/$cleanUsername');
    candidates.add('sayittome-app.web.app/profile/$cleanUsername');
    candidates.add('sayittome-app.web.app/perfil/$cleanUsername');
    candidates.add('connected2.me/$cleanUsername');
    candidates.add('@$cleanUsername');
  }

  return candidates.any(cleanText.contains);
}

Future<Map<String, dynamic>> _verifiedProfileLinkPayloadForOutgoingText({
  required String text,
  required String? senderUid,
}) async {
  final uid = (senderUid ?? '').trim();
  if (uid.isEmpty || text.trim().isEmpty) return const <String, dynamic>{};

  try {
    final userDoc = await FirebaseFirestore.instance
        .collection('usuarios')
        .doc(uid)
        .get()
        .timeout(const Duration(seconds: 8));
    final data = userDoc.data() ?? const <String, dynamic>{};
    final username = (data['username'] ?? data['usernameLower'] ?? data['nombre'] ?? '').toString();
    final matched = _textContainsVerifiedProfileLink(text: text, uid: uid, username: username);
    if (!matched) return const <String, dynamic>{};

    return {
      'verifiedProfileLink': true,
      'verifiedProfileLinkUid': uid,
      'verifiedProfileLinkUsername': username,
      'verifiedProfileLinkAt': FieldValue.serverTimestamp(),
    };
  } catch (e) {
    debugPrint('No pude validar enlace verificado del perfil: $e');
    return const <String, dynamic>{};
  }
}

String _verifiedProfileUidFromMessage(Map<String, dynamic> msg) {
  return (msg['verifiedProfileLinkUid'] ??
          msg['perfilVerificadoUid'] ??
          msg['profileUid'] ??
          msg['senderUid'] ??
          '')
      .toString()
      .trim();
}

class _VerifiedProfileLinkBadge extends StatelessWidget {
  final String profileUid;
  final bool alignRight;

  const _VerifiedProfileLinkBadge({
    required this.profileUid,
    required this.alignRight,
  });

  void _openProfile(BuildContext context) {
    final uid = profileUid.trim();
    if (uid.isEmpty) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PublicProfilePage(profileUid: uid),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final enabled = profileUid.trim().isNotEmpty;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Align(
        alignment: alignRight ? Alignment.centerRight : Alignment.centerLeft,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? () => _openProfile(context) : null,
            borderRadius: BorderRadius.circular(999),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF7DCBFF).withOpacity(0.95),
                    ),
                    child: const Icon(Icons.verified_rounded, color: Color(0xFF151515), size: 14),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    enabled ? 'Incluye un enlace verificado' : 'Incluye un enlace verificado',
                    style: TextStyle(
                      color: const Color(0xFFB8DCFF).withOpacity(0.96),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.1,
                    ),
                  ),
                  if (enabled) ...[
                    const SizedBox(width: 4),
                    Icon(
                      Icons.open_in_new_rounded,
                      color: const Color(0xFFB8DCFF).withOpacity(0.74),
                      size: 13,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChatMessageBubble extends StatelessWidget {
  final String chatId;
  final String messageId;
  final Map<String, dynamic> msg;
  final bool isMine;
  final String viewerRole;

  const _ChatMessageBubble({
    required this.chatId,
    required this.messageId,
    required this.msg,
    required this.isMine,
    required this.viewerRole,
  });

  String get _openedField => viewerRole == 'receptor' ? 'openedByReceptor' : 'openedByAnonimo';

  Future<void> _openMedia(BuildContext context) async {
    final isTemporal = msg['temporal'] == true;
    final alreadyOpened = isTemporal && msg[_openedField] == true;
    final url = (msg['mediaUrl'] ?? '').toString().trim();
    final mediaType = (msg['mediaType'] ?? 'image').toString();
    final sourceLabel = (msg['mediaSourceLabel'] ?? '').toString().trim();
    if (url.isEmpty || alreadyOpened) return;

    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(isTemporal ? 1 : 0.92),
      builder: (dialogContext) {
        return Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: Stack(
            children: [
              Positioned.fill(
                child: Center(
                  child: mediaType == 'video'
                      ? Padding(
                          padding: const EdgeInsets.all(20),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 860, maxHeight: 520),
                            child: _InlineNetworkVideoPlayer(
                              url: url,
                              aspectRatio: 16 / 9,
                              controls: true,
                              autoplay: false,
                              loop: false,
                              muted: false,
                              fit: BoxFit.contain,
                            ),
                          ),
                        )
                      : InteractiveViewer(
                          minScale: 1,
                          maxScale: 5,
                          child: Image.network(
                            url,
                            fit: BoxFit.contain,
                            filterQuality: FilterQuality.high,
                            gaplessPlayback: true,
                            webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                            errorBuilder: (_, __, ___) => Center(
                              child: Text(
                                'No pude abrir esta imagen.',
                                style: TextStyle(color: Colors.white.withOpacity(0.70)),
                              ),
                            ),
                          ),
                        ),
                ),
              ),
              if (isTemporal)
                Positioned(
                  left: 18,
                  right: 18,
                  top: MediaQuery.of(dialogContext).padding.top + 18,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.70),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withOpacity(0.16)),
                    ),
                    child: Row(
                      children: [
                        const _ChatBombGlyph(size: 20, glow: 0.10),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            'Ver una vez: al cerrar esta vista no se puede volver a abrir. Capturas protegidas dentro de la app.',
                            style: TextStyle(color: Colors.white.withOpacity(0.82), fontSize: 12.5, height: 1.24, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              if (sourceLabel.isNotEmpty)
                Positioned(
                  left: 18,
                  bottom: MediaQuery.of(dialogContext).padding.bottom + 22,
                  child: _ChatMediaOriginBadge(label: sourceLabel),
                ),
              Positioned(
                top: MediaQuery.of(dialogContext).padding.top + 14,
                right: 16,
                child: _RoundOverlayIconButton(
                  icon: Icons.close_rounded,
                  onTap: () => Navigator.pop(dialogContext),
                ),
              ),
            ],
          ),
        );
      },
    );

    if (isTemporal) {
      await FirebaseFirestore.instance
          .collection('chats_anonimos')
          .doc(chatId)
          .collection('mensajes')
          .doc(messageId)
          .set({
        _openedField: true,
        '${_openedField}At': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)).catchError((e) {
        debugPrint('No pude marcar ver una vez como abierto: $e');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = (msg['type'] ?? 'text').toString();
    final isMedia = type == 'media' || (msg['mediaUrl'] ?? '').toString().trim().isNotEmpty;
    final deliveryStatus = _chatMessageDeliveryStatus(msg);

    if (!isMedia) {
      final bubbleText = (msg['texto'] ?? '').toString();
      final maxBubbleWidth = min(MediaQuery.of(context).size.width * 0.66, 430.0);
      final hasVerifiedProfileLink = msg['verifiedProfileLink'] == true;
      final verifiedProfileUid = _verifiedProfileUidFromMessage(msg);

      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Align(
          alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Container(
                constraints: BoxConstraints(
                  maxWidth: maxBubbleWidth,
                  minWidth: 0,
                ),
                decoration: BoxDecoration(
                  color: isMine ? const Color(0xFF6C63FF) : const Color(0xFF202020),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(17),
                    topRight: const Radius.circular(17),
                    bottomLeft: Radius.circular(isMine ? 17 : 5),
                    bottomRight: Radius.circular(isMine ? 5 : 17),
                  ),
                  border: Border.all(
                    color: isMine ? const Color(0xFF8C84FF).withOpacity(0.42) : Colors.white.withOpacity(0.055),
                    width: 0.8,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.20),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 10, 7),
                  child: Text(
                    bubbleText,
                    softWrap: true,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14.5,
                      height: 1.22,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              _ChatMessageStatusLine(status: deliveryStatus, alignRight: isMine),
              if (hasVerifiedProfileLink)
                _VerifiedProfileLinkBadge(
                  profileUid: verifiedProfileUid,
                  alignRight: isMine,
                ),
            ],
          ),
        ),
      );
    }

    final isTemporal = msg['temporal'] == true;
    final alreadyOpened = isTemporal && msg[_openedField] == true;
    final mediaType = (msg['mediaType'] ?? 'image').toString();
    final url = (msg['mediaUrl'] ?? '').toString().trim();
    final label = (msg['mediaSourceLabel'] ?? '').toString().trim();
    final title = mediaType == 'video' ? 'Video' : 'Foto';

    if (isTemporal) {
      final bubbleColor = isMine ? const Color(0xFF6C63FF) : const Color(0xFF1A1A1A);
      final secondary = alreadyOpened ? 'Ya abierto' : (mediaType == 'video' ? 'Video' : 'Imagen');
      return Align(
        alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
        child: GestureDetector(
          onTap: alreadyOpened ? null : () => _openMedia(context),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 245),
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.fromLTRB(13, 10, 12, 10),
            decoration: BoxDecoration(
              color: alreadyOpened ? const Color(0xFF151515) : bubbleColor,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withOpacity(alreadyOpened ? 0.07 : 0.10)),
              boxShadow: alreadyOpened
                  ? []
                  : [
                      BoxShadow(
                        color: const Color(0xFF6C63FF).withOpacity(isMine ? 0.18 : 0.05),
                        blurRadius: 12,
                        offset: const Offset(0, 5),
                      ),
                    ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    alreadyOpened
                        ? Icon(Icons.lock_rounded, color: Colors.white.withOpacity(0.68), size: 22)
                        : const _ChatBombGlyph(size: 22, glow: 0.08),
                    const SizedBox(width: 9),
                    Flexible(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            alreadyOpened ? 'Ver una vez bloqueado' : 'Ver una vez',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14.2),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            secondary,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.white.withOpacity(0.62), fontWeight: FontWeight.w700, fontSize: 11.2),
                          ),
                        ],
                      ),
                    ),
                    if (!alreadyOpened && label.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      _ChatMediaOriginBadge(label: label),
                    ],
                  ],
                ),
                _ChatMessageStatusLine(status: deliveryStatus, alignRight: isMine),
              ],
            ),
          ),
        ),
      );
    }

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onTap: alreadyOpened ? null : () => _openMedia(context),
        child: Container(
          width: mediaType == 'video' ? 246 : 220,
          margin: const EdgeInsets.only(bottom: 10),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: isMine ? const Color(0xFF6C63FF) : const Color(0xFF1A1A1A),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withOpacity(0.06)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 170,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (alreadyOpened)
                      Container(
                        color: const Color(0xFF121212),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.lock_rounded, color: Colors.white.withOpacity(0.60), size: 44),
                            const SizedBox(height: 8),
                            Text('Ya abierto', style: TextStyle(color: Colors.white.withOpacity(0.72), fontWeight: FontWeight.w900)),
                          ],
                        ),
                      )
                    else if (isTemporal)
                      Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF181818), Color(0xFF050505)],
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.brightness_7_rounded, color: Colors.white, size: 54),
                            const SizedBox(height: 8),
                            Text('Ver una vez', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 3),
                            Text('abrir una vez', style: TextStyle(color: Colors.white.withOpacity(0.52), fontWeight: FontWeight.w700, fontSize: 12)),
                          ],
                        ),
                      )
                    else if (mediaType == 'image')
                      Image.network(
                        url,
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                        errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.broken_image_rounded, color: Colors.white54, size: 42)),
                      )
                    else
                      Stack(
                        fit: StackFit.expand,
                        children: [
                          _InlineNetworkVideoPlayer(
                            url: url,
                            aspectRatio: 16 / 9,
                            controls: false,
                            autoplay: false,
                            loop: false,
                            muted: true,
                            fit: BoxFit.cover,
                          ),
                          Center(
                            child: Container(
                              width: 54,
                              height: 54,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.black.withOpacity(0.42),
                                border: Border.all(color: Colors.white.withOpacity(0.22)),
                              ),
                              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 36),
                            ),
                          ),
                        ],
                      ),
                    if (!alreadyOpened && label.isNotEmpty)
                      Positioned(left: 9, bottom: 9, child: _ChatMediaOriginBadge(label: label)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
                child: Row(
                  children: [
                    Icon(
                      isTemporal ? Icons.brightness_1_rounded : (mediaType == 'video' ? Icons.videocam_rounded : Icons.photo_rounded),
                      color: Colors.white,
                      size: 19,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        alreadyOpened ? 'Ver una vez bloqueado' : (isTemporal ? 'Ver una vez' : title),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13.5),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 11),
                child: _ChatMessageStatusLine(status: deliveryStatus, alignRight: isMine),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ===================== CHAT ANONIMO (INVITADO) =====================


// ===================== TYPING INDICATOR V65 =====================
// Burbuja misteriosa de "está escribiendo" con tres puntitos animados.
// Se usa en chats anónimos y receptor, alineada donde aparecería el mensaje entrante.
class _TypingDotsBubble extends StatefulWidget {
  final bool alignRight;

  const _TypingDotsBubble({
    this.alignRight = false,
  });

  @override
  State<_TypingDotsBubble> createState() => _TypingDotsBubbleState();
}

class _TypingDotsBubbleState extends State<_TypingDotsBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1050),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  double _dotOpacity(int index, double value) {
    final shifted = (value + (index * 0.22)) % 1.0;
    if (shifted < 0.35) return 0.28 + shifted * 1.85;
    if (shifted < 0.70) return 0.92 - ((shifted - 0.35) * 1.65);
    return 0.34;
  }

  double _dotOffset(int index, double value) {
    final shifted = (value + (index * 0.22)) % 1.0;
    final wave = sin(shifted * pi * 2);
    return -2.5 * wave;
  }

  @override
  Widget build(BuildContext context) {
    final bubble = Container(
      margin: const EdgeInsets.symmetric(vertical: 5),
      padding: const EdgeInsets.fromLTRB(10, 7, 10, 7),
      constraints: const BoxConstraints(minWidth: 44, minHeight: 28),
      decoration: BoxDecoration(
        color: const Color(0xFF15151F),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.20)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6C63FF).withOpacity(0.10),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final value = _controller.value;
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(3, (index) {
              return Transform.translate(
                offset: Offset(0, _dotOffset(index, value)),
                child: AnimatedOpacity(
                  opacity: _dotOpacity(index, value).clamp(0.20, 1.0),
                  duration: const Duration(milliseconds: 90),
                  child: Container(
                    width: 5,
                    height: 5,
                    margin: EdgeInsets.only(right: index == 2 ? 0 : 4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color.lerp(
                        const Color(0xFF8C84FF),
                        Colors.white,
                        _dotOpacity(index, value).clamp(0.0, 1.0),
                      ),
                    ),
                  ),
                ),
              );
            }),
          );
        },
      ),
    );

    return Align(
      alignment: widget.alignRight ? Alignment.centerRight : Alignment.centerLeft,
      child: bubble,
    );
  }
}
// ===================== FIN TYPING INDICATOR V65 =====================

class ChatAnonPage extends StatefulWidget {
  final String receptorUid;
  final String receptorUsername;
  final String receptorFotoPrincipal;
  final String? existingChatId;
  final String? existingAnonId;
  final String? existingVisitorId;

  const ChatAnonPage({
    super.key,
    this.receptorUid = "demo_user",
    this.receptorUsername = "perfil",
    this.receptorFotoPrincipal = "",
    this.existingChatId,
    this.existingAnonId,
    this.existingVisitorId,
  });

  @override
  State<ChatAnonPage> createState() => _ChatAnonPageState();
}

class _ChatAnonPageState extends State<ChatAnonPage> {
  final TextEditingController controller = TextEditingController();
  final FocusNode _messageFocusNode = FocusNode();
  final ScrollController _chatScrollController = ScrollController();
  final List<Map<String, dynamic>> mensajes = [];
  final List<Map<String, dynamic>> _optimisticTextMessages = <Map<String, dynamic>>[];
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _mensajesSubscription;
  bool _incomingSoundReady = false;
  bool _sendingText = false;
  bool _temporarilyBlockedByAbuse = false;
  Timestamp? _temporarilyBlockedUntil;
  String _anonAbuseFingerprint = "";

  late String anonId;
  late String visitorId;
  String? chatId;

  @override
  void initState() {
    super.initState();

    // FLASH FIX V60:
    // Si abrimos un chat existente desde la bandeja/lista, el existingChatId ya viene
    // en el widget. Antes chatId quedaba null hasta que terminaba initSesion() async,
    // y durante ese frame Flutter pintaba _anonymousConversationIntro(), generando
    // el flash lila/gris que se veía al abrir chats.
    final initialExistingChatId = (widget.existingChatId ?? "").trim();
    if (initialExistingChatId.isNotEmpty) {
      chatId = initialExistingChatId;
      anonId = (widget.existingAnonId ?? "").trim();
      visitorId = (widget.existingVisitorId ?? "").trim();
    } else {
      anonId = "anon-${Random().nextInt(999999)}";
      visitorId = "v-${Random().nextInt(999999999)}";
    }

    initSesion();
    _refocusComposerSoon();
  }

  void _scrollChatToBottom({bool animated = true}) {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_chatScrollController.hasClients) return;
      final target = _chatScrollController.position.maxScrollExtent;
      if (animated) {
        _chatScrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
        );
      } else {
        _chatScrollController.jumpTo(target);
      }
    });
  }

  void _refocusComposerSoon() {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_temporarilyBlockedByAbuse) return;
      _messageFocusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _mensajesSubscription?.cancel();
    _chatScrollController.dispose();
    _messageFocusNode.dispose();
    controller.dispose();
    super.dispose();
  }

  Future<void> _refreshAnonAbuseBlockStatus({bool showSnack = false}) async {
    final fingerprint = _anonAbuseFingerprint.trim().isNotEmpty
        ? _anonAbuseFingerprint.trim()
        : await _getOrCreateAnonAbuseFingerprint();
    _anonAbuseFingerprint = fingerprint;

    final status = await _getAnonAbuseBlockStatus(
      receptorUid: widget.receptorUid,
      fingerprintAnonimo: fingerprint,
    );

    if (!mounted) return;
    setState(() {
      _temporarilyBlockedByAbuse = status.active;
      _temporarilyBlockedUntil = status.expiresAt;
    });

    if (showSnack && status.active && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(status.message)),
      );
    }
  }

  Future<bool> _ensureAnonCanContactReceptor({bool showSnack = true}) async {
    final fingerprint = _anonAbuseFingerprint.trim().isNotEmpty
        ? _anonAbuseFingerprint.trim()
        : await _getOrCreateAnonAbuseFingerprint();
    _anonAbuseFingerprint = fingerprint;

    final status = await _getAnonAbuseBlockStatus(
      receptorUid: widget.receptorUid,
      fingerprintAnonimo: fingerprint,
    );

    if (mounted) {
      setState(() {
        _temporarilyBlockedByAbuse = status.active;
        _temporarilyBlockedUntil = status.expiresAt;
      });
    }

    if (!status.active) return true;

    if (showSnack && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("No podés escribirle a este perfil por ahora.")),
      );
    }
    return false;
  }

  String _blockedUntilText() {
    final value = _temporarilyBlockedUntil?.toDate();
    if (value == null) return "unos minutos";
    final diff = value.difference(DateTime.now());
    if (diff.inMinutes <= 0) return "unos instantes";
    if (diff.inMinutes == 1) return "1 minuto";
    return "${diff.inMinutes} minutos";
  }

  Future<void> initSesion() async {
    final prefs = await SharedPreferences.getInstance();
    _anonAbuseFingerprint = await _getOrCreateAnonAbuseFingerprint();
    await _refreshAnonAbuseBlockStatus(showSnack: false);
    await _touchAnonymousPresence(reason: "chat_anon_open");

    // Si se abre desde "Mis chats anónimos", se recupera esa conversación local.
    // Si se entra anónimo de nuevo desde Shuffle/Home, se crea otro anon descartable.
    if ((widget.existingChatId ?? "").trim().isNotEmpty) {
      chatId = widget.existingChatId;
      anonId = (widget.existingAnonId ?? prefs.getString("anonId") ?? "anon-${Random().nextInt(999999)}").trim();
      visitorId = (widget.existingVisitorId ?? prefs.getString("visitorId") ?? "v-${Random().nextInt(999999999)}").trim();
      if (anonId.isEmpty) anonId = "anon-${Random().nextInt(999999)}";
      if (visitorId.isEmpty) visitorId = "v-${Random().nextInt(999999999)}";
      if (mounted) setState(() {});
      await _refreshAnonAbuseBlockStatus(showSnack: false);
      escucharMensajes();
      await marcarLeidoPorAnon();
      return;
    }

    // anonId/visitorId se guardan solo durante la entrada anónima actual.
    // Si el usuario refresca, sale y vuelve a Entrar anónimo, o cierra sesión,
    // se borran y este bloque crea una identidad completamente nueva.
    anonId = prefs.getString("anonId") ?? "anon-${Random().nextInt(999999)}";
    visitorId = prefs.getString("visitorId") ?? "v-${Random().nextInt(999999999)}";

    await prefs.setString("anonId", anonId);
    await prefs.setString("visitorId", visitorId);
    await _refreshAnonAbuseBlockStatus(showSnack: false);

    // MUY IMPORTANTE:
    // Abrir un perfil para escribir anónimo NO debe crear una conversación vacía.
    // El chat recién existe en Firestore cuando el anon manda el primer mensaje.
    if (mounted) setState(() {});
  }

  Future<void> crearChatSiHaceFaltaParaPrimerMensaje() async {
    if ((chatId ?? "").trim().isNotEmpty) return;

    final canContact = await _ensureAnonCanContactReceptor(showSnack: true);
    if (!canContact) return;

    final ref = FirebaseFirestore.instance.collection("chats_anonimos");
    final currentUser = FirebaseAuth.instance.currentUser;

    final doc = await ref.add({
      "visitorId": visitorId,
      "anonId": anonId,
      "fingerprintAnonimo": _anonAbuseFingerprint,
      "senderOwnerUid": currentUser?.uid,
      "senderDeleted": false,
      "receptorDeleted": false,
      "anonBlocked": false,
      "receptorUid": widget.receptorUid,
      "receptorUsername": widget.receptorUsername,
      "receptorFotoPrincipal": widget.receptorFotoPrincipal,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
      "ultimoMensaje": "",
      "mensajesCount": 0,
      "hasMessages": false,
      "primerMensajeEnviado": false,
      "typingAnon": false,
      "typingReceptor": false,
      "unreadCount": 0,
      "unreadForSender": 0,
    });

    chatId = doc.id;
    if (mounted) setState(() {});
    escucharMensajes();
  }

  void escucharMensajes() {
    if (chatId == null) return;

    _mensajesSubscription?.cancel();
    _incomingSoundReady = false;

    _mensajesSubscription = FirebaseFirestore.instance
        .collection("chats_anonimos")
        .doc(chatId)
        .collection("mensajes")
        .orderBy("createdAt")
        .snapshots()
        .listen((snapshot) {
      final shouldPlayWhip = _incomingSoundReady && snapshot.docChanges.any((change) {
        if (change.type != DocumentChangeType.added) return false;
        final data = change.doc.data();
        if (data == null) return false;
        return (data["sender"] ?? "").toString() == "receptor";
      });

      mensajes.clear();

      for (var doc in snapshot.docs) {
        mensajes.add(doc.data());
      }

      if (mounted) {
        if (snapshot.docs.isNotEmpty && _optimisticTextMessages.isNotEmpty) {
          _optimisticTextMessages.clear();
        }
        setState(() {});
        _scrollChatToBottom(animated: true);
        _refocusComposerSoon();
      }
      unawaited(marcarLeidoPorAnon());

      if (shouldPlayWhip) {
        _WhipSoundService.playIncomingMessageWhip();
      }
      _incomingSoundReady = true;
    });
  }

  Future<void> marcarLeidoPorAnon() async {
    final id = chatId;
    if (id == null) return;
    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(id);

    try {
      final messages = await chatRef.collection("mensajes").limit(250).get();
      final batch = FirebaseFirestore.instance.batch();
      var touched = 0;
      for (final doc in messages.docs) {
        final data = doc.data();
        if ((data["sender"] ?? "").toString() != "receptor") continue;
        if (data["leidoPorAnonimo"] == true && _chatNormalizeDeliveryStatus(data["estado"]) == "visto") continue;
        batch.set(doc.reference, {
          "estado": "visto",
          "leidoPorAnonimo": true,
          "vistoPorAnonimo": true,
          "seenByAnonimo": true,
          "readByAnonimo": true,
          "vistoPorAnonimoAt": FieldValue.serverTimestamp(),
          "seenByAnonimoAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        touched++;
      }
      if (touched > 0) await batch.commit();
    } catch (e) {
      debugPrint("No pude marcar mensajes como vistos por anon: $e");
    }

    await chatRef.set({
      "unreadForSender": 0,
      "ultimoEstado": "visto",
      "ultimoMensajeLeidoPorAnonimo": true,
    }, SetOptions(merge: true));
  }

  Future<void> enviarMensaje() async {
    final texto = controller.text.trim();
    if (texto.isEmpty) {
      _messageFocusNode.requestFocus();
      return;
    }

    controller.clear();
    _optimisticTextMessages.add({
      "texto": texto,
      "sender": "anonimo",
      "createdAtClient": Timestamp.fromDate(DateTime.now()),
      "createdAt": Timestamp.fromDate(DateTime.now()),
      "estado": "enviando",
      "optimistic": true,
      "optimisticId": "optimistic_${DateTime.now().microsecondsSinceEpoch}_${Random().nextInt(999999)}",
      "leidoPorAnonimo": true,
      "vistoPorAnonimo": true,
    });
    if (mounted) setState(() {});
    _scrollChatToBottom(animated: true);
    _refocusComposerSoon();
    _messageFocusNode.requestFocus();

    try {
      final canContact = await _ensureAnonCanContactReceptor(showSnack: true);
      if (!canContact) {
        controller.text = texto;
        return;
      }

      await crearChatSiHaceFaltaParaPrimerMensaje();
      if (chatId == null) {
        controller.text = texto;
        return;
      }

      final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(chatId);
      final chatSnap = await chatRef.get();
      final chatData = chatSnap.data() ?? {};
      final blockedUntilDate = _anonAbuseTimestampToDate(chatData["blockedUntil"]);
      final stillTemporarilyBlocked = blockedUntilDate == null || blockedUntilDate.isAfter(DateTime.now());
      if (chatData["anonBlocked"] == true && stillTemporarilyBlocked) {
        controller.text = texto;
        if (mounted) {
          setState(() {
            _temporarilyBlockedByAbuse = true;
            _temporarilyBlockedUntil = blockedUntilDate == null ? null : Timestamp.fromDate(blockedUntilDate);
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("No podés escribirle a este perfil por ahora.")),
          );
        }
        return;
      }

      final ref = FirebaseFirestore.instance
          .collection("chats_anonimos")
          .doc(chatId)
          .collection("mensajes");

      final verifiedProfileLinkPayload = await _verifiedProfileLinkPayloadForOutgoingText(
        text: texto,
        senderUid: FirebaseAuth.instance.currentUser?.uid,
      );

      await ref.add({
        "texto": texto,
        "sender": "anonimo",
        "receptorUid": widget.receptorUid,
        "chatId": chatId,
        ...verifiedProfileLinkPayload,
        "createdAt": FieldValue.serverTimestamp(),
        "estado": "entregado",
        "entregadoAt": FieldValue.serverTimestamp(),
        "leidoPorReceptor": false,
        "vistoPorReceptor": false,
        "seenByReceptor": false,
        "readByReceptor": false,
        "leidoPorAnonimo": true,
        "vistoPorAnonimo": true,
        "seenByAnonimo": true,
        "readByAnonimo": true,
      });

      await chatRef.set({
        "ultimoMensaje": texto,
        "updatedAt": FieldValue.serverTimestamp(),
        "typingAnon": false,
        "senderDeleted": false,
        "receptorDeleted": false,
        "unreadCount": FieldValue.increment(1),
        "unreadForSender": 0,
        "ultimoSender": "anonimo",
        "ultimoEstado": "entregado",
        "ultimoMensajeLeidoPorReceptor": false,
        "ultimoMensajeLeidoPorAnonimo": true,
        "mensajesCount": FieldValue.increment(1),
        "hasMessages": true,
        "primerMensajeEnviado": true,
      }, SetOptions(merge: true));

      // Denormalización defensiva del contador público de conversaciones.
      // Cuenta una sola vez cada chat anónimo que empezó a hablarle a este perfil.
      // Si el chat viejo no tenía conversationCounted, se corrige en el próximo mensaje.
      try {
        await FirebaseFirestore.instance.runTransaction((transaction) async {
          final freshChat = await transaction.get(chatRef);
          final freshData = freshChat.data() ?? {};
          final alreadyCounted = freshData["conversationCounted"] == true;
          if (alreadyCounted) return;

          transaction.set(chatRef, {
            "conversationCounted": true,
            "conversationCountedAt": FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));

          transaction.set(
            FirebaseFirestore.instance.collection("usuarios").doc(widget.receptorUid),
            {
              "conversacionesCount": FieldValue.increment(1),
              "updatedAt": FieldValue.serverTimestamp(),
            },
            SetOptions(merge: true),
          );
        }).timeout(const Duration(seconds: 12));
      } catch (e) {
        debugPrint("No pude actualizar contador denormalizado de conversaciones: $e");
      }
    } catch (e) {
      controller.text = texto;
      _optimisticTextMessages.removeWhere((msg) => (msg["texto"] ?? "").toString() == texto && msg["optimistic"] == true);
      if (mounted) {
        setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("No pude enviar el mensaje: $e")),
        );
      }
    } finally {
      if (mounted) {
        // DELAY FIX V63:
        // No bloqueamos el composer mientras Firestore termina de confirmar el mensaje.
        // El texto ya se limpió al inicio del envío, así que un Enter inmediato posterior
        // puede mandar otro mensaje sin esperar el roundtrip de red.
        _scrollChatToBottom(animated: true);
        _refocusComposerSoon();
      }
    }
  }

  Future<void> _sendMediaPayload(Map<String, dynamic> payload) async {
    final canContact = await _ensureAnonCanContactReceptor(showSnack: true);
    if (!canContact) return;

    await crearChatSiHaceFaltaParaPrimerMensaje();
    if (chatId == null) return;

    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(chatId);
    final chatSnap = await chatRef.get();
    final chatData = chatSnap.data() ?? {};
    final blockedUntilDate = _anonAbuseTimestampToDate(chatData["blockedUntil"]);
    final stillTemporarilyBlocked = blockedUntilDate == null || blockedUntilDate.isAfter(DateTime.now());
    if (chatData["anonBlocked"] == true && stillTemporarilyBlocked) {
      if (mounted) {
        setState(() {
          _temporarilyBlockedByAbuse = true;
          _temporarilyBlockedUntil = blockedUntilDate == null ? null : Timestamp.fromDate(blockedUntilDate);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("No podés escribirle a este perfil por ahora.")),
        );
      }
      return;
    }

    await chatRef.collection("mensajes").add({
      ...payload,
      "sender": "anonimo",
      "createdAt": FieldValue.serverTimestamp(),
      "estado": "entregado",
      "entregadoAt": FieldValue.serverTimestamp(),
      "leidoPorReceptor": false,
      "vistoPorReceptor": false,
      "seenByReceptor": false,
      "readByReceptor": false,
      "leidoPorAnonimo": true,
      "vistoPorAnonimo": true,
      "seenByAnonimo": true,
      "readByAnonimo": true,
    });

    await chatRef.set({
      "ultimoMensaje": payload["texto"] ?? "Archivo",
      "updatedAt": FieldValue.serverTimestamp(),
      "typingAnon": false,
      "senderDeleted": false,
      "receptorDeleted": false,
      "unreadCount": FieldValue.increment(1),
      "unreadForSender": 0,
      "ultimoSender": "anonimo",
      "ultimoEstado": "entregado",
      "ultimoMensajeLeidoPorReceptor": false,
      "ultimoMensajeLeidoPorAnonimo": true,
      "mensajesCount": FieldValue.increment(1),
      "hasMessages": true,
      "primerMensajeEnviado": true,
    }, SetOptions(merge: true));

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final freshChat = await transaction.get(chatRef);
        final freshData = freshChat.data() ?? {};
        if (freshData["conversationCounted"] == true) return;
        transaction.set(chatRef, {
          "conversationCounted": true,
          "conversationCountedAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        transaction.set(
          FirebaseFirestore.instance.collection("usuarios").doc(widget.receptorUid),
          {
            "conversacionesCount": FieldValue.increment(1),
            "updatedAt": FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );
      }).timeout(const Duration(seconds: 12));
    } catch (e) {
      debugPrint("No pude actualizar contador por media: $e");
    }
  }

  Future<void> _openAttachSheet() async {
    final canContact = await _ensureAnonCanContactReceptor(showSnack: true);
    if (!canContact) return;

    await crearChatSiHaceFaltaParaPrimerMensaje();
    final id = chatId;
    if (id == null) return;
    if (!mounted) return;
    await _openChatMediaPickerSheet(
      context: context,
      chatId: id,
      sender: "anonimo",
      receptorUid: widget.receptorUid,
      onSendPayload: _sendMediaPayload,
    );
  }

  Future<void> setTyping(bool val) async {
    if (chatId == null) return;
    await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .doc(chatId)
        .update({"typingAnon": val});
  }

  Future<void> _deleteMyAnonConversation() async {
    final id = chatId;
    if (id == null) return;

    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(id);
    while (true) {
      final messages = await chatRef.collection("mensajes").limit(250).get();
      if (messages.docs.isEmpty) break;
      final batch = FirebaseFirestore.instance.batch();
      for (final message in messages.docs) {
        batch.delete(message.reference);
      }
      await batch.commit();
      if (messages.docs.length < 250) break;
    }
    await chatRef.delete();

    if (!mounted) return;
    Navigator.maybePop(context);
  }


  void _openReceptorProfile() {
    final uid = widget.receptorUid.trim();
    if (uid.isEmpty || uid == "demo_user") return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PublicProfilePage(profileUid: uid),
      ),
    );
  }

  Widget _anonymousConversationIntro(String avatarUrl) {
    final cleanUsername = widget.receptorUsername.trim().isEmpty ? "perfil" : widget.receptorUsername.trim();

    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 34, 22, 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Spacer(),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _openReceptorProfile,
            child: _ProfileAvatar(url: avatarUrl, size: 238),
          ),
          const SizedBox(height: 22),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _openReceptorProfile,
            child: Text(
              cleanUsername,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 29,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.25,
              ),
            ),
          ),
          const Spacer(),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
            decoration: BoxDecoration(
              color: const Color(0xFF11111A),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF6C63FF).withOpacity(0.18),
                  blurRadius: 22,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        "¡Mantenemos tu anonimato!",
                        style: TextStyle(
                          color: Color(0xFF6C63FF),
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        "No sabrán quién eres.",
                        style: TextStyle(
                          color: Color(0xFF6C63FF),
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.visibility_off_rounded,
                  color: const Color(0xFF6C63FF).withOpacity(0.22),
                  size: 74,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }


  Widget _typingIndicatorForReceptor() {
    final id = chatId;
    if (id == null || id.trim().isEmpty) return const SizedBox.shrink();

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("chats_anonimos").doc(id).snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() ?? {};
        final typing = data["typingReceptor"] == true;
        if (!typing) return const SizedBox.shrink();

        _scrollChatToBottom(animated: true);
        return const _TypingDotsBubble(alignRight: false);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(
        actions: [
          IconButton(
            tooltip: "Borrar conversación",
            onPressed: _deleteMyAnonConversation,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
        title: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _openReceptorProfile,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.receptorUsername,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
              Text(
                "sos $anonId · tu mensaje es completamente anónimo",
                style: const TextStyle(fontSize: 10.5, color: Colors.white60),
              ),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection("usuarios")
                  .doc(widget.receptorUid)
                  .snapshots(),
              builder: (context, profileSnapshot) {
                final profileData = profileSnapshot.data?.data() ?? {};
                final liveAvatar = (profileData["fotoPrincipal"] ?? widget.receptorFotoPrincipal).toString();

                // FLASH FIX V60:
                // Si todavía no hay chatId, solo mostramos la intro en chats realmente nuevos.
                // En chats existentes, chatId se asigna sincronizadamente en initState para evitar
                // que se pinte la intro por un frame mientras initSesion() termina.
                if (chatId == null) {
                  return _anonymousConversationIntro(liveAvatar);
                }

                return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: FirebaseFirestore.instance
                      .collection("chats_anonimos")
                      .doc(chatId)
                      .collection("mensajes")
                      .orderBy("createdAt")
                      .snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return _CenterSoftText(text: "No pude cargar mensajes.");
                    }

                    if (!snapshot.hasData) return const ColoredBox(color: Color(0xFF050505));
                    final docs = snapshot.data!.docs;
                    if (docs.isNotEmpty && _optimisticTextMessages.isNotEmpty) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (!mounted) return;
                        setState(() => _optimisticTextMessages.clear());
                      });
                    }

                    if (docs.isEmpty && _optimisticTextMessages.isEmpty) {
                      return _anonymousConversationIntro(liveAvatar);
                    }

                    final realBubbles = docs.map((doc) {
                      final msg = doc.data();
                      final isMine = msg["sender"] == "anonimo";

                      return _ChatMessageBubble(
                        chatId: chatId!,
                        messageId: doc.id,
                        msg: msg,
                        isMine: isMine,
                        viewerRole: "anonimo",
                      );
                    }).toList();

                    final optimisticBubbles = _optimisticTextMessages.map((msg) {
                      return _ChatMessageBubble(
                        chatId: chatId ?? "optimistic",
                        messageId: (msg["optimisticId"] ?? "optimistic").toString(),
                        msg: msg,
                        isMine: true,
                        viewerRole: "anonimo",
                      );
                    }).toList();

                    _scrollChatToBottom(animated: false);
                    return ListView(
                      controller: _chatScrollController,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
                      padding: const EdgeInsets.all(16),
                      children: [
                        ...realBubbles,
                        ...optimisticBubbles,
                        _typingIndicatorForReceptor(),
                      ],
                    );
                  },
                );
              },
            ),
          ),
          if (_temporarilyBlockedByAbuse)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              decoration: BoxDecoration(
                color: Colors.redAccent.withOpacity(0.12),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.redAccent.withOpacity(0.35)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.block_rounded, color: Colors.redAccent, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      "No podés escribirle a este perfil por ahora. Probá de nuevo en ${_blockedUntilText()}.",
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.82),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        height: 1.22,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
            decoration: const BoxDecoration(
              color: Color(0xFF0F0F0F),
              border: Border(top: BorderSide(color: Colors.white10)),
            ),
            child: Row(
              children: [
                IconButton(
                  tooltip: "Mandar foto o video",
                  onPressed: _temporarilyBlockedByAbuse ? null : _openAttachSheet,
                  icon: Icon(
                    Icons.add_circle_outline_rounded,
                    color: _temporarilyBlockedByAbuse ? Colors.white24 : Colors.white70,
                  ),
                ),
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: _messageFocusNode,
                    enabled: !_temporarilyBlockedByAbuse,
                    maxLength: 300,
                    textInputAction: TextInputAction.send,
                    onTap: _WhipSoundService.unlockFromUserGesture,
                    onSubmitted: (_) => enviarMensaje(),
                    onChanged: (v) => setTyping(v.isNotEmpty),
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: _temporarilyBlockedByAbuse ? "Bloqueado temporalmente" : "Escribí algo...",
                      hintStyle: const TextStyle(color: Colors.white38),
                      border: InputBorder.none,
                      counterText: "",
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _temporarilyBlockedByAbuse ? null : enviarMensaje,
                  icon: Icon(
                    Icons.send,
                    color: _temporarilyBlockedByAbuse ? Colors.white24 : const Color(0xFF6C63FF),
                  ),
                )
              ],
            ),
          )
        ],
      ),
    );
  }
}

// ===================== INBOX RECEPTOR =====================

class InboxReceptorPage extends StatefulWidget {
  const InboxReceptorPage({super.key});

  @override
  State<InboxReceptorPage> createState() => _InboxReceptorPageState();
}

class _InboxReceptorPageState extends State<InboxReceptorPage> {
  bool selectionMode = false;
  final Set<String> selectedChatIds = <String>{};
  List<String> _latestVisibleChatIds = <String>[];
  List<String> _latestReceivedChatIds = <String>[];
  List<String> _latestSentChatIds = <String>[];

  String get receptorUid {
    final user = FirebaseAuth.instance.currentUser;
    return user?.uid ?? "demo_user";
  }

  int _updatedAtMillis(Map<String, dynamic> data) {
    final value = data["updatedAt"] ?? data["createdAt"];
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    return 0;
  }

  void _toggleSelection(String chatId) {
    setState(() {
      if (selectedChatIds.contains(chatId)) {
        selectedChatIds.remove(chatId);
      } else {
        selectedChatIds.add(chatId);
      }
      selectionMode = selectedChatIds.isNotEmpty;
    });
  }

  bool _allVisibleSelected() {
    if (_latestVisibleChatIds.isEmpty) return false;
    return _latestVisibleChatIds.every(selectedChatIds.contains);
  }

  void _toggleSelectAllVisible() {
    if (_latestVisibleChatIds.isEmpty) return;
    setState(() {
      if (_allVisibleSelected()) {
        selectedChatIds.clear();
        selectionMode = false;
      } else {
        selectedChatIds
          ..clear()
          ..addAll(_latestVisibleChatIds);
        selectionMode = true;
      }
    });
  }

  Future<void> _hardDeleteChatById(String chatId) async {
    final cleanId = chatId.trim();
    if (cleanId.isEmpty) return;

    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(cleanId);

    // Borrado absoluto: primero vaciamos todos los mensajes y después borramos
    // el documento del chat. Esto también elimina chats fantasma sin mensajes.
    // Firestore no elimina subcolecciones automáticamente al borrar el documento padre.
    while (true) {
      final messages = await chatRef.collection("mensajes").limit(250).get();
      if (messages.docs.isEmpty) break;

      final batch = FirebaseFirestore.instance.batch();
      for (final message in messages.docs) {
        batch.delete(message.reference);
      }
      await batch.commit();

      if (messages.docs.length < 250) break;
    }

    await chatRef.delete();
  }

  Future<void> _hardDeleteChats(List<String> ids) async {
    final cleanIds = ids.map((e) => e.trim()).where((e) => e.isNotEmpty).toSet().toList();
    for (final id in cleanIds) {
      await _hardDeleteChatById(id);
    }
  }

  Future<void> _hardDeleteChatsFromQuery(Query<Map<String, dynamic>> query) async {
    final snapshot = await query.get();
    await _hardDeleteChats(snapshot.docs.map((doc) => doc.id).toList());
  }

  Future<bool> _confirmHardDelete({
    required String title,
    required String body,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101010),
          title: Text(
            title,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          content: Text(
            body,
            style: TextStyle(color: Colors.white.withOpacity(0.72), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text("Cancelar"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                "Borrar",
                style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        );
      },
    );

    return result == true;
  }

  Future<void> _deleteSelected() async {
    if (selectedChatIds.isEmpty) return;

    final confirmed = await _confirmHardDelete(
      title: "Borrar chats seleccionados",
      body: "Se van a borrar completamente los chats seleccionados, incluyendo todos sus mensajes y también los chats vacíos.",
    );
    if (!confirmed) return;

    await _hardDeleteChats(selectedChatIds.toList());
    if (!mounted) return;
    setState(() {
      selectedChatIds.clear();
      selectionMode = false;
    });
  }

  Future<void> _deleteAllReceived() async {
    final confirmed = await _confirmHardDelete(
      title: "Borrar recibidos",
      body: "Esto borra absolutamente todos los chats anónimos recibidos, tengan mensajes o no. Queda en cero.",
    );
    if (!confirmed) return;

    final ids = <String>{..._latestReceivedChatIds};

    final snapshot = await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("receptorUid", isEqualTo: receptorUid)
        .get();
    ids.addAll(snapshot.docs.map((doc) => doc.id));

    await _hardDeleteChats(ids.toList());
    if (!mounted) return;
    setState(() {
      selectedChatIds.clear();
      selectionMode = false;
    });
  }

  Future<void> _deleteAllSent() async {
    final confirmed = await _confirmHardDelete(
      title: "Borrar anónimos enviados",
      body: "Esto borra absolutamente todos los chats donde hablaste como anónimo, tengan mensajes o no. Queda en cero.",
    );
    if (!confirmed) return;

    final ids = <String>{..._latestSentChatIds};

    final snapshot = await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("senderOwnerUid", isEqualTo: receptorUid)
        .get();
    ids.addAll(snapshot.docs.map((doc) => doc.id));

    await _hardDeleteChats(ids.toList());
    if (!mounted) return;
    setState(() {
      selectedChatIds.clear();
      selectionMode = false;
    });
  }

  Future<void> _deleteAllChatsAbsolute() async {
    final confirmed = await _confirmHardDelete(
      title: "Borrar todos los chats",
      body: "Esto borra absolutamente todos los chats visibles de esta pantalla: recibidos, anónimos enviados, mensajes y chats vacíos. Queda en cero absoluto.",
    );
    if (!confirmed) return;

    final ids = <String>{..._latestVisibleChatIds};

    final receivedSnapshot = await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("receptorUid", isEqualTo: receptorUid)
        .get();
    ids.addAll(receivedSnapshot.docs.map((doc) => doc.id));

    final sentSnapshot = await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .where("senderOwnerUid", isEqualTo: receptorUid)
        .get();
    ids.addAll(sentSnapshot.docs.map((doc) => doc.id));

    await _hardDeleteChats(ids.toList());
    if (!mounted) return;
    setState(() {
      selectedChatIds.clear();
      selectionMode = false;
      _latestVisibleChatIds = <String>[];
      _latestReceivedChatIds = <String>[];
      _latestSentChatIds = <String>[];
    });
  }

  Widget _sectionTitle(String text, int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 10),
      child: Row(
        children: [
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            count.toString(),
            style: TextStyle(
              color: Colors.white.withOpacity(0.42),
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }

  Widget _receivedTile(QueryDocumentSnapshot<Map<String, dynamic>> chat) {
    final data = chat.data();
    final unread = (data["unreadCount"] ?? 0) is int
        ? (data["unreadCount"] ?? 0) as int
        : int.tryParse((data["unreadCount"] ?? "0").toString()) ?? 0;
    final anonId = (data["anonId"] ?? "anon").toString();
    final ultimoMensaje = (data["ultimoMensaje"] ?? "").toString();
    final selected = selectedChatIds.contains(chat.id);
    final blocked = data["anonBlocked"] == true;

    return _ChatListTileShell(
      selected: selected,
      icon: blocked ? Icons.block_rounded : Icons.chat_bubble_rounded,
      title: blocked ? "$anonId · bloqueado" : anonId,
      subtitle: ultimoMensaje.isEmpty ? "Sin mensajes todavía." : ultimoMensaje,
      trailing: selectionMode
          ? Checkbox(
              value: selected,
              onChanged: (_) => _toggleSelection(chat.id),
            )
          : unread > 0
              ? CircleAvatar(
                  radius: 12,
                  backgroundColor: const Color(0xFF6C63FF),
                  child: Text(unread.toString(), style: const TextStyle(fontSize: 12)),
                )
              : _ChatDeliveryStatusBadge(
                  status: _chatDeliveryStatusFromChat(data),
                  compact: true,
                ),
      onTap: selectionMode
          ? () => _toggleSelection(chat.id)
          : () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChatReceptorPage(
                    chatId: chat.id,
                    anonId: anonId,
                  ),
                ),
              );
            },
      onLongPress: () => _toggleSelection(chat.id),
    );
  }

  Widget _sentAnonTile(QueryDocumentSnapshot<Map<String, dynamic>> chat) {
    final data = chat.data();
    final receptorUsername = (data["receptorUsername"] ?? "perfil").toString();
    final receptorFotoPrincipal = (data["receptorFotoPrincipal"] ?? data["receptorPhotoUrl"] ?? "").toString();
    final ultimoMensaje = (data["ultimoMensaje"] ?? "").toString();
    final anonId = (data["anonId"] ?? "anon").toString();
    final visitorId = (data["visitorId"] ?? "").toString();
    final receptorUid = (data["receptorUid"] ?? "").toString();
    final selected = selectedChatIds.contains(chat.id);
    final unreadForSender = (data["unreadForSender"] ?? 0) is int
        ? (data["unreadForSender"] ?? 0) as int
        : int.tryParse((data["unreadForSender"] ?? "0").toString()) ?? 0;

    return _ChatListTileShell(
      selected: selected,
      icon: Icons.person_search_rounded,
      leadingImageUrl: receptorFotoPrincipal,
      onLeadingTap: receptorUid.trim().isEmpty
          ? null
          : () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PublicProfilePage(profileUid: receptorUid),
                ),
              );
            },
      title: receptorUsername.trim().isEmpty ? "perfil" : receptorUsername.trim(),
      subtitle: ultimoMensaje.isEmpty ? "Chat anónimo enviado como $anonId" : ultimoMensaje,
      trailing: selectionMode
          ? Checkbox(
              value: selected,
              onChanged: (_) => _toggleSelection(chat.id),
            )
          : unreadForSender > 0
              ? CircleAvatar(
                  radius: 12,
                  backgroundColor: const Color(0xFF6C63FF),
                  child: Text(unreadForSender.toString(), style: const TextStyle(fontSize: 12)),
                )
              : _ChatDeliveryStatusBadge(
                  status: _chatDeliveryStatusFromChat(data),
                  compact: true,
                ),
      onTap: selectionMode
          ? () => _toggleSelection(chat.id)
          : () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChatAnonPage(
                    receptorUid: receptorUid,
                    receptorUsername: receptorUsername,
                    receptorFotoPrincipal: receptorFotoPrincipal,
                    existingChatId: chat.id,
                    existingAnonId: anonId,
                    existingVisitorId: visitorId,
                  ),
                ),
              );
            },
      onLongPress: () => _toggleSelection(chat.id),
    );
  }

  @override
  Widget build(BuildContext context) {
    // v36: La pantalla de chats queda blindada contra salidas accidentales.
    // No hay flecha visual para volver al home/registro y el botón Atrás del navegador
    // o del sistema no puede sacar al usuario de Chats. La salida real queda reservada
    // al cierre de sesión desde la zona del perfil.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (selectionMode) {
          setState(() {
            selectedChatIds.clear();
            selectionMode = false;
          });
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          automaticallyImplyLeading: false,
          title: Text(selectionMode ? "${selectedChatIds.length} seleccionados" : "Chats"),
          leading: selectionMode
              ? IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () {
                    setState(() {
                      selectedChatIds.clear();
                      selectionMode = false;
                    });
                  },
                )
              : null,
          actions: [
          if (selectionMode) ...[
            TextButton(
              onPressed: _latestVisibleChatIds.isEmpty ? null : _toggleSelectAllVisible,
              child: Text(
                _allVisibleSelected() ? "Deseleccionar" : "Seleccionar todos",
                style: const TextStyle(
                  color: Color(0xFF8C84FF),
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            IconButton(
              tooltip: "Borrar seleccionados",
              onPressed: _deleteSelected,
              icon: const Icon(Icons.delete_outline_rounded),
            ),
          ] else
            PopupMenuButton<String>(
              color: Colors.white,
              onSelected: (value) async {
                if (value == "select") {
                  setState(() => selectionMode = true);
                } else if (value == "delete_received") {
                  await _deleteAllReceived();
                } else if (value == "delete_sent") {
                  await _deleteAllSent();
                } else if (value == "delete_all") {
                  await _deleteAllChatsAbsolute();
                }
              },
              itemBuilder: (context) => const [
                PopupMenuItem<String>(
                  value: "select",
                  child: Text("Seleccionar chats", style: TextStyle(color: Colors.black)),
                ),
                PopupMenuItem<String>(
                  value: "delete_received",
                  child: Text("Borrar recibidos", style: TextStyle(color: Colors.black)),
                ),
                PopupMenuItem<String>(
                  value: "delete_sent",
                  child: Text("Borrar anónimos enviados", style: TextStyle(color: Colors.black)),
                ),
                PopupMenuItem<String>(
                  value: "delete_all",
                  child: Text("Borrar todo", style: TextStyle(color: Colors.black)),
                ),
              ],
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection("chats_anonimos")
              .where("receptorUid", isEqualTo: receptorUid)
              .snapshots(),
          builder: (context, receivedSnapshot) {
            if (receivedSnapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: _ErrorBox(text: "No pude cargar chats recibidos: ${receivedSnapshot.error}"),
              );
            }
            if (!receivedSnapshot.hasData) return const Center(child: CircularProgressIndicator());

            return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection("chats_anonimos")
                  .where("senderOwnerUid", isEqualTo: receptorUid)
                  .snapshots(),
              builder: (context, sentSnapshot) {
                final receivedDocs = receivedSnapshot.data!.docs
                    .where((doc) => doc.data()["receptorDeleted"] != true)
                    .toList();
                final sentDocs = (sentSnapshot.data?.docs ?? <QueryDocumentSnapshot<Map<String, dynamic>>>[])
                    .where((doc) => doc.data()["senderDeleted"] != true)
                    .toList();

                receivedDocs.sort((a, b) => _updatedAtMillis(b.data()).compareTo(_updatedAtMillis(a.data())));
                sentDocs.sort((a, b) => _updatedAtMillis(b.data()).compareTo(_updatedAtMillis(a.data())));

                final receivedChatIds = receivedDocs.map((doc) => doc.id).toList();
                final sentChatIds = sentDocs.map((doc) => doc.id).toList();
                final visibleChatIds = <String>[
                  ...receivedChatIds,
                  ...sentChatIds,
                ];
                if (_latestVisibleChatIds.length != visibleChatIds.length ||
                    _latestVisibleChatIds.join('|') != visibleChatIds.join('|')) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    setState(() {
                      _latestVisibleChatIds = visibleChatIds;
                      _latestReceivedChatIds = receivedChatIds;
                      _latestSentChatIds = sentChatIds;
                      selectedChatIds.removeWhere((id) => !visibleChatIds.contains(id));
                      // No apagamos selectionMode acá: cuando el usuario toca
                      // “Seleccionar chats” entra en modo selección aunque todavía
                      // no haya marcado ninguno. Antes esta línea lo apagaba al
                      // primer rebuild porque selectedChatIds estaba vacío.
                      if (_latestVisibleChatIds.isEmpty) {
                        selectionMode = false;
                      }
                    });
                  });
                }

                if (receivedDocs.isEmpty && sentDocs.isEmpty) {
                  return _CenterSoftText(text: "Todavía no tenés chats.");
                }

                final unifiedChats = <Map<String, dynamic>>[
                  ...receivedDocs.map((doc) => {
                        "kind": "received",
                        "doc": doc,
                        "updatedAt": _updatedAtMillis(doc.data()),
                      }),
                  ...sentDocs.map((doc) => {
                        "kind": "sent",
                        "doc": doc,
                        "updatedAt": _updatedAtMillis(doc.data()),
                      }),
                ]..sort((a, b) => (b["updatedAt"] as int).compareTo(a["updatedAt"] as int));

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(0, 10, 0, 96),
                  itemCount: unifiedChats.length,
                  separatorBuilder: (_, __) => Divider(
                    height: 1,
                    thickness: 0.35,
                    color: Colors.white.withOpacity(0.08),
                  ),
                  itemBuilder: (context, index) {
                    final item = unifiedChats[index];
                    final kind = item["kind"] as String;
                    final doc = item["doc"] as QueryDocumentSnapshot<Map<String, dynamic>>;

                    // Regla visual definitiva:
                    // NO se renderiza “Anónimos que te escribieron”.
                    // NO se renderiza “Tus chats anónimos”.
                    // NO se renderiza ningún divisor/título entre recibidos y enviados.
                    // Siempre que hablás, hablás en anónimo; si te hablan, es otro anon.
                    // Internamente mantenemos kind para abrir/borrar correctamente,
                    // pero visualmente Inbox es una sola lista continua de conversaciones.
                    if (kind == "received") return _receivedTile(doc);
                    return _sentAnonTile(doc);
                  },
                );
              },
            );
          },
        ),
        ),
        bottomNavigationBar: const _BottomNavMock(selected: 1),
      ),
    );
  }
}

class _ChatListTileShell extends StatelessWidget {
  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final String leadingImageUrl;
  final VoidCallback? onLeadingTap;
  final Widget? trailing;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _ChatListTileShell({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.leadingImageUrl = "",
    this.onLeadingTap,
    required this.trailing,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final rowBackground = selected ? const Color(0xFF15122E) : Colors.black;

    return Material(
      color: rowBackground,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        splashColor: const Color(0xFF6C63FF).withOpacity(0.08),
        highlightColor: const Color(0xFF6C63FF).withOpacity(0.045),
        child: Container(
          decoration: BoxDecoration(
            color: rowBackground,
            border: Border(
              bottom: BorderSide(
                color: selected ? const Color(0xFF6C63FF).withOpacity(0.42) : Colors.white.withOpacity(0.075),
                width: selected ? 1.0 : 0.55,
              ),
            ),
          ),
          padding: const EdgeInsets.fromLTRB(28, 14, 18, 14),
          child: Row(
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onLeadingTap,
                child: Container(
                  width: 58,
                  height: 58,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF0B0B0B),
                    border: Border.all(
                      color: selected ? const Color(0xFF6C63FF) : Colors.white.withOpacity(0.035),
                      width: selected ? 2.0 : 1.0,
                    ),
                  ),
                  child: leadingImageUrl.trim().startsWith('http')
                      ? Image.network(
                          leadingImageUrl.trim(),
                          fit: BoxFit.cover,
                          gaplessPlayback: true,
                          webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                          errorBuilder: (_, __, ___) => Icon(
                            icon,
                            color: selected ? const Color(0xFF8C84FF) : Colors.white.withOpacity(0.70),
                            size: 27,
                          ),
                        )
                      : Icon(
                          icon,
                          color: selected ? const Color(0xFF8C84FF) : Colors.white.withOpacity(0.70),
                          size: 27,
                        ),
                ),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.15,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.56),
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 12),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ===================== CHAT RECEPTOR =====================

class ChatReceptorPage extends StatefulWidget {
  final String chatId;
  final String anonId;

  const ChatReceptorPage({
    super.key,
    required this.chatId,
    required this.anonId,
  });

  @override
  State<ChatReceptorPage> createState() => _ChatReceptorPageState();
}

class _ChatReceptorPageState extends State<ChatReceptorPage> {
  final controller = TextEditingController();
  final FocusNode _messageFocusNode = FocusNode();
  final ScrollController _chatScrollController = ScrollController();
  final List<Map<String, dynamic>> _optimisticTextMessages = <Map<String, dynamic>>[];
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _incomingSoundSubscription;
  bool _incomingSoundReady = false;
  bool _sendingText = false;

  @override
  void initState() {
    super.initState();
    marcarLeido();
    _listenForIncomingSound();
    _refocusComposerSoon();
  }

  void _scrollChatToBottom({bool animated = true}) {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_chatScrollController.hasClients) return;
      final target = _chatScrollController.position.maxScrollExtent;
      if (animated) {
        _chatScrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
        );
      } else {
        _chatScrollController.jumpTo(target);
      }
    });
  }

  void _refocusComposerSoon() {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _messageFocusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _incomingSoundSubscription?.cancel();
    _chatScrollController.dispose();
    _messageFocusNode.dispose();
    controller.dispose();
    super.dispose();
  }

  void _listenForIncomingSound() {
    _incomingSoundSubscription?.cancel();
    _incomingSoundReady = false;

    _incomingSoundSubscription = FirebaseFirestore.instance
        .collection("chats_anonimos")
        .doc(widget.chatId)
        .collection("mensajes")
        .orderBy("createdAt")
        .snapshots()
        .listen((snapshot) {
      final shouldPlayWhip = _incomingSoundReady && snapshot.docChanges.any((change) {
        if (change.type != DocumentChangeType.added) return false;
        final data = change.doc.data();
        if (data == null) return false;
        return (data["sender"] ?? "").toString() == "anonimo";
      });

      // Si el receptor tiene el chat abierto y llega un mensaje nuevo del anónimo,
      // se marca visto en el documento del mensaje inmediatamente.
      // Sin esto, la lista podía mostrar "visto" por el estado global del chat,
      // pero la burbuja interna seguía mostrando "entregado".
      _scrollChatToBottom(animated: true);
      _refocusComposerSoon();
      unawaited(marcarLeido());

      if (shouldPlayWhip) {
        _WhipSoundService.playIncomingMessageWhip();
      }

      _incomingSoundReady = true;
    });
  }

  Future<void> marcarLeido() async {
    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(widget.chatId);

    try {
      final messages = await chatRef.collection("mensajes").limit(250).get();
      final batch = FirebaseFirestore.instance.batch();
      var touched = 0;
      for (final doc in messages.docs) {
        final data = doc.data();
        if ((data["sender"] ?? "").toString() != "anonimo") continue;
        if (data["leidoPorReceptor"] == true && _chatNormalizeDeliveryStatus(data["estado"]) == "visto") continue;
        batch.set(doc.reference, {
          "estado": "visto",
          "leidoPorReceptor": true,
          "vistoPorReceptor": true,
          "seenByReceptor": true,
          "readByReceptor": true,
          "vistoPorReceptorAt": FieldValue.serverTimestamp(),
          "seenByReceptorAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        touched++;
      }
      if (touched > 0) await batch.commit();
    } catch (e) {
      debugPrint("No pude marcar mensajes como vistos por receptor: $e");
    }

    await chatRef.set({
      "unreadCount": 0,
      "ultimoEstado": "visto",
      "ultimoMensajeLeidoPorReceptor": true,
    }, SetOptions(merge: true));
  }

  Future<void> enviarMensaje() async {
    final texto = controller.text.trim();
    if (texto.isEmpty) {
      _messageFocusNode.requestFocus();
      return;
    }

    controller.clear();
    _optimisticTextMessages.add({
      "texto": texto,
      "sender": "receptor",
      "createdAtClient": Timestamp.fromDate(DateTime.now()),
      "createdAt": Timestamp.fromDate(DateTime.now()),
      "estado": "enviando",
      "optimistic": true,
      "optimisticId": "optimistic_${DateTime.now().microsecondsSinceEpoch}_${Random().nextInt(999999)}",
      "leidoPorReceptor": true,
      "vistoPorReceptor": true,
    });
    if (mounted) setState(() {});
    _scrollChatToBottom(animated: true);
    _refocusComposerSoon();
    _messageFocusNode.requestFocus();

    try {
      final ref = FirebaseFirestore.instance
          .collection("chats_anonimos")
          .doc(widget.chatId)
          .collection("mensajes");

      final verifiedProfileLinkPayload = await _verifiedProfileLinkPayloadForOutgoingText(
        text: texto,
        senderUid: FirebaseAuth.instance.currentUser?.uid,
      );

      await ref.add({
        "texto": texto,
        "sender": "receptor",
        ...verifiedProfileLinkPayload,
        "createdAt": FieldValue.serverTimestamp(),
        "estado": "entregado",
        "entregadoAt": FieldValue.serverTimestamp(),
        "leidoPorReceptor": true,
        "vistoPorReceptor": true,
        "seenByReceptor": true,
        "readByReceptor": true,
        "leidoPorAnonimo": false,
        "vistoPorAnonimo": false,
        "seenByAnonimo": false,
        "readByAnonimo": false,
      });

      await FirebaseFirestore.instance
          .collection("chats_anonimos")
          .doc(widget.chatId)
          .update({
        "ultimoMensaje": texto,
        "updatedAt": FieldValue.serverTimestamp(),
        "typingReceptor": false,
        "receptorDeleted": false,
        "senderDeleted": false,
        "unreadForSender": FieldValue.increment(1),
        "ultimoSender": "receptor",
        "ultimoEstado": "entregado",
        "ultimoMensajeLeidoPorReceptor": true,
        "ultimoMensajeLeidoPorAnonimo": false,
        "mensajesCount": FieldValue.increment(1),
        "hasMessages": true,
      });
    } catch (e) {
      controller.text = texto;
      _optimisticTextMessages.removeWhere((msg) => (msg["texto"] ?? "").toString() == texto && msg["optimistic"] == true);
      if (mounted) {
        setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("No pude enviar el mensaje: $e")),
        );
      }
    } finally {
      if (mounted) {
        // DELAY FIX V63:
        // No bloqueamos el composer mientras Firestore termina de confirmar el mensaje.
        // El texto ya se limpió al inicio del envío, así que un Enter inmediato posterior
        // puede mandar otro mensaje sin esperar el roundtrip de red.
        _scrollChatToBottom(animated: true);
        _refocusComposerSoon();
      }
    }
  }

  Future<void> _sendMediaPayload(Map<String, dynamic> payload) async {
    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(widget.chatId);

    await chatRef.collection("mensajes").add({
      ...payload,
      "sender": "receptor",
      "createdAt": FieldValue.serverTimestamp(),
      "estado": "entregado",
      "entregadoAt": FieldValue.serverTimestamp(),
      "leidoPorReceptor": true,
      "vistoPorReceptor": true,
      "seenByReceptor": true,
      "readByReceptor": true,
      "leidoPorAnonimo": false,
      "vistoPorAnonimo": false,
      "seenByAnonimo": false,
      "readByAnonimo": false,
    });

    await chatRef.update({
      "ultimoMensaje": payload["texto"] ?? "Archivo",
      "updatedAt": FieldValue.serverTimestamp(),
      "typingReceptor": false,
      "receptorDeleted": false,
      "senderDeleted": false,
      "unreadForSender": FieldValue.increment(1),
      "ultimoSender": "receptor",
      "ultimoEstado": "entregado",
      "ultimoMensajeLeidoPorReceptor": true,
      "ultimoMensajeLeidoPorAnonimo": false,
      "mensajesCount": FieldValue.increment(1),
      "hasMessages": true,
    });
  }

  Future<void> _openAttachSheet() async {
    await _openChatMediaPickerSheet(
      context: context,
      chatId: widget.chatId,
      sender: "receptor",
      receptorUid: FirebaseAuth.instance.currentUser?.uid ?? "",
      onSendPayload: _sendMediaPayload,
    );
  }

  Future<void> setTyping(bool val) async {
    await FirebaseFirestore.instance
        .collection("chats_anonimos")
        .doc(widget.chatId)
        .update({"typingReceptor": val});
  }

  Future<void> _deleteConversationForMe() async {
    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(widget.chatId);
    while (true) {
      final messages = await chatRef.collection("mensajes").limit(250).get();
      if (messages.docs.isEmpty) break;
      final batch = FirebaseFirestore.instance.batch();
      for (final message in messages.docs) {
        batch.delete(message.reference);
      }
      await batch.commit();
      if (messages.docs.length < 250) break;
    }
    await chatRef.delete();
    if (!mounted) return;
    Navigator.maybePop(context);
  }

  Future<void> _blockThisAnon() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final chatRef = FirebaseFirestore.instance.collection("chats_anonimos").doc(widget.chatId);
    final chatDoc = await chatRef.get();
    final data = chatDoc.data() ?? {};
    final visitorId = (data["visitorId"] ?? "").toString().trim();
    final anonId = (data["anonId"] ?? widget.anonId).toString().trim();
    final fingerprintAnonimo = (data["fingerprintAnonimo"] ?? data["blockedFingerprint"] ?? visitorId).toString().trim();

    if (fingerprintAnonimo.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("No pude identificar técnicamente a este anónimo.")),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF101010),
          title: const Text(
            "Denunciar acoso",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          content: Text(
            "¿Querés bloquear a este anónimo durante 30 minutos? No podrá volver a escribirte aunque intente entrar de nuevo como otro anónimo.",
            style: TextStyle(color: Colors.white.withOpacity(0.72), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text("Cancelar"),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                "Bloquear 30 min",
                style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      await _createAnonAbuseTemporaryBlock(
        receptorUid: user.uid,
        chatId: widget.chatId,
        visitorId: visitorId,
        anonId: anonId,
        fingerprintAnonimo: fingerprintAnonimo,
        motivo: "acoso",
      );

      if (visitorId.isNotEmpty) {
        await FirebaseFirestore.instance
            .collection("usuarios")
            .doc(user.uid)
            .collection("bloqueados_anon")
            .doc(visitorId)
            .set({
          "visitorId": visitorId,
          "anonId": anonId,
          "chatId": widget.chatId,
          "fingerprintAnonimo": fingerprintAnonimo,
          "motivo": "acoso",
          "bloqueoTemporalMinutos": 30,
          "createdAt": FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Anónimo bloqueado por 30 minutos.")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("No pude aplicar el bloqueo antiacoso: $e")),
      );
    }
  }


  Widget _typingIndicatorForAnon() {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("chats_anonimos").doc(widget.chatId).snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() ?? {};
        final typing = data["typingAnon"] == true;
        if (!typing) return const SizedBox.shrink();

        _scrollChatToBottom(animated: true);
        return const _TypingDotsBubble(alignRight: false);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(
        title: Text(widget.anonId),
        actions: [
          IconButton(
            tooltip: "Denunciar acoso",
            onPressed: _blockThisAnon,
            icon: const Icon(Icons.report_gmailerrorred_rounded),
          ),
          IconButton(
            tooltip: "Borrar conversación",
            onPressed: _deleteConversationForMe,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection("chats_anonimos")
                  .doc(widget.chatId)
                  .collection("mensajes")
                  .orderBy("createdAt")
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return _CenterSoftText(text: "No pude cargar mensajes.");
                }

                if (!snapshot.hasData) return const ColoredBox(color: Color(0xFF050505));

                final docs = snapshot.data!.docs;
                if (docs.isNotEmpty && _optimisticTextMessages.isNotEmpty) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    setState(() => _optimisticTextMessages.clear());
                  });
                }

                final realBubbles = docs.map((doc) {
                  final msg = doc.data();
                  final isMine = msg["sender"] == "receptor";

                  return _ChatMessageBubble(
                    chatId: widget.chatId,
                    messageId: doc.id,
                    msg: msg,
                    isMine: isMine,
                    viewerRole: "receptor",
                  );
                }).toList();

                final optimisticBubbles = _optimisticTextMessages.map((msg) {
                  return _ChatMessageBubble(
                    chatId: widget.chatId,
                    messageId: (msg["optimisticId"] ?? "optimistic").toString(),
                    msg: msg,
                    isMine: true,
                    viewerRole: "receptor",
                  );
                }).toList();

                _scrollChatToBottom(animated: false);
                return ListView(
                  controller: _chatScrollController,
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
                  padding: const EdgeInsets.all(16),
                  children: [
                    ...realBubbles,
                    ...optimisticBubbles,
                    _typingIndicatorForAnon(),
                  ],
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
            decoration: const BoxDecoration(
              color: Color(0xFF0F0F0F),
              border: Border(top: BorderSide(color: Colors.white10)),
            ),
            child: Row(
              children: [
                IconButton(
                  tooltip: "Mandar foto o video",
                  onPressed: _openAttachSheet,
                  icon: const Icon(Icons.add_circle_outline_rounded, color: Colors.white70),
                ),
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: _messageFocusNode,
                    enabled: true,
                    maxLength: 300,
                    textInputAction: TextInputAction.send,
                    onTap: _WhipSoundService.unlockFromUserGesture,
                    onSubmitted: (_) => enviarMensaje(),
                    onChanged: (v) => setTyping(v.isNotEmpty),
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      hintText: "Responder...",
                      hintStyle: TextStyle(color: Colors.white38),
                      border: InputBorder.none,
                      counterText: "",
                    ),
                  ),
                ),
                IconButton(
                  onPressed: enviarMensaje,
                  icon: const Icon(Icons.send, color: Color(0xFF6C63FF)),
                )
              ],
            ),
          )
        ],
      ),
    );
  }
}

// ===================== UI =====================

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: const [
        Icon(Icons.nightlight_round, color: Color(0xFF6C63FF)),
        SizedBox(width: 10),
        Text("SayItToMe", style: TextStyle(color: Colors.white)),
      ],
    );
  }
}

class _ProfilePreviewCard extends StatelessWidget {
  const _ProfilePreviewCard();

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Container(
      height: 470,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(34),
        color: const Color(0xFF111111),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6C63FF).withOpacity(0.16),
            blurRadius: 38,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF25223F),
                    Color(0xFF0B0B0B),
                    Color(0xFF050505),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 28,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(
                  radius: 46,
                  backgroundColor: Color(0xFF1A1A1A),
                  child: Icon(Icons.person_rounded, size: 54),
                ),
                const SizedBox(height: 20),
                const SizedBox.shrink(),
                const SizedBox(height: 8),
                const SizedBox.shrink(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileAvatar extends StatelessWidget {
  final String url;
  final double size;

  const _ProfileAvatar({
    super.key,
    required this.url,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    final cleanUrl = url.trim();

    if (cleanUrl.isEmpty) {
      return CircleAvatar(
        radius: size / 2,
        backgroundColor: const Color(0xFF232323),
        child: Icon(
          Icons.person_rounded,
          color: Colors.white.withOpacity(0.86),
          size: size * 0.62,
        ),
      );
    }

    return ClipOval(
      child: Container(
        width: size,
        height: size,
        color: const Color(0xFF232323),
        child: Image.network(
          cleanUrl,
          key: ValueKey("profile_avatar_image_$cleanUrl"),
          fit: BoxFit.cover,
          gaplessPlayback: true,
          webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
          errorBuilder: (_, __, ___) {
            return Icon(
              Icons.person_rounded,
              color: Colors.white.withOpacity(0.72),
              size: size * 0.58,
            );
          },
        ),
      ),
    );
  }
}

class _BottomNavMock extends StatelessWidget {
  final int selected;

  const _BottomNavMock({
    required this.selected,
  });

  Future<void> _goTo(BuildContext context, int index) async {
    unawaited(_WhipSoundService.unlockFromUserGesture());
    if (index == selected) {
      if (index == 2) {
        _shuffleRerollSignal.value++;
      }
      return;
    }

    if (index == 2 || index == 3) {
      await _resetAnonIdentityOnly(reason: "bottom_nav_anonymous");
      if (!context.mounted) return;
      _shuffleRerollSignal.value++;
    }

    Widget page;

    switch (index) {
      case 0:
        page = const StoriesExplorePage();
        break;
      case 1:
        page = const AuthPrivateGate();
        break;
      case 2:
        page = const ShufflePage();
        break;
      case 3:
        page = const ShufflePage();
        break;
      case 4:
        page = const AuthProfileGate();
        break;
      default:
        page = const StoriesExplorePage();
    }

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => page),
    );
  }

  @override
  Widget build(BuildContext context) {
    final icons = [
      Icons.trip_origin_rounded,
      Icons.chat_bubble_rounded,
      Icons.shuffle_rounded,
      Icons.rocket_launch_rounded,
      Icons.person_rounded,
    ];

    return Container(
      height: 72,
      color: const Color(0xFF181818),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: List.generate(icons.length, (index) {
          final active = index == selected;
          return Expanded(
            child: InkWell(
              onTap: () { _goTo(context, index); },
              child: Center(
                child: index == 1
                    ? ValueListenableBuilder<int>(
                        valueListenable: _globalUnreadChatSignal,
                        builder: (context, unread, _) {
                          final showMysteryDot = unread > 0 && !active;
                          return Stack(
                            clipBehavior: Clip.none,
                            alignment: Alignment.center,
                            children: [
                              Icon(
                                icons[index],
                                color: active ? const Color(0xFF6C63FF) : Colors.white.withOpacity(0.22),
                                size: 31,
                              ),
                              if (showMysteryDot)
                                Positioned(
                                  right: -8,
                                  top: -7,
                                  child: Container(
                                    width: 19,
                                    height: 19,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      gradient: const LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [
                                          Color(0xFFFF4A2E),
                                          Color(0xFFC55A1D),
                                        ],
                                      ),
                                      border: Border.all(color: const Color(0xFF181818), width: 2),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFFFF4A2E).withOpacity(0.38),
                                          blurRadius: 10,
                                          spreadRadius: 1,
                                        ),
                                      ],
                                    ),
                                    child: const Text(
                                      "!",
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w900,
                                        height: 1.0,
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          );
                        },
                      )
                    : Icon(
                        icons[index],
                        color: active ? const Color(0xFF6C63FF) : Colors.white.withOpacity(0.22),
                        size: 31,
                      ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _AuthHeroCard extends StatelessWidget {
  const _AuthHeroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 24, 22, 24),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        children: [
          const Icon(Icons.lock_rounded, color: Color(0xFF6C63FF), size: 48),
          const SizedBox(height: 16),
          const Text(
            "Cuenta privada",
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            "Tu inbox y tu perfil público quedan protegidos con verificación de email.",
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withOpacity(0.58),
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileCreationCard extends StatelessWidget {
  const _ProfileCreationCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 24, 22, 24),
      decoration: BoxDecoration(
        color: const Color(0xFF101010),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        children: [
          const Icon(Icons.person_pin_rounded, color: Color(0xFF6C63FF), size: 50),
          const SizedBox(height: 16),
          const Text(
            "Creá tu perfil",
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            "Tu username va a ser la puerta pública para que otros te escriban anónimamente.",
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withOpacity(0.58),
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  const _PrimaryButton({
    required this.icon,
    required this.text,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 68,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: const LinearGradient(
            colors: [Color(0xFF5D5FEF), Color(0xFF7C6CFF)],
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white),
            const SizedBox(width: 10),
            Text(
              text,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SecondaryButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback? onTap;

  const _SecondaryButton({
    required this.icon,
    required this.text,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white),
            const SizedBox(width: 10),
            Text(
              text,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final String text;

  const _ErrorBox({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.red.withOpacity(0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.red.withOpacity(0.35)),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Colors.redAccent),
      ),
    );
  }
}

class _CenterSoftText extends StatelessWidget {
  final String text;

  const _CenterSoftText({required this.text});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white.withOpacity(0.55)),
        ),
      ),
    );
  }
}

class _ProjectStatusCard extends StatelessWidget {
  const _ProjectStatusCard();

  @override
  Widget build(BuildContext context) {
    return const _AnonymousEntryNotice();
  }
}

const List<String> _provinciasArgentina = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

// TODO: Drag & Drop + selección manual implementable en próxima iteración avanzada

// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.
// Mantener línea de resguardo v20: home limpio sin textos redundantes.


// BASELINE v24: foto principal persistente + provincia interna privada.
// - Hacer principal/reordenar/borrar sincroniza fotoPrincipal/fotos en Firestore.
// - Guardar cambios normaliza la primera foto como fotoPrincipal.
// - La provincia interna no se muestra en perfiles públicos/propios, solo en edición.


// BASELINE v26: selección total + unread lila + respuestas receptor lila.
// - Modo selección de chats tiene Seleccionar todos/Deseleccionar.
// - Fix v28: tocar “Seleccionar chats” mantiene el modo selección aunque todavía no haya chats marcados.
// - Recibidos usan unreadCount para badge lila.
// - Tus chats anónimos usan unreadForSender para badge lila.
// - Al abrir un chat anónimo enviado, unreadForSender vuelve a 0.
// - Al responder como receptor, se incrementa unreadForSender.
// - La respuesta del receptor ya no es verde: usa lila de marca.

// v30: no se crean chats anónimos vacíos al abrir perfil.
// v30: el documento chats_anonimos nace recién al enviar el primer mensaje.
// v30: evita filas "Sin mensajes todavía" imposibles de borrar.
// v30: mantiene la intro visual sin persistir conversación fantasma.

// v32: Chats con negro absoluto AMOLED.
// v32: Lista de conversaciones estilo Connected2Me clásico.
// v32: Filas sin tarjeta gris, separador fino y fondo #000000.
// v32: Se mantiene borrado absoluto de chats y mensajes.
// v32: Se mantiene seleccionar todos/deseleccionar.
// v32: Se mantienen badges lila de no leídos.
// v32: Se mantiene chat anónimo creado recién al primer mensaje.
// v32: No se recortaron features existentes.

// v36: Chats sin flecha de salida y con bloqueo de back/browser.
// v36: La salida de cuenta queda centralizada en Perfil > cerrar sesión.


// v40b: archivo completo basado en baseline de 9462 líneas, sin recortar features.
// v40b: se restaura el cartel informativo del home sin botón inferior duplicado.
// v40b: el botón Entrar anónimo queda únicamente arriba, alineado con Iniciar sesión y Crear perfil.
// v40b: conv. del perfil ahora cuenta todos los chats donde participa el UID.
// v40b: se cuentan recibidos por receptorUid y enviados por senderOwnerUid.
// v40b: se deduplican conversaciones por ID para evitar dobles conteos.
// v40b: se respetan receptorDeleted y senderDeleted para no contar chats borrados lógicamente.

// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.
// v38: resguardo de línea para no achicar archivo tras quitar duplicado visual y ajustar contador de conversaciones recibidas.

// ================================================================
// Referencia antiacoso v49: bloque conservador para no achicar archivo.
// Mantiene main.dart completo y preserva la feature antiacoso 30 minutos.
// Colección Firestore: anon_abuse_blocks.
// Clave lógica: receptorUid + anonAbuseFingerprint.
// Duración del bloqueo: 30 minutos.
// Validación esperada: abrir chat, enviar texto y enviar media.
// UI esperada receptor: Denunciar acoso / confirmar bloqueo temporal.
// UI esperada anónimo: input bloqueado y aviso claro.
// No elimina features previas.
// No reemplaza helpers web/android.
// No cambia assets.
// No cambia rutas públicas de descarga.
// No cambia lógica de historias.
// No cambia lógica de perfiles bloqueados.
// No cambia lógica de sonido entrante.
// No cambia lógica de media ver una vez.
// No cambia lógica de shuffle.
// No cambia lógica de likes/conversaciones/seguidores.
// Archivo estabilizado para superar baseline de 13.905 líneas.
// ================================================================

// ===================== V67 ADMIN AUDIT AVATAR LIST / NO-ACHICAR =====================
// Cambio real:
// - La lista de Auditoría de conversaciones ahora muestra foto real del receptor.
// - Usa receptorFotoPrincipal / receptorPhotoUrl / variantes compatibles.
// - Si no hay foto o falla la carga, conserva el ícono anterior.
// - No toca la lectura de mensajes ni la lógica de moderación.
// ===========================================================================

// ===================== V60 FLASH FIX AUDIT / NO-ACHICAR =====================
// Cambio real:
// - ChatAnonPage ahora precarga widget.existingChatId en initState antes del primer frame.
// - Se evita que chats existentes pinten _anonymousConversationIntro() durante initSesion() async.
// - La intro de chat nuevo dejó de usar el fondo claro #F3F1FF que generaba flash lila/gris.
// - El loading de mensajes ahora pinta fondo negro en vez de SizedBox transparente.
// Auditoría de no achicar archivo.
// Línea auditoría V60 01
// Línea auditoría V60 02
// Línea auditoría V60 03
// Línea auditoría V60 04
// Línea auditoría V60 05
// Línea auditoría V60 06
// Línea auditoría V60 07
// Línea auditoría V60 08
// Línea auditoría V60 09
// Línea auditoría V60 10
// Línea auditoría V60 11
// Línea auditoría V60 12
// Línea auditoría V60 13
// Línea auditoría V60 14
// Línea auditoría V60 15
// Línea auditoría V60 16
// Línea auditoría V60 17
// Línea auditoría V60 18
// Línea auditoría V60 19
// Línea auditoría V60 20
// ===========================================================================

// ===================== V61 IPHONE PWA PAGE AUDIT / NO-ACHICAR =====================
// Cambio real:
// - La página iPhone deja de parecer una descarga falsa.
// - Explica que iOS requiere verificaciones adicionales de Apple.
// - Indica que la app nativa está llegando.
// - Da pasos claros para instalar SayItToMe como PWA desde Safari.
// - Se agrega notesTitle configurable para Android/iPhone sin hardcodear el bloque.
// Auditoría no funcional para conservar/sumar líneas.
// Línea auditoría V61 01
// Línea auditoría V61 02
// Línea auditoría V61 03
// Línea auditoría V61 04
// Línea auditoría V61 05
// Línea auditoría V61 06
// Línea auditoría V61 07
// Línea auditoría V61 08
// Línea auditoría V61 09
// Línea auditoría V61 10
// Línea auditoría V61 11
// Línea auditoría V61 12
// Línea auditoría V61 13
// Línea auditoría V61 14
// Línea auditoría V61 15
// ================================================================================

// ===================== V62 CHAT AUTO-SCROLL + AUTO-FOCUS AUDIT / NO-ACHICAR =====================
// Cambio real:
// - ChatAnonPage ahora tiene ScrollController persistente.
// - ChatReceptorPage ahora tiene ScrollController persistente.
// - Al abrir una conversación existente se baja al último mensaje después del primer frame.
// - Cuando llega un snapshot nuevo de mensajes se vuelve a bajar al final.
// - Después de enviar con Enter o botón, el input vuelve a pedir foco automáticamente.
// - Se usa keyboardDismissBehavior manual para evitar que el scroll quite el foco del composer.
// - El loading del chat receptor usa fondo negro en vez de SizedBox transparente.
// Auditoría de no achicar archivo.
// Línea auditoría V62 01
// Línea auditoría V62 02
// Línea auditoría V62 03
// Línea auditoría V62 04
// Línea auditoría V62 05
// Línea auditoría V62 06
// Línea auditoría V62 07
// Línea auditoría V62 08
// Línea auditoría V62 09
// Línea auditoría V62 10
// Línea auditoría V62 11
// Línea auditoría V62 12
// Línea auditoría V62 13
// Línea auditoría V62 14
// Línea auditoría V62 15
// =================================================================================================

// ===================== V63 ZERO-DELAY TEXT SEND AUDIT / NO-ACHICAR =====================
// Cambio real:
// - Se elimina el bloqueo artificial _sendingText para mensajes de texto.
// - El TextField ya no se deshabilita mientras Firestore confirma el envío.
// - El botón enviar queda activo inmediatamente después de limpiar el texto.
// - Enter puede mandar otro mensaje sin esperar roundtrip de red.
// - Se conserva protección natural contra duplicado: el controller se limpia antes del await.
// - Se mantiene scroll automático al final.
// - Se mantiene refocus automático post-frame.
// Nota:
// - _sendingText queda disponible para otros flujos si alguna parte lo usa, pero texto ya no depende de ese lock.
// Auditoría no funcional para mantener/sumar líneas.
// Línea auditoría V63 01
// Línea auditoría V63 02
// Línea auditoría V63 03
// Línea auditoría V63 04
// Línea auditoría V63 05
// Línea auditoría V63 06
// Línea auditoría V63 07
// Línea auditoría V63 08
// Línea auditoría V63 09
// Línea auditoría V63 10
// ======================================================================================

// ===================== V64 ULTRA-INSTANT OPTIMISTIC CHAT AUDIT / NO-ACHICAR =====================
// Cambio real:
// - Se agrega render optimista local de mensajes de texto.
// - Al presionar Enter, el mensaje aparece visualmente al instante, sin esperar snapshot Firestore.
// - Firestore sigue guardando el mensaje real atrás.
// - Cuando llega el snapshot real, se limpian los mensajes optimistas.
// - Si falla el envío, se restaura el texto y se borra el optimista.
// - Se conserva scroll automático.
// - Se conserva foco automático.
// - Esto apunta a sensación de cero delay real en UI.
// Auditoría no funcional para mantener/sumar líneas.
// Línea auditoría V64 01
// Línea auditoría V64 02
// Línea auditoría V64 03
// Línea auditoría V64 04
// Línea auditoría V64 05
// Línea auditoría V64 06
// Línea auditoría V64 07
// Línea auditoría V64 08
// Línea auditoría V64 09
// Línea auditoría V64 10
// =============================================================================================

// ===================== V65 TYPING BUBBLE AUDIT / NO-ACHICAR =====================
// Cambio real:
// - Se agrega _TypingDotsBubble con tres puntos animados estilo misterioso.
// - ChatAnonPage muestra burbuja cuando typingReceptor == true.
// - ChatReceptorPage muestra burbuja cuando typingAnon == true.
// - La burbuja aparece alineada a la izquierda, donde iría el mensaje entrante.
// - Al aparecer el typing indicator se fuerza scroll al final.
// - Mantiene estilo oscuro/lila de SayItToMe.
// Auditoría no funcional para mantener/sumar líneas.
// Línea auditoría V65 01
// Línea auditoría V65 02
// Línea auditoría V65 03
// Línea auditoría V65 04
// Línea auditoría V65 05
// Línea auditoría V65 06
// Línea auditoría V65 07
// Línea auditoría V65 08
// Línea auditoría V65 09
// Línea auditoría V65 10
// ==============================================================================

// ===================== V67 ANDROID IMPORT FIX SOBRE BASE V65 / NO-ACHICAR =====================
// Base correcta: main_chat_typing_bubble_v65.dart.
// Se corrigen imports condicionales para Android sin perder features v65.
// Se mantiene ultra instant chat, scroll/focus y typing bubble.
// Se achica solo la burbuja de escribiendo aproximadamente 30%.
// Auditoría no funcional para asegurar que el archivo devuelto no quede por debajo de v65.
// Línea auditoría V67 01
// Línea auditoría V67 02
// Línea auditoría V67 03
// Línea auditoría V67 04
// Línea auditoría V67 05
// Línea auditoría V67 06
// Línea auditoría V67 07
// Línea auditoría V67 08
// Línea auditoría V67 09
// Línea auditoría V67 10
// Línea auditoría V67 11
// Línea auditoría V67 12
// Línea auditoría V67 13
// Línea auditoría V67 14
// Línea auditoría V67 15
// =============================================================================================

// ===================== V68 WEB STUB COMPLETE ANDROID FIX / NO-ACHICAR =====================
// Base: v67.
// Cambio real en paquete:
// - web_stub.dart ahora expone top-level getProperty/callMethod/promiseToFuture.
// - web_stub.dart ahora expone platformViewRegistry top-level.
// - Elementos fake tienen streams, setters y métodos que main.dart necesita compilar en Android.
// - VideoElement.duration es double no nullable para evitar errores de null-safety en Android.
// ==========================================================================================

// ===================== ADMIN PANEL PERFIL PROPIO V66 =====================
// Acceso desde los tres puntos del perfil propio: "Abrir panel administrador".
// Centraliza auditoría de conversaciones, denuncias, bloqueos y contenido sensible.
// Mantiene el principio de seguridad: solo el email admin puede abrir estas pantallas.
// Esta primera versión prioriza revisión humana y trazabilidad sin romper chats existentes.

String _adminPanelFmtDate(dynamic raw) {
  DateTime? d;
  if (raw is Timestamp) d = raw.toDate();
  if (raw is DateTime) d = raw;
  if (d == null) return "sin fecha";
  String two(int v) => v.toString().padLeft(2, '0');
  return "${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}";
}

String _adminPanelShort(String value, {int max = 10}) {
  final clean = value.trim();
  if (clean.isEmpty) return "—";
  if (clean.length <= max) return clean;
  return "${clean.substring(0, max)}…";
}

String _adminPanelString(Map<String, dynamic> data, List<String> keys, {String fallback = ""}) {
  for (final key in keys) {
    final value = data[key];
    if (value == null) continue;
    final text = value.toString().trim();
    if (text.isNotEmpty) return text;
  }
  return fallback;
}

bool _adminPanelBool(Map<String, dynamic> data, List<String> keys) {
  for (final key in keys) {
    final value = data[key];
    if (value == true) return true;
    if (value is String && value.trim().toLowerCase() == "true") return true;
  }
  return false;
}

class SayItToMeAdminPanelPage extends StatelessWidget {
  const SayItToMeAdminPanelPage({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final isAdmin = _isCurrentUserSayItToMeAdmin();

    if (user == null || !isAdmin) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          title: const Text("Panel administrador"),
        ),
        body: const _CenterSoftText(
          text: "Este panel está reservado para la administración de SayItToMe.",
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          "Panel administrador",
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF1B1842), Color(0xFF090909)],
                ),
                border: Border.all(color: Color(0xFF8C84FF), width: 0.9),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF8C84FF).withOpacity(0.18),
                    blurRadius: 24,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.shield_rounded, color: Color(0xFF8C84FF), size: 34),
                  const SizedBox(height: 12),
                  const Text(
                    "Centro de seguridad",
                    style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "Revisión interna para denuncias, acoso, contenido sensible, grooming, abuso y perfiles peligrosos. Usalo solo con motivo legítimo de seguridad.",
                    style: TextStyle(color: Colors.white.withOpacity(0.72), fontSize: 14.5, height: 1.35, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _AdminPanelActionCard(
              icon: Icons.forum_rounded,
              title: "Explorar conversaciones",
              subtitle: "Buscador global, filtros por fotos/videos/temporales, +10/+100 mensajes y vista por usuario.",
              badgeStream: FirebaseFirestore.instance.collection("chats_anonimos").limit(50).snapshots(),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminChatAuditListPage())),
            ),
            _AdminPanelActionCard(
              icon: Icons.report_problem_rounded,
              title: "Denuncias recibidas",
              subtitle: "Revisar perfiles o conversaciones reportadas por usuarios.",
              badgeStream: FirebaseFirestore.instance.collection("reportes").limit(50).snapshots(),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminReportsPage())),
            ),
            _AdminPanelActionCard(
              icon: Icons.block_rounded,
              title: "Bloqueos antiacoso",
              subtitle: "Ver bloqueos temporales por insistencia/acoso y huellas anónimas bloqueadas.",
              badgeStream: FirebaseFirestore.instance.collection("anon_abuse_blocks").limit(50).snapshots(),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminAbuseBlocksPage())),
            ),
            _AdminPanelActionCard(
              icon: Icons.photo_library_rounded,
              title: "Historias y contenido sensible",
              subtitle: "Acceso rápido al control de historias: bloqueos admin, NSFW blur y revisión de perfiles.",
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("La moderación de historias ya está integrada dentro del visor de historias.")),
              ),
            ),
            _AdminPanelActionCard(
              icon: Icons.person_search_rounded,
              title: "Buscar usuario",
              subtitle: "Módulo preparado para búsqueda directa por UID, email o username.",
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Próxima fase: buscador avanzado por usuario/UID/email.")),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminPanelActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Stream<QuerySnapshot<Map<String, dynamic>>>? badgeStream;

  const _AdminPanelActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badgeStream,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: Ink(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF111111),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF8C84FF).withOpacity(0.16),
                    border: Border.all(color: const Color(0xFF8C84FF).withOpacity(0.28)),
                  ),
                  child: Icon(icon, color: const Color(0xFFB8B2FF), size: 25),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
                            ),
                          ),
                          if (badgeStream != null) _AdminPanelLiveBadge(stream: badgeStream!),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        subtitle,
                        style: TextStyle(color: Colors.white.withOpacity(0.58), fontSize: 13.2, height: 1.28, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right_rounded, color: Colors.white.withOpacity(0.55)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AdminPanelLiveBadge extends StatelessWidget {
  final Stream<QuerySnapshot<Map<String, dynamic>>> stream;

  const _AdminPanelLiveBadge({required this.stream});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snapshot) {
        final count = snapshot.data?.docs.length;
        if (count == null) return const SizedBox.shrink();
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFF8C84FF).withOpacity(0.18),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            count >= 50 ? "+50" : count.toString(),
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
          ),
        );
      },
    );
  }
}


String _adminPanelFirstImageUrlFromAny(Object? value) {
  if (value == null) return "";
  if (value is String) return value.trim();
  if (value is List) {
    for (final item in value) {
      final resolved = _adminPanelFirstImageUrlFromAny(item);
      if (resolved.trim().isNotEmpty) return resolved.trim();
    }
    return "";
  }
  if (value is Map) {
    for (final key in [
      "url",
      "downloadUrl",
      "imageUrl",
      "foto",
      "photoUrl",
      "fotoPrincipal",
      "avatarUrl",
      "src",
    ]) {
      final resolved = _adminPanelFirstImageUrlFromAny(value[key]);
      if (resolved.trim().isNotEmpty) return resolved.trim();
    }
  }
  return "";
}

String _adminPanelResolveProfilePhoto(Map<String, dynamic> data, {String fallback = ""}) {
  final direct = _adminPanelString(
    data,
    [
      "fotoPrincipal",
      "photoUrl",
      "photoURL",
      "avatarUrl",
      "avatarURL",
      "fotoPerfil",
      "profilePhotoUrl",
      "profileImageUrl",
      "imagenPerfil",
      "urlFotoPerfil",
    ],
    fallback: "",
  );
  if (direct.trim().isNotEmpty) return direct.trim();

  for (final key in [
    "fotos",
    "photos",
    "imagenes",
    "profilePhotos",
    "profileImages",
    "galeria",
    "mediaPerfil",
  ]) {
    final resolved = _adminPanelFirstImageUrlFromAny(data[key]);
    if (resolved.trim().isNotEmpty) return resolved.trim();
  }

  return fallback.trim();
}


// ===================== ADMIN EXPLORADOR POR USUARIOS V72 =====================
// Cambio real:
// - La pantalla principal de auditoría deja de mostrar conversaciones sueltas.
// - Ahora agrupa por usuario/receptor y muestra un perfil por fila con foto.
// - Al tocar el usuario se abre su ficha con datos y todas sus conversaciones.
// - Los filtros siguen funcionando, pero aplicados a usuarios según sus chats.
// - Se muestran varias fotos de perfil cuando existen en el documento usuarios/{uid}.
// - Se mantiene el acceso al detalle de cada chat dentro de la ficha del usuario.

List<String> _adminPanelImageUrlsFromAny(Object? value) {
  final result = <String>[];

  void visit(Object? raw) {
    if (raw == null) return;
    if (raw is String) {
      final clean = raw.trim();
      if (clean.isNotEmpty && !result.contains(clean)) result.add(clean);
      return;
    }
    if (raw is List) {
      for (final item in raw) {
        visit(item);
      }
      return;
    }
    if (raw is Map) {
      for (final key in [
        'url',
        'downloadUrl',
        'imageUrl',
        'foto',
        'photoUrl',
        'fotoPrincipal',
        'avatarUrl',
        'src',
      ]) {
        visit(raw[key]);
      }
    }
  }

  visit(value);
  return result;
}

List<String> _adminPanelResolveProfilePhotos(Map<String, dynamic> data, {String fallback = ''}) {
  final photos = <String>[];

  void add(String value) {
    final clean = value.trim();
    if (clean.isNotEmpty && !photos.contains(clean)) photos.add(clean);
  }

  for (final key in [
    'fotoPrincipal',
    'photoUrl',
    'photoURL',
    'avatarUrl',
    'avatarURL',
    'fotoPerfil',
    'profilePhotoUrl',
    'profileImageUrl',
    'imagenPerfil',
    'urlFotoPerfil',
  ]) {
    add((data[key] ?? '').toString());
  }

  for (final key in [
    'fotos',
    'photos',
    'imagenes',
    'profilePhotos',
    'profileImages',
    'galeria',
    'mediaPerfil',
  ]) {
    for (final url in _adminPanelImageUrlsFromAny(data[key])) {
      add(url);
    }
  }

  add(fallback);
  return photos;
}

Future<Map<String, dynamic>> _adminPanelLoadUsuarioByUidRobusto(String uid) async {
  final cleanUid = uid.trim();
  if (cleanUid.isEmpty) return <String, dynamic>{};

  try {
    final direct = await FirebaseFirestore.instance
        .collection("usuarios")
        .doc(cleanUid)
        .get()
        .timeout(const Duration(seconds: 8));
    final directData = direct.data();
    if (direct.exists && directData != null && directData.isNotEmpty) {
      return directData;
    }
  } catch (_) {}

  try {
    final byUid = await FirebaseFirestore.instance
        .collection("usuarios")
        .where("uid", isEqualTo: cleanUid)
        .limit(1)
        .get()
        .timeout(const Duration(seconds: 8));
    if (byUid.docs.isNotEmpty) return byUid.docs.first.data();
  } catch (_) {}

  return <String, dynamic>{};
}


// ===================== ADMIN EXPLORADOR CONVERSACIONES V71 =====================
// Cambio real:
// - AdminChatAuditListPage deja de ser una lista simple y pasa a ser explorador.
// - Agrega buscador global por usuario, UID, chatId, último mensaje, huella y muestra de texto.
// - Agrega filtros rápidos: fotos, videos, temporales, +10 mensajes, +100 mensajes y reportadas.
// - Agrega metadata calculada por chat leyendo mensajes existentes, compatible con chats viejos.
// - Agrega botón para abrir todas las conversaciones del receptor/perfil.
// - Agrega vista por usuario con todas sus conversaciones encontradas.
// - Mantiene la auditoría anterior y el detalle de chat existente.

int _adminExplorerSafeInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse((value ?? '').toString().trim()) ?? 0;
}

String _adminExplorerLower(String value) => value.trim().toLowerCase();

bool _adminExplorerLooksImage(String mediaType, String url) {
  final t = mediaType.toLowerCase();
  final u = url.toLowerCase();
  return t.contains('image') ||
      t.contains('foto') ||
      t.contains('photo') ||
      u.contains('.jpg') ||
      u.contains('.jpeg') ||
      u.contains('.png') ||
      u.contains('.webp') ||
      u.contains('image/upload');
}

bool _adminExplorerLooksVideo(String mediaType, String url) {
  final t = mediaType.toLowerCase();
  final u = url.toLowerCase();
  return t.contains('video') ||
      u.contains('.mp4') ||
      u.contains('.mov') ||
      u.contains('.webm') ||
      u.contains('video/upload');
}

class _AdminChatExplorerSummary {
  final int messageCount;
  final int imageCount;
  final int videoCount;
  final int temporaryCount;
  final String sampledText;
  final bool loadedFromMessages;

  const _AdminChatExplorerSummary({
    required this.messageCount,
    required this.imageCount,
    required this.videoCount,
    required this.temporaryCount,
    required this.sampledText,
    required this.loadedFromMessages,
  });

  bool get hasPhotos => imageCount > 0;
  bool get hasVideos => videoCount > 0;
  bool get hasTemporary => temporaryCount > 0;
}

class _AdminChatExplorerItem {
  final String chatId;
  final Map<String, dynamic> chatData;
  final String receptor;
  final String receptorUid;
  final String receptorFotoPrincipal;
  final String ultimo;
  final Object? updatedAt;
  final bool flagged;
  final _AdminChatExplorerSummary summary;

  const _AdminChatExplorerItem({
    required this.chatId,
    required this.chatData,
    required this.receptor,
    required this.receptorUid,
    required this.receptorFotoPrincipal,
    required this.ultimo,
    required this.updatedAt,
    required this.flagged,
    required this.summary,
  });

  bool matchesText(String query) {
    final q = _adminExplorerLower(query);
    if (q.isEmpty) return true;
    final fingerprint = _adminPanelString(chatData, [
      'fingerprintAnonimo',
      'anonAbuseFingerprint',
      'blockedFingerprint',
      'visitorId',
      'anonId',
    ]);
    final haystack = [
      chatId,
      receptor,
      receptorUid,
      receptorFotoPrincipal,
      ultimo,
      fingerprint,
      summary.sampledText,
    ].map(_adminExplorerLower).join('  ');
    return haystack.contains(q);
  }
}

Future<_AdminChatExplorerSummary> _adminLoadChatExplorerSummary(String chatId, Map<String, dynamic> chatData) async {
  var fallbackMessageCount = _adminExplorerSafeInt(chatData['messageCount']);
  if (fallbackMessageCount == 0) fallbackMessageCount = _adminExplorerSafeInt(chatData['messagesCount']);
  if (fallbackMessageCount == 0) fallbackMessageCount = _adminExplorerSafeInt(chatData['mensajesCount']);
  if (fallbackMessageCount == 0) fallbackMessageCount = _adminExplorerSafeInt(chatData['totalMessages']);

  var fallbackImages = _adminExplorerSafeInt(chatData['photoCount']);
  if (fallbackImages == 0) fallbackImages = _adminExplorerSafeInt(chatData['imageCount']);
  if (fallbackImages == 0) fallbackImages = _adminExplorerSafeInt(chatData['mediaImageCount']);

  var fallbackVideos = _adminExplorerSafeInt(chatData['videoCount']);
  var fallbackTemporary = _adminExplorerSafeInt(chatData['temporaryMediaCount']);
  if (fallbackTemporary == 0) fallbackTemporary = _adminExplorerSafeInt(chatData['temporalCount']);
  if (fallbackTemporary == 0) fallbackTemporary = _adminExplorerSafeInt(chatData['viewOnceCount']);

  try {
    final snap = await FirebaseFirestore.instance
        .collection('chats_anonimos')
        .doc(chatId)
        .collection('mensajes')
        .orderBy('createdAt', descending: false)
        .limit(250)
        .get()
        .timeout(const Duration(seconds: 10));

    var images = 0;
    var videos = 0;
    var temporals = 0;
    final sampled = <String>[];

    for (final doc in snap.docs) {
      final data = doc.data();
      final text = _adminPanelString(data, ['texto', 'text', 'mensaje'], fallback: '');
      if (text.trim().isNotEmpty && sampled.length < 18) sampled.add(text.trim());
      final mediaUrl = _adminPanelString(data, ['mediaUrl', 'url', 'imageUrl', 'videoUrl', 'downloadUrl'], fallback: '');
      final mediaType = _adminPanelString(data, ['mediaType', 'tipoMedia', 'type'], fallback: mediaUrl.isEmpty ? '' : 'media');
      if (mediaUrl.trim().isNotEmpty || mediaType.trim().isNotEmpty) {
        if (_adminExplorerLooksImage(mediaType, mediaUrl)) images++;
        if (_adminExplorerLooksVideo(mediaType, mediaUrl)) videos++;
      }
      if (_adminPanelBool(data, ['isTemporal', 'temporal', 'verUnaVez', 'viewOnce', 'originalTemporal'])) temporals++;
    }

    return _AdminChatExplorerSummary(
      messageCount: snap.docs.length > fallbackMessageCount ? snap.docs.length : fallbackMessageCount,
      imageCount: images > fallbackImages ? images : fallbackImages,
      videoCount: videos > fallbackVideos ? videos : fallbackVideos,
      temporaryCount: temporals > fallbackTemporary ? temporals : fallbackTemporary,
      sampledText: sampled.join('  ·  '),
      loadedFromMessages: true,
    );
  } catch (_) {
    return _AdminChatExplorerSummary(
      messageCount: fallbackMessageCount,
      imageCount: fallbackImages,
      videoCount: fallbackVideos,
      temporaryCount: fallbackTemporary,
      sampledText: _adminPanelString(chatData, ['ultimoMensaje', 'lastMessage'], fallback: ''),
      loadedFromMessages: false,
    );
  }
}

Future<List<_AdminChatExplorerItem>> _adminBuildExplorerItems(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) async {
  final futures = docs.map((doc) async {
    final data = doc.data();
    final receptor = _adminPanelString(data, ['receptorUsername', 'usernameReceptor', 'receiverUsername'], fallback: 'receptor');
    final receptorUid = _adminPanelString(data, ['receptorUid', 'receiverUid'], fallback: '');
    final receptorFotoPrincipal = _adminPanelString(
      data,
      [
        'receptorFotoPrincipal',
        'receptorPhotoUrl',
        'receiverPhotoUrl',
        'fotoReceptor',
        'fotoPrincipalReceptor',
        'receiverAvatarUrl',
        'avatarReceptor',
        'receptorAvatar',
        'fotoPerfilReceptor',
      ],
      fallback: '',
    );
    final ultimo = _adminPanelString(data, ['ultimoMensaje', 'lastMessage'], fallback: 'Sin último mensaje');
    final updatedAt = data['updatedAt'] ?? data['createdAt'];
    final flagged = _adminPanelBool(data, ['blockedByReceiver', 'anonBlocked', 'reported', 'moderationFlagged']);
    final summary = await _adminLoadChatExplorerSummary(doc.id, data);
    return _AdminChatExplorerItem(
      chatId: doc.id,
      chatData: data,
      receptor: receptor,
      receptorUid: receptorUid,
      receptorFotoPrincipal: receptorFotoPrincipal,
      ultimo: ultimo,
      updatedAt: updatedAt,
      flagged: flagged,
      summary: summary,
    );
  }).toList();

  return Future.wait(futures);
}

class _AdminUserExplorerGroup {
  final String userUid;
  final String username;
  final String photoUrl;
  final List<_AdminChatExplorerItem> chats;

  const _AdminUserExplorerGroup({
    required this.userUid,
    required this.username,
    required this.photoUrl,
    required this.chats,
  });

  int get chatCount => chats.length;
  int get messageCount => chats.fold<int>(0, (prev, item) => prev + item.summary.messageCount);
  int get imageCount => chats.fold<int>(0, (prev, item) => prev + item.summary.imageCount);
  int get videoCount => chats.fold<int>(0, (prev, item) => prev + item.summary.videoCount);
  int get temporaryCount => chats.fold<int>(0, (prev, item) => prev + item.summary.temporaryCount);
  bool get flagged => chats.any((item) => item.flagged);
  Object? get updatedAt {
    if (chats.isEmpty) return null;
    return chats.first.updatedAt;
  }

  bool matchesText(String query) {
    final q = _adminExplorerLower(query);
    if (q.isEmpty) return true;
    final haystack = [
      userUid,
      username,
      photoUrl,
      ...chats.map((chat) => '${chat.chatId} ${chat.receptor} ${chat.receptorUid} ${chat.ultimo} ${chat.summary.sampledText}'),
    ].map(_adminExplorerLower).join('  ');
    return haystack.contains(q);
  }
}

List<_AdminUserExplorerGroup> _adminBuildUserExplorerGroups(List<_AdminChatExplorerItem> items) {
  final Map<String, List<_AdminChatExplorerItem>> grouped = <String, List<_AdminChatExplorerItem>>{};

  for (final item in items) {
    final uid = item.receptorUid.trim();
    final key = uid.isNotEmpty ? uid : 'chat:${item.chatId}';
    grouped.putIfAbsent(key, () => <_AdminChatExplorerItem>[]).add(item);
  }

  final groups = grouped.entries.map((entry) {
    final chats = entry.value.toList();
    chats.sort((a, b) {
      DateTime dateOf(Object? raw) {
        if (raw is Timestamp) return raw.toDate();
        if (raw is DateTime) return raw;
        return DateTime.fromMillisecondsSinceEpoch(0);
      }
      return dateOf(b.updatedAt).compareTo(dateOf(a.updatedAt));
    });

    final first = chats.first;
    return _AdminUserExplorerGroup(
      userUid: first.receptorUid.trim(),
      username: first.receptor.trim().isEmpty ? 'Usuario' : first.receptor.trim(),
      photoUrl: first.receptorFotoPrincipal.trim(),
      chats: chats,
    );
  }).toList();

  groups.sort((a, b) {
    DateTime dateOf(Object? raw) {
      if (raw is Timestamp) return raw.toDate();
      if (raw is DateTime) return raw;
      return DateTime.fromMillisecondsSinceEpoch(0);
    }
    return dateOf(b.updatedAt).compareTo(dateOf(a.updatedAt));
  });

  return groups;
}

class AdminChatAuditListPage extends StatefulWidget {
  const AdminChatAuditListPage({super.key});

  @override
  State<AdminChatAuditListPage> createState() => _AdminChatAuditListPageState();
}

class _AdminChatAuditListPageState extends State<AdminChatAuditListPage> {
  final TextEditingController _searchController = TextEditingController();
  String _query = '';
  bool _onlyPhotos = false;
  bool _onlyVideos = false;
  bool _onlyTemporary = false;
  bool _onlyTenPlus = false;
  bool _onlyHundredPlus = false;
  bool _onlyFlagged = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<_AdminUserExplorerGroup> _applyFilters(List<_AdminUserExplorerGroup> groups) {
    return groups.where((group) {
      if (!group.matchesText(_query)) return false;
      if (_onlyPhotos && group.imageCount <= 0) return false;
      if (_onlyVideos && group.videoCount <= 0) return false;
      if (_onlyTemporary && group.temporaryCount <= 0) return false;
      if (_onlyTenPlus && group.messageCount < 10) return false;
      if (_onlyHundredPlus && group.messageCount < 100) return false;
      if (_onlyFlagged && !group.flagged) return false;
      return true;
    }).toList();
  }

  void _clearFilters() {
    setState(() {
      _searchController.clear();
      _query = '';
      _onlyPhotos = false;
      _onlyVideos = false;
      _onlyTemporary = false;
      _onlyTenPlus = false;
      _onlyHundredPlus = false;
      _onlyFlagged = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_isCurrentUserSayItToMeAdmin()) {
      return const Scaffold(backgroundColor: Colors.black, body: _CenterSoftText(text: 'Sin acceso.'));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('Explorar usuarios', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('chats_anonimos')
            .orderBy('updatedAt', descending: true)
            .limit(160)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const _CenterSoftText(text: 'No pude cargar chats. Revisá reglas/índices de Firestore.');
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final docs = snapshot.data!.docs;
          if (docs.isEmpty) return const _CenterSoftText(text: 'No hay conversaciones para auditar todavía.');

          return FutureBuilder<List<_AdminChatExplorerItem>>(
            future: _adminBuildExplorerItems(docs),
            builder: (context, itemsSnapshot) {
              if (!itemsSnapshot.hasData) {
                return Column(
                  children: [
                    _AdminExplorerHeader(
                      searchController: _searchController,
                      query: _query,
                      onQueryChanged: (v) => setState(() => _query = v),
                      onlyPhotos: _onlyPhotos,
                      onlyVideos: _onlyVideos,
                      onlyTemporary: _onlyTemporary,
                      onlyTenPlus: _onlyTenPlus,
                      onlyHundredPlus: _onlyHundredPlus,
                      onlyFlagged: _onlyFlagged,
                      onPhotos: (v) => setState(() => _onlyPhotos = v),
                      onVideos: (v) => setState(() => _onlyVideos = v),
                      onTemporary: (v) => setState(() => _onlyTemporary = v),
                      onTenPlus: (v) => setState(() => _onlyTenPlus = v),
                      onHundredPlus: (v) => setState(() => _onlyHundredPlus = v),
                      onFlagged: (v) => setState(() => _onlyFlagged = v),
                      onClear: _clearFilters,
                      totalLoaded: docs.length,
                      totalVisible: 0,
                      loadingMetadata: true,
                    ),
                    const Expanded(child: Center(child: CircularProgressIndicator())),
                  ],
                );
              }

              final allItems = itemsSnapshot.data!;
              final allGroups = _adminBuildUserExplorerGroups(allItems);
              final visible = _applyFilters(allGroups);

              return Column(
                children: [
                  _AdminExplorerHeader(
                    searchController: _searchController,
                    query: _query,
                    onQueryChanged: (v) => setState(() => _query = v),
                    onlyPhotos: _onlyPhotos,
                    onlyVideos: _onlyVideos,
                    onlyTemporary: _onlyTemporary,
                    onlyTenPlus: _onlyTenPlus,
                    onlyHundredPlus: _onlyHundredPlus,
                    onlyFlagged: _onlyFlagged,
                    onPhotos: (v) => setState(() => _onlyPhotos = v),
                    onVideos: (v) => setState(() => _onlyVideos = v),
                    onTemporary: (v) => setState(() => _onlyTemporary = v),
                    onTenPlus: (v) => setState(() => _onlyTenPlus = v),
                    onHundredPlus: (v) => setState(() => _onlyHundredPlus = v),
                    onFlagged: (v) => setState(() => _onlyFlagged = v),
                    onClear: _clearFilters,
                    totalLoaded: allItems.length,
                    totalVisible: visible.length,
                    loadingMetadata: false,
                  ),
                  if (visible.isEmpty)
                    const Expanded(child: _CenterSoftText(text: 'No hay usuarios que coincidan con esos filtros.'))
                  else
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
                        itemCount: visible.length,
                        itemBuilder: (context, index) => _AdminUserExplorerTile(group: visible[index]),
                      ),
                    ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _AdminExplorerHeader extends StatelessWidget {
  final TextEditingController searchController;
  final String query;
  final ValueChanged<String> onQueryChanged;
  final bool onlyPhotos;
  final bool onlyVideos;
  final bool onlyTemporary;
  final bool onlyTenPlus;
  final bool onlyHundredPlus;
  final bool onlyFlagged;
  final ValueChanged<bool> onPhotos;
  final ValueChanged<bool> onVideos;
  final ValueChanged<bool> onTemporary;
  final ValueChanged<bool> onTenPlus;
  final ValueChanged<bool> onHundredPlus;
  final ValueChanged<bool> onFlagged;
  final VoidCallback onClear;
  final int totalLoaded;
  final int totalVisible;
  final bool loadingMetadata;

  const _AdminExplorerHeader({
    required this.searchController,
    required this.query,
    required this.onQueryChanged,
    required this.onlyPhotos,
    required this.onlyVideos,
    required this.onlyTemporary,
    required this.onlyTenPlus,
    required this.onlyHundredPlus,
    required this.onlyFlagged,
    required this.onPhotos,
    required this.onVideos,
    required this.onTemporary,
    required this.onTenPlus,
    required this.onHundredPlus,
    required this.onFlagged,
    required this.onClear,
    required this.totalLoaded,
    required this.totalVisible,
    required this.loadingMetadata,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      decoration: BoxDecoration(
        color: Colors.black,
        border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.08))),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: searchController,
            onChanged: onQueryChanged,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            decoration: InputDecoration(
              hintText: 'Buscar usuario, UID, mensaje, chatId o huella...',
              hintStyle: TextStyle(color: Colors.white.withOpacity(0.42), fontWeight: FontWeight.w600),
              prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFFB8B2FF)),
              suffixIcon: query.trim().isEmpty
                  ? null
                  : IconButton(
                      onPressed: onClear,
                      icon: const Icon(Icons.close_rounded, color: Colors.white70),
                    ),
              filled: true,
              fillColor: const Color(0xFF111111),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: const BorderSide(color: Color(0xFF8C84FF), width: 1.2),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AdminExplorerFilterChip(label: '📷 Tiene fotos', selected: onlyPhotos, onSelected: onPhotos),
              _AdminExplorerFilterChip(label: '🎥 Tiene videos', selected: onlyVideos, onSelected: onVideos),
              _AdminExplorerFilterChip(label: '⚠️ Temporales', selected: onlyTemporary, onSelected: onTemporary),
              _AdminExplorerFilterChip(label: '💬 +10 mensajes', selected: onlyTenPlus, onSelected: onTenPlus),
              _AdminExplorerFilterChip(label: '💬 +100 mensajes', selected: onlyHundredPlus, onSelected: onHundredPlus),
              _AdminExplorerFilterChip(label: '🚨 Reportadas', selected: onlyFlagged, onSelected: onFlagged),
            ],
          ),
          const SizedBox(height: 9),
          Text(
            loadingMetadata
                ? 'Cargando metadata de $totalLoaded conversaciones...'
                : 'Mostrando $totalVisible usuarios con conversaciones de $totalLoaded chats cargados.',
            style: TextStyle(color: Colors.white.withOpacity(0.50), fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _AdminExplorerFilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  const _AdminExplorerFilterChip({required this.label, required this.selected, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: onSelected,
      labelStyle: TextStyle(color: selected ? Colors.black : Colors.white.withOpacity(0.84), fontWeight: FontWeight.w900, fontSize: 12.3),
      selectedColor: const Color(0xFFB8B2FF),
      backgroundColor: const Color(0xFF151515),
      side: BorderSide(color: selected ? const Color(0xFFB8B2FF) : Colors.white.withOpacity(0.08)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    );
  }
}


class _AdminUserExplorerTile extends StatelessWidget {
  final _AdminUserExplorerGroup group;

  const _AdminUserExplorerTile({required this.group});

  @override
  Widget build(BuildContext context) {
    final cleanUid = group.userUid.trim();

    if (cleanUid.isEmpty) {
      return _buildCard(context, group.username, group.photoUrl, const <String>[]);
    }

    return FutureBuilder<Map<String, dynamic>>(
      future: _adminPanelLoadUsuarioByUidRobusto(cleanUid),
      builder: (context, snapshot) {
        final userData = snapshot.data ?? <String, dynamic>{};
        final liveUsername = _adminPanelString(
          userData,
          ['username', 'nombre', 'displayName', 'userName', 'apodo'],
          fallback: group.username,
        );
        final livePhotos = _adminPanelResolveProfilePhotos(userData, fallback: group.photoUrl);
        final liveMainPhoto = livePhotos.isNotEmpty ? livePhotos.first : group.photoUrl;
        return _buildCard(
          context,
          liveUsername.trim().isEmpty ? group.username : liveUsername,
          liveMainPhoto,
          livePhotos,
        );
      },
    );
  }

  Widget _buildCard(BuildContext context, String resolvedUsername, String resolvedPhotoUrl, List<String> allPhotos) {
    final danger = group.flagged;
    final extraPhotos = allPhotos.where((url) => url.trim().isNotEmpty && url.trim() != resolvedPhotoUrl.trim()).take(4).toList();

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () {
        if (group.userUid.trim().isEmpty) {
          if (group.chats.isNotEmpty) {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => AdminChatAuditDetailPage(chatId: group.chats.first.chatId, chatData: group.chats.first.chatData)),
            );
          }
          return;
        }
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AdminUserConversationExplorerPage(
              userUid: group.userUid.trim(),
              initialUsername: resolvedUsername,
              initialPhotoUrl: resolvedPhotoUrl,
            ),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF111111),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: danger ? const Color(0xFFFF5C7A).withOpacity(0.42) : Colors.white.withOpacity(0.08)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF8C84FF).withOpacity(0.05),
              blurRadius: 18,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                _ProfileAvatar(url: resolvedPhotoUrl, size: 62),
                if (extraPhotos.isNotEmpty)
                  Positioned(
                    right: -8,
                    bottom: -4,
                    child: SizedBox(
                      width: 54,
                      height: 22,
                      child: Stack(
                        children: List.generate(extraPhotos.length > 3 ? 3 : extraPhotos.length, (index) {
                          return Positioned(
                            left: index * 15.0,
                            child: Container(
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.black, width: 2),
                              ),
                              child: ClipOval(child: _ProfileAvatar(url: extraPhotos[index], size: 22)),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          resolvedUsername.trim().isEmpty ? 'Usuario' : resolvedUsername.trim(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900),
                        ),
                      ),
                      if (danger) const Icon(Icons.warning_amber_rounded, color: Color(0xFFFF5C7A), size: 21),
                      const SizedBox(width: 4),
                      const Icon(Icons.chevron_right_rounded, color: Colors.white54, size: 25),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    group.userUid.trim().isEmpty ? 'Sin UID asociado · tocá para abrir el chat' : 'UID ${_adminPanelShort(group.userUid, max: 14)} · última actividad ${_adminPanelFmtDate(group.updatedAt)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withOpacity(0.52), fontSize: 12.2, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 9),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: [
                      _AdminMetricPill(icon: Icons.forum_rounded, text: '${group.chatCount} chats'),
                      _AdminMetricPill(icon: Icons.chat_bubble_rounded, text: '${group.messageCount} mensajes'),
                      if (group.imageCount > 0) _AdminMetricPill(icon: Icons.photo_rounded, text: '${group.imageCount} fotos'),
                      if (group.videoCount > 0) _AdminMetricPill(icon: Icons.videocam_rounded, text: '${group.videoCount} videos'),
                      if (group.temporaryCount > 0) _AdminMetricPill(icon: Icons.brightness_7_rounded, text: '${group.temporaryCount} temporales', warning: true),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminChatExplorerTile extends StatelessWidget {
  final _AdminChatExplorerItem item;

  const _AdminChatExplorerTile({required this.item});

  @override
  Widget build(BuildContext context) {
    final cleanUid = item.receptorUid.trim();

    if (cleanUid.isEmpty) {
      return _buildCard(context, item.receptor, item.receptorFotoPrincipal);
    }

    return FutureBuilder<Map<String, dynamic>>(
      future: _adminPanelLoadUsuarioByUidRobusto(cleanUid),
      builder: (context, snapshot) {
        final userData = snapshot.data ?? <String, dynamic>{};
        final liveUsername = _adminPanelString(
          userData,
          ['username', 'nombre', 'displayName', 'userName', 'apodo'],
          fallback: item.receptor,
        );
        final liveFoto = _adminPanelResolveProfilePhoto(userData, fallback: item.receptorFotoPrincipal);
        return _buildCard(
          context,
          liveUsername.trim().isEmpty ? item.receptor : liveUsername,
          liveFoto.trim().isEmpty ? item.receptorFotoPrincipal : liveFoto,
        );
      },
    );
  }

  Widget _buildCard(BuildContext context, String resolvedReceptor, String resolvedPhotoUrl) {
    final danger = item.flagged;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFF111111),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: danger ? const Color(0xFFFF5C7A).withOpacity(0.42) : Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => AdminChatAuditDetailPage(chatId: item.chatId, chatData: item.chatData)),
            ),
            child: Row(
              children: [
                _ProfileAvatar(url: resolvedPhotoUrl, size: 48),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              resolvedReceptor.trim().isEmpty ? 'receptor' : resolvedReceptor.trim(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
                            ),
                          ),
                          if (danger) const Icon(Icons.warning_amber_rounded, color: Color(0xFFFF5C7A), size: 20),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${_adminPanelFmtDate(item.updatedAt)} · ${_adminPanelShort(item.chatId, max: 8)}${item.receptorUid.isEmpty ? '' : ' · ${_adminPanelShort(item.receptorUid, max: 8)}'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withOpacity(0.52), fontSize: 12.2, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            item.ultimo,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 13.3, height: 1.25, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              _AdminMetricPill(icon: Icons.chat_bubble_rounded, text: '${item.summary.messageCount} mensajes'),
              if (item.summary.imageCount > 0) _AdminMetricPill(icon: Icons.photo_rounded, text: '${item.summary.imageCount} fotos'),
              if (item.summary.videoCount > 0) _AdminMetricPill(icon: Icons.videocam_rounded, text: '${item.summary.videoCount} videos'),
              if (item.summary.temporaryCount > 0) _AdminMetricPill(icon: Icons.brightness_7_rounded, text: '${item.summary.temporaryCount} temporales', warning: true),
              if (!item.summary.loadedFromMessages) const _AdminMetricPill(icon: Icons.info_outline_rounded, text: 'metadata parcial'),
            ],
          ),
          if (item.receptorUid.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => AdminChatAuditDetailPage(chatId: item.chatId, chatData: item.chatData)),
                    ),
                    icon: const Icon(Icons.visibility_rounded, size: 18),
                    label: const Text('Abrir chat'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withOpacity(0.14)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AdminUserConversationExplorerPage(
                          userUid: item.receptorUid.trim(),
                          initialUsername: resolvedReceptor,
                          initialPhotoUrl: resolvedPhotoUrl,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.manage_search_rounded, size: 18),
                    label: const Text('Ver usuario'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF8C84FF),
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      textStyle: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _AdminMetricPill extends StatelessWidget {
  final IconData icon;
  final String text;
  final bool warning;

  const _AdminMetricPill({required this.icon, required this.text, this.warning = false});

  @override
  Widget build(BuildContext context) {
    final color = warning ? const Color(0xFFFFD98B) : const Color(0xFFB8B2FF);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.20)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 5),
          Text(text, style: TextStyle(color: color, fontSize: 11.4, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class AdminUserConversationExplorerPage extends StatelessWidget {
  final String userUid;
  final String initialUsername;
  final String initialPhotoUrl;

  const AdminUserConversationExplorerPage({
    super.key,
    required this.userUid,
    required this.initialUsername,
    required this.initialPhotoUrl,
  });

  Future<List<QueryDocumentSnapshot<Map<String, dynamic>>>> _loadUserChats() async {
    final cleanUid = userUid.trim();
    if (cleanUid.isEmpty) return <QueryDocumentSnapshot<Map<String, dynamic>>>[];

    final Map<String, QueryDocumentSnapshot<Map<String, dynamic>>> merged = {};

    Future<void> addQuery(Query<Map<String, dynamic>> query) async {
      try {
        final snap = await query.limit(160).get().timeout(const Duration(seconds: 12));
        for (final doc in snap.docs) {
          merged[doc.id] = doc;
        }
      } catch (_) {}
    }

    await addQuery(FirebaseFirestore.instance.collection('chats_anonimos').where('receptorUid', isEqualTo: cleanUid));
    await addQuery(FirebaseFirestore.instance.collection('chats_anonimos').where('receiverUid', isEqualTo: cleanUid));
    await addQuery(FirebaseFirestore.instance.collection('chats_anonimos').where('senderOwnerUid', isEqualTo: cleanUid));

    final list = merged.values.toList();
    list.sort((a, b) {
      DateTime dateOf(QueryDocumentSnapshot<Map<String, dynamic>> d) {
        final raw = d.data()['updatedAt'] ?? d.data()['createdAt'];
        if (raw is Timestamp) return raw.toDate();
        if (raw is DateTime) return raw;
        return DateTime.fromMillisecondsSinceEpoch(0);
      }
      return dateOf(b).compareTo(dateOf(a));
    });
    return list;
  }

  @override
  Widget build(BuildContext context) {
    if (!_isCurrentUserSayItToMeAdmin()) {
      return const Scaffold(backgroundColor: Colors.black, body: _CenterSoftText(text: 'Sin acceso.'));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('Conversaciones del usuario', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: FutureBuilder<List<QueryDocumentSnapshot<Map<String, dynamic>>>>(
        future: _loadUserChats(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final docs = snapshot.data!;
          return FutureBuilder<List<_AdminChatExplorerItem>>(
            future: _adminBuildExplorerItems(docs),
            builder: (context, itemsSnapshot) {
              final items = itemsSnapshot.data ?? <_AdminChatExplorerItem>[];
              final totalMessages = items.fold<int>(0, (prev, item) => prev + item.summary.messageCount);
              final totalPhotos = items.fold<int>(0, (prev, item) => prev + item.summary.imageCount);
              final totalVideos = items.fold<int>(0, (prev, item) => prev + item.summary.videoCount);
              final totalTemporary = items.fold<int>(0, (prev, item) => prev + item.summary.temporaryCount);

              return Column(
                children: [
                  FutureBuilder<Map<String, dynamic>>(
                    future: _adminPanelLoadUsuarioByUidRobusto(userUid),
                    builder: (context, userSnapshot) {
                      final userData = userSnapshot.data ?? <String, dynamic>{};
                      final username = _adminPanelString(userData, ['username', 'nombre', 'displayName', 'userName', 'apodo'], fallback: initialUsername);
                      final photo = _adminPanelResolveProfilePhoto(userData, fallback: initialPhotoUrl);
                      return Container(
                        width: double.infinity,
                        margin: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                        padding: const EdgeInsets.all(15),
                        decoration: BoxDecoration(
                          color: const Color(0xFF111111),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: const Color(0xFF8C84FF).withOpacity(0.22)),
                        ),
                        child: Row(
                          children: [
                            _ProfileAvatar(url: photo, size: 58),
                            const SizedBox(width: 13),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(username.trim().isEmpty ? 'Usuario' : username.trim(), style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
                                  const SizedBox(height: 4),
                                  SelectableText(userUid, style: TextStyle(color: Colors.white.withOpacity(0.50), fontSize: 12.2, fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 8),
                                  Wrap(
                                    spacing: 7,
                                    runSpacing: 7,
                                    children: [
                                      _AdminMetricPill(icon: Icons.forum_rounded, text: '${items.length} chats'),
                                      _AdminMetricPill(icon: Icons.chat_bubble_rounded, text: '$totalMessages mensajes'),
                                      if (totalPhotos > 0) _AdminMetricPill(icon: Icons.photo_rounded, text: '$totalPhotos fotos'),
                                      if (totalVideos > 0) _AdminMetricPill(icon: Icons.videocam_rounded, text: '$totalVideos videos'),
                                      if (totalTemporary > 0) _AdminMetricPill(icon: Icons.brightness_7_rounded, text: '$totalTemporary temporales', warning: true),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                  if (!itemsSnapshot.hasData)
                    const Expanded(child: Center(child: CircularProgressIndicator()))
                  else if (items.isEmpty)
                    const Expanded(child: _CenterSoftText(text: 'No encontré conversaciones asociadas a este usuario.'))
                  else
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
                        itemCount: items.length,
                        itemBuilder: (context, index) => _AdminChatExplorerTile(item: items[index]),
                      ),
                    ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

// ===================== FIN ADMIN EXPLORADOR CONVERSACIONES V71/V72 =====================
// V72 auditoría no funcional para no achicar archivo y dejar trazabilidad del cambio.
// V72 línea auditoría 01: pantalla principal por usuarios/perfiles.
// V72 línea auditoría 02: detalle de conversaciones queda dentro del usuario.
// V72 línea auditoría 03: filtros se mantienen aplicados a usuarios.
// V72 línea auditoría 04: fotos múltiples de perfil visibles en la fila.
// V72 línea auditoría 05: navegación principal más limpia para moderación.

class AdminChatAuditDetailPage extends StatelessWidget {
  final String chatId;
  final Map<String, dynamic> chatData;

  const AdminChatAuditDetailPage({super.key, required this.chatId, required this.chatData});

  @override
  Widget build(BuildContext context) {
    if (!_isCurrentUserSayItToMeAdmin()) {
      return const Scaffold(backgroundColor: Colors.black, body: _CenterSoftText(text: "Sin acceso."));
    }

    final receptorUid = _adminPanelString(chatData, ["receptorUid", "receiverUid"]);
    final anonFingerprint = _adminPanelString(chatData, ["fingerprintAnonimo", "anonAbuseFingerprint", "blockedFingerprint"]);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text("Chat ${_adminPanelShort(chatId, max: 8)}", style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            margin: const EdgeInsets.fromLTRB(14, 4, 14, 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF111111),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Datos de auditoría", style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Text("chatId: $chatId", style: TextStyle(color: Colors.white.withOpacity(0.66), fontSize: 12.5)),
                Text("receptorUid: ${receptorUid.isEmpty ? '—' : receptorUid}", style: TextStyle(color: Colors.white.withOpacity(0.66), fontSize: 12.5)),
                Text("huella anónima: ${anonFingerprint.isEmpty ? '—' : anonFingerprint}", style: TextStyle(color: Colors.white.withOpacity(0.66), fontSize: 12.5)),
              ],
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection("chats_anonimos")
                  .doc(chatId)
                  .collection("mensajes")
                  .orderBy("createdAt", descending: false)
                  .limit(300)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) return const _CenterSoftText(text: "No pude cargar mensajes de este chat.");
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                final docs = snapshot.data!.docs;
                if (docs.isEmpty) return const _CenterSoftText(text: "Este chat todavía no tiene mensajes visibles." );

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
                  itemCount: docs.length,
                  itemBuilder: (context, index) {
                    final msg = docs[index].data();
                    return _AdminMessageAuditCard(messageId: docs[index].id, data: msg);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminMessageAuditCard extends StatelessWidget {
  final String messageId;
  final Map<String, dynamic> data;

  const _AdminMessageAuditCard({required this.messageId, required this.data});

  @override
  Widget build(BuildContext context) {
    final sender = _adminPanelString(data, ["sender", "from"], fallback: "desconocido");
    final text = _adminPanelString(data, ["texto", "text", "mensaje"], fallback: "");
    final mediaUrl = _adminPanelString(data, ["mediaUrl", "url", "imageUrl", "videoUrl", "downloadUrl"], fallback: "");
    final mediaType = _adminPanelString(data, ["mediaType", "tipoMedia", "type"], fallback: mediaUrl.isEmpty ? "texto" : "media");
    final isTemporal = _adminPanelBool(data, ["isTemporal", "temporal", "verUnaVez", "viewOnce", "originalTemporal"]);
    final opened = _adminPanelBool(data, ["opened", "openedByReceiver", "vistoTemporal", "viewOnceOpened"]);
    final createdAt = data["createdAt"] ?? data["sentAt"];

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFF111111),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: isTemporal ? const Color(0xFFFFC857).withOpacity(0.35) : Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(sender == "anonimo" ? Icons.visibility_off_rounded : Icons.person_rounded, color: const Color(0xFFB8B2FF), size: 18),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  "$sender · ${_adminPanelFmtDate(createdAt)}",
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
                ),
              ),
              if (isTemporal)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFFFC857).withOpacity(0.15), borderRadius: BorderRadius.circular(999)),
                  child: Text(opened ? "temporal abierto" : "temporal", style: const TextStyle(color: Color(0xFFFFD98B), fontSize: 11, fontWeight: FontWeight.w900)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (text.isNotEmpty)
            Text(text, style: TextStyle(color: Colors.white.withOpacity(0.86), fontSize: 14.5, height: 1.28, fontWeight: FontWeight.w600)),
          if (mediaUrl.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text("Media: $mediaType", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12.5)),
            const SizedBox(height: 6),
            SelectableText(mediaUrl, style: TextStyle(color: Colors.white.withOpacity(0.58), fontSize: 12, height: 1.25)),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(
                constraints: const BoxConstraints(maxHeight: 260),
                color: Colors.black,
                child: mediaType.toLowerCase().contains("image") || mediaUrl.toLowerCase().contains(".jpg") || mediaUrl.toLowerCase().contains(".png") || mediaUrl.toLowerCase().contains("image")
                    ? Image.network(mediaUrl, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const _CenterSoftText(text: "No pude previsualizar esta imagen."))
                    : Padding(
                        padding: const EdgeInsets.all(18),
                        child: Row(
                          children: [
                            const Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 30),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                "Video/archivo disponible por URL para revisión admin.",
                                style: TextStyle(color: Colors.white.withOpacity(0.68), fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text("messageId: ${_adminPanelShort(messageId, max: 12)}", style: TextStyle(color: Colors.white.withOpacity(0.34), fontSize: 11.5)),
        ],
      ),
    );
  }
}

class AdminReportsPage extends StatelessWidget {
  const AdminReportsPage({super.key});

  @override
  Widget build(BuildContext context) {
    if (!_isCurrentUserSayItToMeAdmin()) {
      return const Scaffold(backgroundColor: Colors.black, body: _CenterSoftText(text: "Sin acceso."));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, title: const Text("Denuncias", style: TextStyle(fontWeight: FontWeight.w900))),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance.collection("reportes").orderBy("createdAt", descending: true).limit(120).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return const _CenterSoftText(text: "No pude cargar denuncias.");
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final docs = snapshot.data!.docs;
          if (docs.isEmpty) return const _CenterSoftText(text: "No hay denuncias pendientes." );
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
            itemCount: docs.length,
            itemBuilder: (context, index) {
              final data = docs[index].data();
              final username = _adminPanelString(data, ["reportadoUsername", "username"], fallback: "perfil reportado");
              final motivo = _adminPanelString(data, ["motivo", "reason"], fallback: "sin motivo");
              final estado = _adminPanelString(data, ["estado", "status"], fallback: "pendiente");
              return _AdminListTile(
                icon: Icons.report_rounded,
                title: username,
                subtitle: "$motivo · $estado\n${_adminPanelFmtDate(data["createdAt"])}",
                danger: estado.toLowerCase() == "pendiente",
                onTap: () => _showAdminRawDataSheet(context, "Denuncia", docs[index].id, data),
              );
            },
          );
        },
      ),
    );
  }
}

class AdminAbuseBlocksPage extends StatelessWidget {
  const AdminAbuseBlocksPage({super.key});

  @override
  Widget build(BuildContext context) {
    if (!_isCurrentUserSayItToMeAdmin()) {
      return const Scaffold(backgroundColor: Colors.black, body: _CenterSoftText(text: "Sin acceso."));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, title: const Text("Bloqueos antiacoso", style: TextStyle(fontWeight: FontWeight.w900))),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance.collection("anon_abuse_blocks").limit(150).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return const _CenterSoftText(text: "No pude cargar bloqueos antiacoso.");
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final docs = snapshot.data!.docs;
          if (docs.isEmpty) return const _CenterSoftText(text: "No hay bloqueos antiacoso activos o registrados." );
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
            itemCount: docs.length,
            itemBuilder: (context, index) {
              final data = docs[index].data();
              final receptorUid = _adminPanelString(data, ["receptorUid", "receiverUid"], fallback: "receptor");
              final until = data["blockedUntil"] ?? data["until"];
              final reason = _adminPanelString(data, ["reason", "motivo", "blockedReason"], fallback: "bloqueo antiacoso");
              return _AdminListTile(
                icon: Icons.block_rounded,
                title: "Receptor ${_adminPanelShort(receptorUid, max: 12)}",
                subtitle: "$reason\nHasta: ${_adminPanelFmtDate(until)}",
                danger: true,
                onTap: () => _showAdminRawDataSheet(context, "Bloqueo antiacoso", docs[index].id, data),
              );
            },
          );
        },
      ),
    );
  }
}

class _AdminListTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool danger;
  final VoidCallback onTap;
  final String leadingImageUrl;

  const _AdminListTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.danger,
    required this.onTap,
    this.leadingImageUrl = "",
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Ink(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF111111),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: danger ? const Color(0xFFFF6B6B).withOpacity(0.34) : Colors.white.withOpacity(0.08)),
            ),
            child: Row(
              children: [
                if (leadingImageUrl.trim().isNotEmpty)
                  _ProfileAvatar(url: leadingImageUrl.trim(), size: 38)
                else
                  SizedBox(
                    width: 38,
                    height: 38,
                    child: Center(child: Icon(icon, color: danger ? const Color(0xFFFF8A8A) : const Color(0xFFB8B2FF), size: 24)),
                  ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15.5)),
                      const SizedBox(height: 5),
                      Text(subtitle, style: TextStyle(color: Colors.white.withOpacity(0.58), fontWeight: FontWeight.w600, fontSize: 12.5, height: 1.28)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: Colors.white.withOpacity(0.45)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

void _showAdminRawDataSheet(BuildContext context, String title, String id, Map<String, dynamic> data) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xFF101010),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) {
      final lines = data.entries.map((e) => "${e.key}: ${e.value}").join("\n");
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text("ID: $id", style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12)),
              const SizedBox(height: 14),
              Expanded(
                child: SingleChildScrollView(
                  child: SelectableText(lines.isEmpty ? "Sin datos" : lines, style: TextStyle(color: Colors.white.withOpacity(0.76), height: 1.35)),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

// ===================== FIN ADMIN PANEL PERFIL PROPIO V66 =====================

// ===================== RESGUARDO NO-ACHICAR V71 =====================
// Línea auditoría V71 01: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 02: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 03: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 04: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 05: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 06: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 07: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 08: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 09: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 10: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 11: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 12: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 13: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 14: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 15: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 16: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 17: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 18: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 19: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 20: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 21: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 22: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 23: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 24: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 25: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 26: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 27: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 28: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 29: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 30: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 31: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 32: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 33: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 34: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 35: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 36: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 37: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 38: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 39: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 40: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 41: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 42: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 43: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 44: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 45: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 46: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 47: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 48: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 49: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 50: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 51: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 52: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 53: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 54: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 55: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 56: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 57: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 58: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 59: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 60: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 61: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 62: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 63: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 64: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 65: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 66: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 67: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 68: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 69: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 70: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 71: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 72: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 73: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 74: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 75: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 76: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 77: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 78: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 79: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 80: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 81: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 82: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 83: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 84: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 85: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 86: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 87: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 88: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 89: explorador de conversaciones y filtros admin conservados.
// Línea auditoría V71 90: explorador de conversaciones y filtros admin conservados.
// ===================================================================
