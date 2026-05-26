import type { AppLocale } from "@/lib/i18n/types";

const es = {
  lang_es: "Español",
  lang_en: "English",
  lang_it: "Italiano",
  lang_de: "Deutsch",

  language_prompt_title: "Idioma de la app",
  language_prompt_body:
    "Detectamos que en tu zona se habla {language}. ¿Querés usar este idioma en SayItToMe?",
  language_prompt_keep: "Mantener {language}",
  language_prompt_use_detected: "Usar {language}",
  language_prompt_other: "Elegir otro idioma",

  common_loading: "Cargando...",
  common_cancel: "Cancelar",
  common_continue: "Continuar",
  common_back_home: "Volver al inicio",
  common_preparing: "Preparando...",
  common_back: "Volver",

  error_register_email_required: "Escribí tu email.",
  error_register_password_required: "Escribí una contraseña.",
  error_register_password_mismatch: "Las contraseñas no coinciden.",
  auth_verify_not_yet: "Todavía no verificamos tu email. Revisá la bandeja de entrada y el spam.",
  auth_verify_check_fail: "No pudimos comprobar la verificación. Probá de nuevo.",
  auth_verify_resent: "Te reenviamos el email de verificación.",
  auth_verify_resend_fail: "No pudimos reenviar el email. Esperá unos minutos.",

  ux_classic: "Clásico",
  ux_modern: "Nuevo",

  home_tagline: "Anónimo. Rápido. Real.",
  home_modern_badge: "Nueva SayItToMe web ultrarrápida en React/Next.js",
  home_modern_headline: "Decilo sin filtro. Vivilo como red social.",
  home_modern_body:
    "Perfiles, historias, mensajes anónimos, chats en tiempo real y una experiencia oscura, misteriosa y mobile-first.",
  home_create_profile: "Crear perfil",
  home_go_shuffle: "Ir al Shuffle",
  home_card_bio:
    "Perfil oscuro premium, historias, chats y anónimos en la nueva web real.",

  home_classic_login: "Iniciar sesión",
  home_classic_register: "Crear perfil",
  home_classic_anon: "Entrar anónimo",
  home_classic_anon_title: "¿No querés registrarte?",
  home_classic_anon_body:
    "Tocá Entrar anónimo para escribirle a quien quieras sin crear perfil. Cada nuevo ingreso anónimo crea otra identidad.",
  home_classic_anon_note:
    "Recordá: si refrescás, salís de anónimo o volvés a entrar, se descarta el anon anterior y se abre una identidad nueva.",

  legal_title: "Antes de continuar",
  legal_intro:
    "Vas a entrar en modo anónimo. Tu identidad pública no se muestra a otros usuarios, pero la app puede conservar registros técnicos de seguridad.",
  legal_session_title: "Sesión temporal",
  legal_session_body:
    "Lo que hagas en modo anónimo se guarda solo mientras dura esta sesión. Si cerrás la pestaña, volvés al inicio o entrás anónimo de nuevo, se descarta tu identidad anterior, desaparecen esos chats de tu vista y se abre otra identidad nueva. Si hablás otra vez con la misma persona, será un chat distinto y no sabrá quién sos.",
  legal_age_title: "Edad mínima",
  legal_age_body:
    "Debés tener al menos 13 años o la edad mínima exigida por las leyes de tu país.",
  legal_anon_title: "Anonimato parcial",
  legal_anon_body:
    "El anonimato protege tu identidad frente a otros usuarios, pero no significa impunidad absoluta.",
  legal_security_title: "Seguridad y moderación",
  legal_security_body:
    "Para prevenir abuso, acoso, grooming, amenazas, explotación sexual de menores u otros delitos, la app puede conservar IP, user-agent, huellas anónimas, horarios, chats asociados y registros de actividad.",
  legal_responsibility_title: "Responsabilidad personal",
  legal_responsibility_body:
    "Interactuás con personas reales. Sos responsable de tus mensajes, archivos, historias y decisiones dentro de la plataforma.",
  legal_illegal_title: "Contenido ilegal",
  legal_illegal_body:
    "El contenido ilegal o riesgoso puede ser moderado, preservado como evidencia técnica y entregado ante un requerimiento legal válido.",
  legal_declaration:
    "Entiendo cómo funciona la aplicación, declaro tener edad suficiente y acepto actuar bajo mi responsabilidad, con los riesgos y consecuencias positivas o negativas que puedan existir.",
  legal_accept: "Acepto y continúo",

  profile_gate_title: "Modo anónimo",
  profile_gate_body:
    "Estás navegando en modo anónimo. Para tener un perfil público con username, historias y chats persistentes, tenés que crear una cuenta con email, verificar el correo y recién ahí configurar tu perfil.",
  profile_gate_note: "No podés saltear la verificación de email entrando desde el shuffle.",
  profile_gate_register: "Crear perfil con email",
  profile_gate_login: "Ya tengo cuenta",
  profile_gate_back_shuffle: "Volver al shuffle anónimo",

  auth_login_title: "Iniciar sesión",
  auth_login_subtitle: "Entrá con tu cuenta de SayItToMe.",
  auth_email: "Email",
  auth_password: "Contraseña",
  auth_enter: "Entrar",
  auth_entering: "Entrando...",
  auth_no_account: "¿No tenés cuenta?",
  auth_has_account: "¿Ya tenés cuenta?",
  auth_register_link: "Crear perfil",
  auth_login_link: "Iniciar sesión",
  auth_detecting_session: "Detectando sesión...",

  auth_register_title: "Crear perfil",
  auth_register_subtitle:
    "Registrate con email y contraseña. Te enviaremos un mail para verificar tu cuenta.",
  auth_confirm_password: "Confirmar contraseña",
  auth_register_submit: "Crear cuenta y verificar email",
  auth_registering: "Creando cuenta...",

  auth_verify_title: "Revisá tu mail",
  auth_verify_body:
    "Enviamos un enlace de verificación a {email}. Tocá el botón del mail y después volvé acá para continuar.",
  auth_verify_check: "Ya verifiqué mi email",
  auth_verify_checking: "Comprobando...",
  auth_verify_resend: "Reenviar email",
  auth_verify_resending: "Reenviando...",
  auth_verify_other_email: "Usar otro email",
  auth_verify_checking_session: "Verificando sesión...",

  setup_title: "Configurar perfil",
  setup_subtitle:
    "Elegí tu usuario y provincia. Después podés agregar fotos y más detalles en Editar perfil.",
  setup_username: "Usuario",
  setup_username_placeholder: "@usuario",
  setup_bio: "Bio",
  setup_bio_placeholder: "Contá algo sobre vos (opcional)",
  setup_saving: "Guardando...",

  province_label: "Provincia",
  province_select: "Seleccionar provincia",
  province_hint:
    "Tu provincia siempre se usa para conectarte con gente de provincias cercanas, aunque elijas no mostrarla en el perfil. Podés cambiarla cuando quieras desde Editar perfil.",
  province_show: "Mostrar en el perfil",
  province_visible: "Visible",
  province_hidden: "Oculta",

  chats_title: "Chats",
  chats_subtitle: "Mensajes en tiempo real con la misma lógica de siempre.",
  chats_anon_banner: "Chats de esta sesión anónima — se guardan en este navegador.",
  chats_empty: "Todavía no tenés chats.",
  chats_no_messages: "Sin mensajes",
  chats_anonymous: "Chat anónimo",

  shuffle_title: "Shuffle",
  shuffle_subtitle: "Perfiles activos, historias recientes y gente conectada en tiempo real.",
  shuffle_search: "Buscar perfiles...",
  shuffle_profiles: "Perfiles",
  shuffle_online: "Online",
  shuffle_stories: "Con historias",
  shuffle_visible: "Visibles",
  shuffle_new_story: "+ Historia",

  apk_new_version: "NUEVA VERSIÓN DISPONIBLE",
  apk_new_version_body: "SayItToMe Android v{version} — actualizá la APK oficial.",
  apk_download: "Descargar APK",
  apk_section_modern_title: "Descargá la app Android",
  apk_section_modern_body:
    "APK oficial con AdMob integrado, shuffle fluido y experiencia AMOLED premium.",
  apk_android: "Android APK",
  apk_iphone_soon: "iPhone (pronto)",
  apk_section_classic_title: "Descargá la app",
  apk_section_classic_body:
    "Mientras Play Store/App Store terminan su proceso, podés dejar accesos directos desde acá.",
  apk_unavailable: "La APK no está disponible todavía.",
  apk_download_fail: "No se pudo descargar la APK. Probá de nuevo en unos minutos.",

  shuffle_no_profiles: "No hay perfiles para mostrar.",
  shuffle_classic_search: "Buscar por nombre o descripcion...",
  shuffle_filter: "Filtro",
  shuffle_change_result: "Cambiar resultado",
  shuffle_people_count: "{count} personas",
  nav_shuffle_refresh: "Cambiar perfiles",

  setup_username_invalid: "El usuario debe tener entre 3 y 24 caracteres (letras, números, . _ -).",
  setup_province_required: "Seleccioná tu provincia.",
  setup_username_taken: "Ese nombre de usuario ya está en uso.",
  setup_save_fail: "No pudimos guardar tu perfil. Probá de nuevo.",
  setup_classic_title: "Tu perfil",
  setup_classic_subtitle: "Elegí tu usuario y provincia. Después podés agregar fotos y más detalles.",

  settings_likes: "me gusta",
  settings_conversations: "conv.",
  settings_followers: "seguidores",
  settings_stories_stat: "historias",
  settings_profile_created: "Perfil creado el {date}",
  settings_admin_panel: "Panel admin",
  settings_no_username: "Sin username",
  settings_bio_empty: "Escribí algo...",

  profile_online: "En línea",
  profile_verified_link: "Perfil abierto desde link oficial",
  profile_default_bio: "Perfil SayItToMe en la nueva web React.",
  profile_likes: "Likes",
  profile_view_stories: "Ver historias ({count})",
  profile_edit_short: "Editar",
  profile_cover_moderated: "Portada moderada",
  profile_photo_moderated: "Foto moderada",

  presence_online: "en línea",
  presence_no_recent: "sin actividad reciente",
  presence_just_now: "hace un momento",
  presence_last_min: "Última vez hace {minutes} min",
  presence_last_hours: "Última vez hace {hours} h",
  presence_last_days: "Última vez hace {days} d",

  chats_classic_session_title: "Chats de esta sesión",
  chats_classic_session_body: "Sin cuenta, los chats se guardan solo en este navegador hasta cerrar la pestaña.",

  chat_loading: "Cargando chat...",
  chat_not_found: "Chat no encontrado.",
  chat_load_fail: "No se pudo cargar el chat.",
  chat_unavailable: "Chat no disponible.",
  chat_back_inbox: "Volver a chats",
  chat_abuse_block_active: "Bloqueo antiacoso activo",
  chat_camera_fail: "No se pudo abrir la cámara. Revisá permisos del navegador.",
  chat_mic_fail: "No se pudo activar el micrófono. Revisá permisos del navegador.",
  chat_abuse_write_block: "No podés escribir en este chat: bloqueo antiacoso activo.",
  chat_save_fail: "No se pudo guardar el chat. Revisá permisos de Firestore.",
  chat_media_camera_photo: "enviado desde cámara",
  chat_media_camera_video: "grabado en vivo",
  chat_media_gallery_photo: "enviado desde galería",
  chat_media_gallery_video: "video de galería",
  chat_media_audio: "audio",
  chat_anon_keep: "Mantenemos tu anonimato",
  chat_anon_identity_hidden: "No sabrán quién sos.",
  chat_anon_you_are: "Sos: {session}",
  chat_bomb: "Bomba",
  abuse_menu_short: "Antiacoso",
  abuse_report: "Denunciar acoso",
  abuse_block_30m: "Bloquear 30 min",
  abuse_block_anon: "Bloquear usuario anónimo",

  abuse_menu_label: "Protección antiacoso",
  abuse_block_success: "Usuario bloqueado. No podrá volver a escribirte por ahora.",
  abuse_block_fail: "No se pudo aplicar el bloqueo antiacoso.",

  edit_save: "Guardar",
  edit_not_logged: "No estás logueado.",
  edit_profile_photo: "Foto de perfil",
  edit_cover_photo: "Foto de portada",
  edit_cover_video: "Video de portada",
  edit_gallery: "Galería fotos/videos",
  edit_cover_loaded: "Portada cargada",
  edit_cover_video_loaded: "Video de portada cargado",
  edit_files_count: "{count}/100 archivos. Fotos y videos permitidos.",
  edit_uploading: "Subiendo {current}/{total}...",
  edit_bio_label: "Biografía",
  edit_bio_placeholder: "Escribí algo...",
  edit_interests: "Intereses",
  edit_interests_placeholder: "música, gym, series...",
  edit_province_hint_short: "Se usa siempre para conectarte con gente cercana. Podés ocultarla en el perfil.",
  edit_mosaic_title: "Mosaico de fotos y videos",
  edit_select: "Seleccionar",

  stories_title: "Historias",
  stories_subtitle: "Burbujas premium, 24h reales, mismo visor fullscreen.",
  stories_create: "+ Crear",
  stories_loading: "Cargando historias...",
  stories_empty: "No hay historias activas.",
  stories_yours: "Tus historias",
  stories_mosaic_title: "Todas las historias",
  stories_create_short: "Crear",
  stories_liked: "Te gusta",
  stories_views: "vistas",
  stories_your_story: "Tu historia",

  admin_verifying: "Verificando admin...",
  admin_denied: "Acceso denegado",
  admin_no_session: "sin sesión",
  admin_panel: "Panel Admin",
  admin_back_app: "Volver a app",
  admin_nav_dashboard: "Dashboard",
  admin_nav_users: "Usuarios",
  admin_nav_stories: "Historias",
  admin_nav_chats: "Chats",
  admin_nav_reports: "Reportes",
  admin_nav_moderation: "Moderación",
  admin_nav_blur: "Blur",
  admin_nav_analytics: "Analytics",
  admin_nav_antiacoso: "Antiacoso",
  admin_nav_logs: "Logs",
  admin_nav_config: "Config",

  settings_loading: "Cargando perfil...",
  profile_open_chat: "Abrir chat",
  profile_edit: "Editar perfil",

  error_register_email_in_use: "Ya existe una cuenta con ese email.",
  error_register_invalid_email: "El email no es válido.",
  error_register_weak_password: "La contraseña debe tener al menos 6 caracteres.",
  error_register_too_many: "Demasiados intentos. Esperá unos minutos.",
  error_register_generic: "No se pudo crear la cuenta. Probá de nuevo.",
  error_login_invalid: "Email o contraseña incorrectos.",
  error_login_not_found: "No existe una cuenta con ese email.",
  error_login_generic: "No se pudo iniciar sesión.",
} as const;

