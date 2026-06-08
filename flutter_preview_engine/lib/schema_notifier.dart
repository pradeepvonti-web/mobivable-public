import 'package:flutter/foundation.dart';

/// Holds the current preview state: the full MobileAppSchema, resolved theme,
/// and the index of the currently visible screen.
///
/// Used with [Provider] / [ChangeNotifierProvider] so that the widget tree
/// rebuilds whenever the schema or active screen changes.
class SchemaNotifier extends ChangeNotifier {
  // ─── State ───────────────────────────────────────────────────────────

  /// The full MobileAppSchema JSON.
  Map<String, dynamic>? _schema;
  Map<String, dynamic>? get schema => _schema;

  /// The resolved theme JSON (from THEME_UPDATE or from schema.theme).
  Map<String, dynamic>? _theme;
  Map<String, dynamic>? get theme => _theme;

  /// Index of the currently active screen / tab.
  int _currentScreenIndex = 0;
  int get currentScreenIndex => _currentScreenIndex;

  // ─── Derived getters ─────────────────────────────────────────────────

  /// The app name from the schema.
  String get appName {
    return (_schema?['appName'] as String?) ?? 'Preview';
  }

  /// The list of screen objects from the schema.
  List<Map<String, dynamic>> get screens {
    final raw = _schema?['screens'];
    if (raw is List) {
      return raw.cast<Map<String, dynamic>>();
    }
    return [];
  }

  /// The currently active screen JSON, or null.
  Map<String, dynamic>? get currentScreen {
    if (screens.isEmpty) return null;
    final idx = _currentScreenIndex.clamp(0, screens.length - 1);
    return screens[idx];
  }

  /// Navigation items extracted from the schema's navigation field or
  /// synthesized from screens.
  List<Map<String, dynamic>> get navigationItems {
    // Try explicit navigation items first.
    final nav = _schema?['navigation'];
    if (nav is Map<String, dynamic>) {
      final items = nav['items'];
      if (items is List && items.isNotEmpty) {
        return items.cast<Map<String, dynamic>>();
      }
    }

    // Fall back to generating nav from screens.
    return screens.map((s) {
      return <String, dynamic>{
        'label': s['title'] ?? 'Screen',
        'icon': s['icon'] ?? 'home',
        'screenId': s['id'],
      };
    }).toList();
  }

  /// The navigation style (tabs, bottom-nav, etc.).
  String get navigationStyle {
    final nav = _schema?['navigation'];
    if (nav is Map<String, dynamic>) {
      return (nav['style'] as String?) ?? 'bottom-tabs';
    }
    return 'bottom-tabs';
  }

  // ─── Mutators ────────────────────────────────────────────────────────

  /// Replaces the entire schema, preserving the user's current screen
  /// selection when possible.
  ///
  /// The studio sends SCHEMA_UPDATE on every chat turn (and sometimes
  /// many times per second when a React effect's dependencies churn).
  /// Hard-resetting `_currentScreenIndex` on every update meant the
  /// user could not stay on a non-default tab — they'd be bounced back
  /// to screen 0 within milliseconds of tapping any other nav item.
  ///
  /// New behavior:
  ///   1. Try to keep the *same screen by id* — robust to reordering.
  ///   2. Else, if the current index still points to a valid screen,
  ///      keep it.
  ///   3. Else (out of bounds, no schema before), reset to 0.
  void updateSchema(Map<String, dynamic> newSchema) {
    final previousScreenId = currentScreen?['id'] as String?;
    _schema = newSchema;

    final newScreens = screens; // re-reads from the just-set _schema
    if (newScreens.isEmpty) {
      _currentScreenIndex = 0;
    } else if (previousScreenId != null) {
      final keepIdx = newScreens.indexWhere((s) => s['id'] == previousScreenId);
      _currentScreenIndex = keepIdx >= 0
          ? keepIdx
          : _currentScreenIndex.clamp(0, newScreens.length - 1);
    } else {
      _currentScreenIndex = _currentScreenIndex.clamp(0, newScreens.length - 1);
    }

    // If the schema embeds a theme, adopt it (unless an explicit theme was set).
    if (_theme == null && newSchema.containsKey('theme')) {
      final themeVal = newSchema['theme'];
      if (themeVal is Map) {
        _theme = Map<String, dynamic>.from(themeVal);
      }
    }

    notifyListeners();
  }

  /// Replaces just the theme.
  void updateTheme(Map<String, dynamic> newTheme) {
    _theme = newTheme;
    notifyListeners();
  }

  /// Switches to a different screen tab.
  void setScreen(int index) {
    if (index == _currentScreenIndex) return;
    if (index < 0 || (screens.isNotEmpty && index >= screens.length)) return;
    _currentScreenIndex = index;
    notifyListeners();
  }
}