const en: Record<keyof typeof es, string> = {
  lang_es: "Spanish",
  lang_en: "English",
  lang_it: "Italian",
  lang_de: "German",

  language_prompt_title: "App language",
  language_prompt_body:
    "We detected that {language} is commonly spoken in your region. Do you want to use this language in SayItToMe?",
  language_prompt_keep: "Keep {language}",
  language_prompt_use_detected: "Use {language}",
  language_prompt_other: "Choose another language",

  common_loading: "Loading...",
  common_cancel: "Cancel",
  common_continue: "Continue",
  common_back_home: "Back to home",
  common_preparing: "Preparing...",
  common_back: "Back",

  error_register_email_required: "Enter your email.",
  error_register_password_required: "Enter a password.",
  error_register_password_mismatch: "Passwords do not match.",
  auth_verify_not_yet: "We have not verified your email yet. Check your inbox and spam folder.",
  auth_verify_check_fail: "We could not confirm verification. Try again.",
  auth_verify_resent: "We resent the verification email.",
  auth_verify_resend_fail: "We could not resend the email. Wait a few minutes.",

  ux_classic: "Classic",
  ux_modern: "New",

  home_tagline: "Anonymous. Fast. Real.",
  home_modern_badge: "New ultra-fast SayItToMe web in React/Next.js",
  home_modern_headline: "Say it without filters. Live it as a social network.",
  home_modern_body:
    "Profiles, stories, anonymous messages, real-time chats and a dark, mysterious, mobile-first experience.",
  home_create_profile: "Create profile",
  home_go_shuffle: "Go to Shuffle",
  home_card_bio:
    "Premium dark profile, stories, chats and anonymous mode on the new real web.",

  home_classic_login: "Log in",
  home_classic_register: "Create profile",
  home_classic_anon: "Enter anonymously",
  home_classic_anon_title: "Don't want to register?",
  home_classic_anon_body:
    "Tap Enter anonymously to message anyone without creating a profile. Each new anonymous entry creates another identity.",
  home_classic_anon_note:
    "Remember: if you refresh, leave anonymous mode or enter again, the previous anon is discarded and a new identity opens.",

  legal_title: "Before continuing",
  legal_intro:
    "You are entering anonymous mode. Your public identity is not shown to other users, but the app may keep technical security records.",
  legal_session_title: "Temporary session",
  legal_session_body:
    "What you do in anonymous mode is stored only for this session. If you close the tab, return home or enter anonymously again, your previous identity is discarded, those chats disappear from your view and a new identity opens. If you talk again to the same person, it will be a different chat and they will not know who you are.",
  legal_age_title: "Minimum age",
  legal_age_body:
    "You must be at least 13 years old or the minimum age required by the laws of your country.",
  legal_anon_title: "Partial anonymity",
  legal_anon_body:
    "Anonymity protects your identity from other users, but it does not mean absolute impunity.",
  legal_security_title: "Safety and moderation",
  legal_security_body:
    "To prevent abuse, harassment, grooming, threats, child sexual exploitation or other crimes, the app may keep IP, user-agent, anonymous fingerprints, timestamps, related chats and activity records.",
  legal_responsibility_title: "Personal responsibility",
  legal_responsibility_body:
    "You interact with real people. You are responsible for your messages, files, stories and decisions on the platform.",
  legal_illegal_title: "Illegal content",
  legal_illegal_body:
    "Illegal or risky content may be moderated, preserved as technical evidence and delivered upon a valid legal request.",
  legal_declaration:
    "I understand how the application works, I declare that I am old enough and I agree to act under my own responsibility, with the positive or negative risks and consequences that may exist.",
  legal_accept: "I accept and continue",

  profile_gate_title: "Anonymous mode",
  profile_gate_body:
    "You are browsing in anonymous mode. To have a public profile with username, stories and persistent chats, you must create an account with email, verify it and only then configure your profile.",
  profile_gate_note: "You cannot skip email verification by entering from shuffle.",
  profile_gate_register: "Create profile with email",
  profile_gate_login: "I already have an account",
  profile_gate_back_shuffle: "Back to anonymous shuffle",

  auth_login_title: "Log in",
  auth_login_subtitle: "Sign in with your SayItToMe account.",
  auth_email: "Email",
  auth_password: "Password",
  auth_enter: "Enter",
  auth_entering: "Signing in...",
  auth_no_account: "Don't have an account?",
  auth_has_account: "Already have an account?",
  auth_register_link: "Create profile",
  auth_login_link: "Log in",
  auth_detecting_session: "Detecting session...",

  auth_register_title: "Create profile",
  auth_register_subtitle:
    "Sign up with email and password. We will send you a message to verify your account.",
  auth_confirm_password: "Confirm password",
  auth_register_submit: "Create account and verify email",
  auth_registering: "Creating account...",

  auth_verify_title: "Check your email",
  auth_verify_body:
    "We sent a verification link to {email}. Tap the button in the email and then come back here to continue.",
  auth_verify_check: "I already verified my email",
  auth_verify_checking: "Checking...",
  auth_verify_resend: "Resend email",
  auth_verify_resending: "Resending...",
  auth_verify_other_email: "Use another email",
  auth_verify_checking_session: "Verifying session...",

  setup_title: "Set up profile",
  setup_subtitle:
    "Choose your username and province. Later you can add photos and more details in Edit profile.",
  setup_username: "Username",
  setup_username_placeholder: "@username",
  setup_bio: "Bio",
  setup_bio_placeholder: "Tell something about you (optional)",
  setup_saving: "Saving...",

  province_label: "Province",
  province_select: "Select province",
  province_hint:
    "Your province is always used to connect you with people from nearby regions, even if you choose not to show it on your profile. You can change it anytime in Edit profile.",
  province_show: "Show on profile",
  province_visible: "Visible",
  province_hidden: "Hidden",

  chats_title: "Chats",
  chats_subtitle: "Real-time messages with the same logic as always.",
  chats_anon_banner: "Chats from this anonymous session — saved in this browser.",
  chats_empty: "You don't have chats yet.",
  chats_no_messages: "No messages",
  chats_anonymous: "Anonymous chat",

  shuffle_title: "Shuffle",
  shuffle_subtitle: "Active profiles, recent stories and people connected in real time.",
  shuffle_search: "Search profiles...",
  shuffle_profiles: "Profiles",
  shuffle_online: "Online",
  shuffle_stories: "With stories",
  shuffle_visible: "Visible",
  shuffle_new_story: "+ Story",

  apk_new_version: "NEW VERSION AVAILABLE",
  apk_new_version_body: "SayItToMe Android v{version} — update the official APK.",
  apk_download: "Download APK",
  apk_section_modern_title: "Download the Android app",
  apk_section_modern_body:
    "Official APK with integrated AdMob, smooth shuffle and premium AMOLED experience.",
  apk_android: "Android APK",
  apk_iphone_soon: "iPhone (soon)",
  apk_section_classic_title: "Download the app",
  apk_section_classic_body:
    "While Play Store/App Store finish their process, you can use direct links from here.",
  apk_unavailable: "The APK is not available yet.",
  apk_download_fail: "Could not download the APK. Try again in a few minutes.",

  shuffle_no_profiles: "No profiles to show.",
  shuffle_classic_search: "Search by name or description...",
  shuffle_filter: "Filter",
  shuffle_change_result: "Change result",
  shuffle_people_count: "{count} people",
  nav_shuffle_refresh: "Refresh profiles",

  setup_username_invalid: "Username must be 3–24 characters (letters, numbers, . _ -).",
  setup_province_required: "Select your province.",
  setup_username_taken: "That username is already taken.",
  setup_save_fail: "Could not save your profile. Try again.",
  setup_classic_title: "Your profile",
  setup_classic_subtitle: "Choose your username and province. Later you can add photos and more details.",

  settings_likes: "likes",
  settings_conversations: "chats",
  settings_followers: "followers",
  settings_stories_stat: "stories",
  settings_profile_created: "Profile created on {date}",
  settings_admin_panel: "Admin panel",
  settings_no_username: "No username",
  settings_bio_empty: "Write something...",

  profile_online: "Online",
  profile_verified_link: "Profile opened from official link",
  profile_default_bio: "SayItToMe profile on the new React web.",
  profile_likes: "Likes",
  profile_view_stories: "View stories ({count})",
  profile_edit_short: "Edit",
  profile_cover_moderated: "Cover moderated",
  profile_photo_moderated: "Photo moderated",

  presence_online: "online",
  presence_no_recent: "no recent activity",
  presence_just_now: "just now",
  presence_last_min: "Last seen {minutes} min ago",
  presence_last_hours: "Last seen {hours} h ago",
  presence_last_days: "Last seen {days} d ago",

  chats_classic_session_title: "Session chats",
  chats_classic_session_body: "Without an account, chats are saved only in this browser until you close the tab.",

  chat_loading: "Loading chat...",
  chat_not_found: "Chat not found.",
  chat_load_fail: "Could not load the chat.",
  chat_unavailable: "Chat unavailable.",
  chat_back_inbox: "Back to chats",
  chat_abuse_block_active: "Anti-harassment block active",
  chat_camera_fail: "Could not open the camera. Check browser permissions.",
  chat_mic_fail: "Could not enable the microphone. Check browser permissions.",
  chat_abuse_write_block: "You cannot write in this chat: anti-harassment block active.",
  chat_save_fail: "Could not save the chat. Check Firestore permissions.",
  chat_media_camera_photo: "sent from camera",
  chat_media_camera_video: "recorded live",
  chat_media_gallery_photo: "sent from gallery",
  chat_media_gallery_video: "gallery video",
  chat_media_audio: "audio",
  chat_anon_keep: "We keep you anonymous",
  chat_anon_identity_hidden: "They will not know who you are.",
  chat_anon_you_are: "You are: {session}",
  chat_bomb: "Bomb",
  abuse_menu_short: "Anti-harassment",
  abuse_report: "Report harassment",
  abuse_block_30m: "Block 30 min",
  abuse_block_anon: "Block anonymous user",

  abuse_menu_label: "Anti-harassment protection",
  abuse_block_success: "User blocked. They cannot message you for now.",
  abuse_block_fail: "Could not apply the anti-harassment block.",

  edit_save: "Save",
  edit_not_logged: "You are not logged in.",
  edit_profile_photo: "Profile photo",
  edit_cover_photo: "Cover photo",
  edit_cover_video: "Cover video",
  edit_gallery: "Photo/video gallery",
  edit_cover_loaded: "Cover uploaded",
  edit_cover_video_loaded: "Cover video uploaded",
  edit_files_count: "{count}/100 files. Photos and videos allowed.",
  edit_uploading: "Uploading {current}/{total}...",
  edit_bio_label: "Bio",
  edit_bio_placeholder: "Write something...",
  edit_interests: "Interests",
  edit_interests_placeholder: "music, gym, series...",
  edit_province_hint_short: "Always used to connect you with nearby people. You can hide it on your profile.",
  edit_mosaic_title: "Photo and video mosaic",
  edit_select: "Select",

  stories_title: "Stories",
  stories_subtitle: "Premium bubbles, real 24h, same fullscreen viewer.",
  stories_create: "+ Create",
  stories_loading: "Loading stories...",
  stories_empty: "No active stories.",
  stories_yours: "Your stories",
  stories_mosaic_title: "All stories",
  stories_create_short: "Create",
  stories_liked: "Liked",
  stories_views: "views",
  stories_your_story: "Your story",

  admin_verifying: "Verifying admin...",
  admin_denied: "Access denied",
  admin_no_session: "no session",
  admin_panel: "Admin Panel",
  admin_back_app: "Back to app",
  admin_nav_dashboard: "Dashboard",
  admin_nav_users: "Users",
  admin_nav_stories: "Stories",
  admin_nav_chats: "Chats",
  admin_nav_reports: "Reports",
  admin_nav_moderation: "Moderation",
  admin_nav_blur: "Blur",
  admin_nav_analytics: "Analytics",
  admin_nav_antiacoso: "Anti-harassment",
  admin_nav_logs: "Logs",
  admin_nav_config: "Config",

  settings_loading: "Loading profile...",
  profile_open_chat: "Open chat",
  profile_edit: "Edit profile",

  error_register_email_in_use: "An account with this email already exists.",
  error_register_invalid_email: "The email is not valid.",
  error_register_weak_password: "Password must be at least 6 characters.",
  error_register_too_many: "Too many attempts. Wait a few minutes.",
  error_register_generic: "Could not create the account. Try again.",
  error_login_invalid: "Incorrect email or password.",
  error_login_not_found: "No account exists with this email.",
  error_login_generic: "Could not sign in.",
};

const it: Record<keyof typeof es, string> = {
  ...en,
  lang_es: "Spagnolo",
  lang_en: "Inglese",
  lang_it: "Italiano",
  lang_de: "Tedesco",

  language_prompt_title: "Lingua dell'app",
  language_prompt_body:
    "Abbiamo rilevato che in zona si parla {language}. Vuoi usare questa lingua in SayItToMe?",
  language_prompt_keep: "Mantieni {language}",
  language_prompt_use_detected: "Usa {language}",
  language_prompt_other: "Scegli un'altra lingua",

  common_loading: "Caricamento...",
  common_cancel: "Annulla",
  common_continue: "Continua",
  common_back_home: "Torna all'inizio",
  common_preparing: "Preparazione...",

  ux_classic: "Classico",
  ux_modern: "Nuovo",

  home_tagline: "Anonimo. Veloce. Reale.",
  home_modern_badge: "Nuova SayItToMe web ultrarapida in React/Next.js",
  home_modern_headline: "Dillo senza filtri. Vivilo come social network.",
  home_modern_body:
    "Profili, storie, messaggi anonimi, chat in tempo reale e un'esperienza scura, misteriosa e mobile-first.",
  home_create_profile: "Crea profilo",
  home_go_shuffle: "Vai allo Shuffle",
  home_card_bio:
    "Profilo scuro premium, storie, chat e anonimi nella nuova web reale.",

  home_classic_login: "Accedi",
  home_classic_register: "Crea profilo",
  home_classic_anon: "Entra anonimo",
  home_classic_anon_title: "Non vuoi registrarti?",
  home_classic_anon_body:
    "Tocca Entra anonimo per scrivere a chi vuoi senza creare un profilo. Ogni nuovo ingresso anonimo crea un'altra identità.",
  home_classic_anon_note:
    "Ricorda: se aggiorni, esci dall'anonimo o rientri, l'anon precedente viene scartato e si apre una nuova identità.",

  legal_title: "Prima di continuare",
  legal_intro:
    "Stai per entrare in modalità anonima. La tua identità pubblica non viene mostrata ad altri utenti, ma l'app può conservare registri tecnici di sicurezza.",
  legal_session_title: "Sessione temporanea",
  legal_session_body:
    "Ciò che fai in modalità anonima viene salvato solo per questa sessione. Se chiudi la scheda, torni all'inizio o entri di nuovo in anonimo, la tua identità precedente viene scartata, quelle chat scompaiono dalla tua vista e si apre una nuova identità. Se parli di nuovo con la stessa persona, sarà una chat diversa e non saprà chi sei.",
  legal_age_title: "Età minima",
  legal_age_body:
    "Devi avere almeno 13 anni o l'età minima richiesta dalle leggi del tuo paese.",
  legal_anon_title: "Anonimato parziale",
  legal_anon_body:
    "L'anonimato protegge la tua identità dagli altri utenti, ma non significa impunità assoluta.",
  legal_security_title: "Sicurezza e moderazione",
  legal_security_body:
    "Per prevenire abusi, molestie, grooming, minacce, sfruttamento sessuale di minori o altri reati, l'app può conservare IP, user-agent, impronte anonime, orari, chat associate e registri di attività.",
  legal_responsibility_title: "Responsabilità personale",
  legal_responsibility_body:
    "Interagisci con persone reali. Sei responsabile dei tuoi messaggi, file, storie e decisioni sulla piattaforma.",
  legal_illegal_title: "Contenuto illegale",
  legal_illegal_body:
    "I contenuti illegali o rischiosi possono essere moderati, conservati come prova tecnica e consegnati su richiesta legale valida.",
  legal_declaration:
    "Capisco come funziona l'applicazione, dichiaro di avere l'età sufficiente e accetto di agire sotto la mia responsabilità, con i rischi e le conseguenze positive o negative che possono esistere.",
  legal_accept: "Accetto e continuo",

  profile_gate_title: "Modalità anonima",
  profile_gate_body:
    "Stai navigando in modalità anonima. Per avere un profilo pubblico con username, storie e chat persistenti, devi creare un account con email, verificarlo e solo dopo configurare il profilo.",
  profile_gate_note: "Non puoi saltare la verifica email entrando dallo shuffle.",
  profile_gate_register: "Crea profilo con email",
  profile_gate_login: "Ho già un account",
  profile_gate_back_shuffle: "Torna allo shuffle anonimo",

  auth_login_title: "Accedi",
  auth_login_subtitle: "Entra con il tuo account SayItToMe.",
  auth_email: "Email",
  auth_password: "Password",
  auth_enter: "Entra",
  auth_entering: "Accesso...",
  auth_no_account: "Non hai un account?",
  auth_has_account: "Hai già un account?",
  auth_register_link: "Crea profilo",
  auth_login_link: "Accedi",
  auth_detecting_session: "Rilevamento sessione...",

  auth_register_title: "Crea profilo",
  auth_register_subtitle:
    "Registrati con email e password. Ti invieremo una mail per verificare l'account.",
  auth_confirm_password: "Conferma password",
  auth_register_submit: "Crea account e verifica email",
  auth_registering: "Creazione account...",

  auth_verify_title: "Controlla la mail",
  auth_verify_body:
    "Abbiamo inviato un link di verifica a {email}. Tocca il pulsante nella mail e poi torna qui per continuare.",
  auth_verify_check: "Ho già verificato la mail",
  auth_verify_checking: "Verifica...",
  auth_verify_resend: "Reinvia email",
  auth_verify_resending: "Reinvio...",
  auth_verify_other_email: "Usa un'altra email",
  auth_verify_checking_session: "Verifica sessione...",

  setup_title: "Configura profilo",
  setup_subtitle:
    "Scegli username e provincia. Dopo puoi aggiungere foto e altri dettagli in Modifica profilo.",
  setup_username: "Username",
  setup_username_placeholder: "@username",
  setup_bio: "Bio",
  setup_bio_placeholder: "Racconta qualcosa di te (opzionale)",
  setup_saving: "Salvataggio...",

  province_label: "Provincia",
  province_select: "Seleziona provincia",
  province_hint:
    "La tua provincia viene sempre usata per connetterti con persone delle zone vicine, anche se scegli di non mostrarla nel profilo. Puoi cambiarla in qualsiasi momento in Modifica profilo.",
  province_show: "Mostra nel profilo",
  province_visible: "Visibile",
  province_hidden: "Nascosta",

  chats_title: "Chat",
  chats_subtitle: "Messaggi in tempo reale con la stessa logica di sempre.",
  chats_anon_banner: "Chat di questa sessione anonima — salvate in questo browser.",
  chats_empty: "Non hai ancora chat.",
  chats_no_messages: "Nessun messaggio",
  chats_anonymous: "Chat anonima",

  shuffle_title: "Shuffle",
  shuffle_subtitle: "Profili attivi, storie recenti e persone connesse in tempo reale.",
  shuffle_search: "Cerca profili...",
  shuffle_profiles: "Profili",
  shuffle_online: "Online",
  shuffle_stories: "Con storie",
  shuffle_visible: "Visibili",
  shuffle_new_story: "+ Storia",

  apk_new_version: "NUOVA VERSIONE DISPONIBILE",
  apk_new_version_body: "SayItToMe Android v{version} — aggiorna l'APK ufficiale.",
  apk_download: "Scarica APK",
  apk_section_modern_title: "Scarica l'app Android",
  apk_section_modern_body:
    "APK ufficiale con AdMob integrato, shuffle fluido ed esperienza AMOLED premium.",
  apk_android: "Android APK",
  apk_iphone_soon: "iPhone (presto)",
  apk_section_classic_title: "Scarica l'app",
  apk_section_classic_body:
    "Mentre Play Store/App Store completano il processo, puoi usare i link diretti da qui.",
  apk_unavailable: "L'APK non è ancora disponibile.",
  apk_download_fail: "Impossibile scaricare l'APK. Riprova tra qualche minuto.",

  settings_loading: "Caricamento profilo...",
  profile_open_chat: "Apri chat",
  profile_edit: "Modifica profilo",

  error_register_email_in_use: "Esiste già un account con questa email.",
  error_register_invalid_email: "L'email non è valida.",
  error_register_weak_password: "La password deve avere almeno 6 caratteri.",
  error_register_too_many: "Troppi tentativi. Attendi qualche minuto.",
  error_register_generic: "Impossibile creare l'account. Riprova.",
  error_login_invalid: "Email o password errati.",
  error_login_not_found: "Non esiste un account con questa email.",
  error_login_generic: "Impossibile accedere.",
};

const de: Record<keyof typeof es, string> = {
  ...en,
  lang_es: "Spanisch",
  lang_en: "Englisch",
  lang_it: "Italienisch",
  lang_de: "Deutsch",

  language_prompt_title: "App-Sprache",
  language_prompt_body:
    "Wir haben erkannt, dass in deiner Region {language} gesprochen wird. Möchtest du diese Sprache in SayItToMe verwenden?",
  language_prompt_keep: "{language} behalten",
  language_prompt_use_detected: "{language} verwenden",
  language_prompt_other: "Andere Sprache wählen",

  common_loading: "Laden...",
  common_cancel: "Abbrechen",
  common_continue: "Weiter",
  common_back_home: "Zur Startseite",
  common_preparing: "Vorbereiten...",

  ux_classic: "Klassisch",
  ux_modern: "Neu",

  home_tagline: "Anonym. Schnell. Echt.",
  home_modern_badge: "Neue ultraschnelle SayItToMe-Web in React/Next.js",
  home_modern_headline: "Sag es ohne Filter. Lebe es als soziales Netzwerk.",
  home_modern_body:
    "Profile, Stories, anonyme Nachrichten, Echtzeit-Chats und ein dunkles, geheimnisvolles Mobile-First-Erlebnis.",
  home_create_profile: "Profil erstellen",
  home_go_shuffle: "Zum Shuffle",
  home_card_bio:
    "Premium-Dark-Profil, Stories, Chats und Anonymmodus in der neuen echten Web-App.",

  home_classic_login: "Anmelden",
  home_classic_register: "Profil erstellen",
  home_classic_anon: "Anonym eintreten",
  home_classic_anon_title: "Du möchtest dich nicht registrieren?",
  home_classic_anon_body:
    "Tippe auf Anonym eintreten, um ohne Profil jemandem zu schreiben. Jeder neue anonyme Eintritt erstellt eine neue Identität.",
  home_classic_anon_note:
    "Denk daran: Wenn du aktualisierst, den Anonymmodus verlässt oder erneut eintrittst, wird die alte Anonym-Identität verworfen und eine neue geöffnet.",

  legal_title: "Bevor du fortfährst",
  legal_intro:
    "Du trittst in den Anonymmodus ein. Deine öffentliche Identität wird anderen Nutzern nicht angezeigt, aber die App kann technische Sicherheitsprotokolle speichern.",
  legal_session_title: "Temporäre Sitzung",
  legal_session_body:
    "Was du im Anonymmodus tust, wird nur für diese Sitzung gespeichert. Wenn du den Tab schließt, zur Startseite zurückkehrst oder erneut anonym eintrittst, wird deine frühere Identität verworfen, diese Chats verschwinden aus deiner Ansicht und eine neue Identität wird geöffnet. Wenn du wieder mit derselben Person sprichst, ist es ein anderer Chat und die Person weiß nicht, wer du bist.",
  legal_age_title: "Mindestalter",
  legal_age_body:
    "Du musst mindestens 13 Jahre alt sein oder das Mindestalter nach den Gesetzen deines Landes.",
  legal_anon_title: "Teilweise Anonymität",
  legal_anon_body:
    "Anonymität schützt deine Identität vor anderen Nutzern, bedeutet aber keine absolute Straffreiheit.",
  legal_security_title: "Sicherheit und Moderation",
  legal_security_body:
    "Zur Verhinderung von Missbrauch, Belästigung, Grooming, Bedrohungen, sexueller Ausbeutung Minderjähriger oder anderen Straftaten kann die App IP, User-Agent, anonyme Fingerabdrücke, Zeitstempel, zugehörige Chats und Aktivitätsprotokolle speichern.",
  legal_responsibility_title: "Persönliche Verantwortung",
  legal_responsibility_body:
    "Du interagierst mit echten Menschen. Du bist verantwortlich für deine Nachrichten, Dateien, Stories und Entscheidungen auf der Plattform.",
  legal_illegal_title: "Illegale Inhalte",
  legal_illegal_body:
    "Illegale oder riskante Inhalte können moderiert, als technische Beweise aufbewahrt und bei gültiger rechtlicher Anfrage übergeben werden.",
  legal_declaration:
    "Ich verstehe, wie die Anwendung funktioniert, erkläre, dass ich alt genug bin, und akzeptiere, unter meiner Verantwortung zu handeln, mit den positiven oder negativen Risiken und Folgen, die existieren können.",
  legal_accept: "Ich akzeptiere und fahre fort",

  profile_gate_title: "Anonymmodus",
  profile_gate_body:
    "Du surfst im Anonymmodus. Für ein öffentliches Profil mit Username, Stories und persistenten Chats musst du ein Konto mit E-Mail erstellen, es verifizieren und erst dann dein Profil einrichten.",
  profile_gate_note: "Du kannst die E-Mail-Verifizierung nicht überspringen, indem du über Shuffle eintrittst.",
  profile_gate_register: "Profil mit E-Mail erstellen",
  profile_gate_login: "Ich habe bereits ein Konto",
  profile_gate_back_shuffle: "Zurück zum anonymen Shuffle",

  auth_login_title: "Anmelden",
  auth_login_subtitle: "Melde dich mit deinem SayItToMe-Konto an.",
  auth_email: "E-Mail",
  auth_password: "Passwort",
  auth_enter: "Eintreten",
  auth_entering: "Anmeldung...",
  auth_no_account: "Noch kein Konto?",
  auth_has_account: "Bereits ein Konto?",
  auth_register_link: "Profil erstellen",
  auth_login_link: "Anmelden",
  auth_detecting_session: "Sitzung wird erkannt...",

  auth_register_title: "Profil erstellen",
  auth_register_subtitle:
    "Registriere dich mit E-Mail und Passwort. Wir senden dir eine Mail zur Kontoverifizierung.",
  auth_confirm_password: "Passwort bestätigen",
  auth_register_submit: "Konto erstellen und E-Mail verifizieren",
  auth_registering: "Konto wird erstellt...",

  auth_verify_title: "Prüfe deine E-Mail",
  auth_verify_body:
    "Wir haben einen Verifizierungslink an {email} gesendet. Tippe auf die Schaltfläche in der E-Mail und kehre dann hierher zurück.",
  auth_verify_check: "Ich habe meine E-Mail bereits verifiziert",
  auth_verify_checking: "Prüfen...",
  auth_verify_resend: "E-Mail erneut senden",
  auth_verify_resending: "Erneut senden...",
  auth_verify_other_email: "Andere E-Mail verwenden",
  auth_verify_checking_session: "Sitzung wird geprüft...",

  setup_title: "Profil einrichten",
  setup_subtitle:
    "Wähle Username und Provinz. Später kannst du Fotos und weitere Details in Profil bearbeiten hinzufügen.",
  setup_username: "Username",
  setup_username_placeholder: "@username",
  setup_bio: "Bio",
  setup_bio_placeholder: "Erzähl etwas über dich (optional)",
  setup_saving: "Speichern...",

  province_label: "Provinz",
  province_select: "Provinz auswählen",
  province_hint:
    "Deine Provinz wird immer genutzt, um dich mit Menschen aus nahegelegenen Regionen zu verbinden, auch wenn du sie im Profil nicht anzeigst. Du kannst sie jederzeit in Profil bearbeiten ändern.",
  province_show: "Im Profil anzeigen",
  province_visible: "Sichtbar",
  province_hidden: "Versteckt",

  chats_title: "Chats",
  chats_subtitle: "Echtzeit-Nachrichten mit derselben Logik wie immer.",
  chats_anon_banner: "Chats dieser anonymen Sitzung — in diesem Browser gespeichert.",
  chats_empty: "Du hast noch keine Chats.",
  chats_no_messages: "Keine Nachrichten",
  chats_anonymous: "Anonymer Chat",

  shuffle_title: "Shuffle",
  shuffle_subtitle: "Aktive Profile, recente Stories und verbundene Personen in Echtzeit.",
  shuffle_search: "Profile suchen...",
  shuffle_profiles: "Profile",
  shuffle_online: "Online",
  shuffle_stories: "Mit Stories",
  shuffle_visible: "Sichtbar",
  shuffle_new_story: "+ Story",

  apk_new_version: "NEUE VERSION VERFÜGBAR",
  apk_new_version_body: "SayItToMe Android v{version} — aktualisiere die offizielle APK.",
  apk_download: "APK herunterladen",
  apk_section_modern_title: "Android-App herunterladen",
  apk_section_modern_body:
    "Offizielle APK mit integriertem AdMob, flüssigem Shuffle und premium AMOLED-Erlebnis.",
  apk_android: "Android APK",
  apk_iphone_soon: "iPhone (bald)",
  apk_section_classic_title: "App herunterladen",
  apk_section_classic_body:
    "Während Play Store/App Store ihren Prozess abschließen, kannst du direkte Links von hier nutzen.",
  apk_unavailable: "Die APK ist noch nicht verfügbar.",
  apk_download_fail: "APK konnte nicht heruntergeladen werden. Versuche es später erneut.",

  settings_loading: "Profil wird geladen...",
  profile_open_chat: "Chat öffnen",
  profile_edit: "Profil bearbeiten",

  error_register_email_in_use: "Ein Konto mit dieser E-Mail existiert bereits.",
  error_register_invalid_email: "Die E-Mail ist ungültig.",
  error_register_weak_password: "Das Passwort muss mindestens 6 Zeichen haben.",
  error_register_too_many: "Zu viele Versuche. Warte einige Minuten.",
  error_register_generic: "Konto konnte nicht erstellt werden. Versuche es erneut.",
  error_login_invalid: "E-Mail oder Passwort falsch.",
  error_login_not_found: "Es existiert kein Konto mit dieser E-Mail.",
  error_login_generic: "Anmeldung fehlgeschlagen.",
};

export const MESSAGES: Record<AppLocale, Record<keyof typeof es, string>> = {
  es,
  en,
  it,
  de,
};

export type Messages = typeof es;
