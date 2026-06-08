import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Converts a MobileTheme JSON map into a Flutter [ThemeData].
///
/// Handles color tokens, typography, border radius, and brightness.
/// Falls back to sensible Material 3 defaults for any missing tokens.
class ThemeMapper {
  ThemeMapper._();

  // ─── Public API ──────────────────────────────────────────────────────

  /// Builds a complete [ThemeData] from the given theme JSON map.
  ///
  /// Expected keys in [themeJson]:
  /// - `colors`: map of token name → hex string
  /// - `typography`: `{ headingFont, bodyFont }`
  /// - `radius`: map of size name → double (e.g. `{ sm: 4, md: 8, lg: 12, xl: 16, full: 999 }`)
  /// - `mode`: `"light"` or `"dark"`
  static ThemeData fromJson(Map<String, dynamic>? themeJson) {
    if (themeJson == null || themeJson.isEmpty) return _defaultTheme();

    final colors = _parseColors(themeJson['colors'] as Map<String, dynamic>?);
    final typography = themeJson['typography'] as Map<String, dynamic>? ?? {};
    final radius = _parseRadius(themeJson['radius'] as Map<String, dynamic>?);
    final isDark = (themeJson['mode'] ?? 'light') == 'dark';
    final brightness = isDark ? Brightness.dark : Brightness.light;

    // ── Color Scheme ──
    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: colors['primary']!,
      onPrimary: _contrastColor(colors['primary']!),
      secondary: colors['accent']!,
      onSecondary: _contrastColor(colors['accent']!),
      error: colors['danger']!,
      onError: _contrastColor(colors['danger']!),
      surface: colors['card']!,
      onSurface: colors['text']!,
      surfaceContainerHighest: colors['border']!,
      outline: colors['border']!,
    );

    // ── Typography ──
    final headingFont = typography['headingFont'] as String? ?? 'Inter';
    final bodyFont = typography['bodyFont'] as String? ?? 'Inter';

    final textTheme = _buildTextTheme(
      headingFont: headingFont,
      bodyFont: bodyFont,
      textColor: colors['text']!,
      mutedColor: colors['muted']!,
    );

    // ── Shape ──
    final mdRadius = radius['md'] ?? 8.0;
    final lgRadius = radius['lg'] ?? 12.0;
    final xlRadius = radius['xl'] ?? 16.0;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(mdRadius),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colors['background'],
      textTheme: textTheme,
      cardTheme: CardThemeData(
        color: colors['card'],
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(lgRadius),
          side: BorderSide(color: colors['border']!.withValues(alpha: 0.2)),
        ),
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 0),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: colors['background'],
        foregroundColor: colors['text'],
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: _googleFont(headingFont).copyWith(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: colors['text'],
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors['primary'],
          foregroundColor: _contrastColor(colors['primary']!),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(mdRadius),
          ),
          textStyle: _googleFont(bodyFont).copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors['primary'],
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          side: BorderSide(color: colors['border']!),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(mdRadius),
          ),
          textStyle: _googleFont(bodyFont).copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors['primary'],
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          textStyle: _googleFont(bodyFont).copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark
            ? colors['card']!.withValues(alpha: 0.6)
            : colors['background']!.withValues(alpha: 0.8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(mdRadius),
          borderSide: BorderSide(color: colors['border']!),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(mdRadius),
          borderSide: BorderSide(color: colors['border']!.withValues(alpha: 0.5)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(mdRadius),
          borderSide: BorderSide(color: colors['primary']!, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: TextStyle(color: colors['muted']),
      ),
      dividerTheme: DividerThemeData(
        color: colors['border']!.withValues(alpha: 0.3),
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colors['card'],
        selectedColor: colors['primary']!.withValues(alpha: 0.15),
        labelStyle: _googleFont(bodyFont).copyWith(fontSize: 13),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(xlRadius),
          side: BorderSide(color: colors['border']!.withValues(alpha: 0.3)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colors['card'],
        selectedItemColor: colors['primary'],
        unselectedItemColor: colors['muted'],
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: _googleFont(bodyFont).copyWith(
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: _googleFont(bodyFont).copyWith(fontSize: 11),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: colors['primary'],
        inactiveTrackColor: colors['border']!.withValues(alpha: 0.3),
        thumbColor: colors['primary'],
        overlayColor: colors['primary']!.withValues(alpha: 0.12),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return colors['primary'];
          return colors['muted'];
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return colors['primary']!.withValues(alpha: 0.4);
          }
          return colors['border']!.withValues(alpha: 0.3);
        }),
      ),
      extensions: <ThemeExtension<dynamic>>[
        PreviewColors(
          success: colors['success']!,
          danger: colors['danger']!,
          muted: colors['muted']!,
          border: colors['border']!,
        ),
      ],
    );
  }

  // ─── Internals ───────────────────────────────────────────────────────

  static ThemeData _defaultTheme() {
    return fromJson({
      'colors': {
        'primary': '#6366f1',
        'accent': '#8b5cf6',
        'background': '#ffffff',
        'card': '#ffffff',
        'text': '#0f172a',
        'muted': '#94a3b8',
        'border': '#e2e8f0',
        'danger': '#ef4444',
        'success': '#22c55e',
      },
      'typography': {
        'headingFont': 'Inter',
        'bodyFont': 'Inter',
      },
      'radius': {
        'sm': 4.0,
        'md': 8.0,
        'lg': 12.0,
        'xl': 16.0,
        'full': 999.0,
      },
      'mode': 'light',
    });
  }

  /// Parses the `colors` map, hex → Color.
  static Map<String, Color> _parseColors(Map<String, dynamic>? raw) {
    const defaults = {
      'primary': '#6366f1',
      'accent': '#8b5cf6',
      'background': '#ffffff',
      'card': '#ffffff',
      'text': '#0f172a',
      'muted': '#94a3b8',
      'border': '#e2e8f0',
      'danger': '#ef4444',
      'success': '#22c55e',
    };

    final merged = {...defaults};
    if (raw != null) {
      for (final entry in raw.entries) {
        if (entry.value is String) {
          merged[entry.key] = entry.value as String;
        }
      }
    }

    return merged.map((key, hex) => MapEntry(key, _hexToColor(hex)));
  }

  /// Parses radius tokens.
  static Map<String, double> _parseRadius(Map<String, dynamic>? raw) {
    const defaults = {'sm': 4.0, 'md': 8.0, 'lg': 12.0, 'xl': 16.0, 'full': 999.0};
    if (raw == null) return defaults;

    final result = <String, double>{...defaults};
    for (final entry in raw.entries) {
      final v = entry.value;
      if (v is num) result[entry.key] = v.toDouble();
    }
    return result;
  }

  /// Converts a hex color string (with or without #, 3/6/8 digits) to [Color].
  static Color _hexToColor(String hex) {
    var h = hex.replaceFirst('#', '');
    if (h.length == 3) {
      h = h.split('').map((c) => '$c$c').join();
    }
    if (h.length == 6) h = 'FF$h';
    return Color(int.parse(h, radix: 16));
  }

  /// Returns black or white depending on luminance for contrast.
  static Color _contrastColor(Color color) {
    return color.computeLuminance() > 0.5 ? Colors.black : Colors.white;
  }

  /// Returns a base TextStyle from Google Fonts for the given [fontFamily].
  static TextStyle _googleFont(String fontFamily) {
    try {
      return GoogleFonts.getFont(fontFamily);
    } catch (_) {
      return GoogleFonts.inter();
    }
  }

  /// Builds a complete [TextTheme] with heading and body fonts.
  static TextTheme _buildTextTheme({
    required String headingFont,
    required String bodyFont,
    required Color textColor,
    required Color mutedColor,
  }) {
    final heading = _googleFont(headingFont);
    final body = _googleFont(bodyFont);

    return TextTheme(
      displayLarge: heading.copyWith(fontSize: 57, fontWeight: FontWeight.w700, color: textColor),
      displayMedium: heading.copyWith(fontSize: 45, fontWeight: FontWeight.w700, color: textColor),
      displaySmall: heading.copyWith(fontSize: 36, fontWeight: FontWeight.w600, color: textColor),
      headlineLarge: heading.copyWith(fontSize: 32, fontWeight: FontWeight.w600, color: textColor),
      headlineMedium: heading.copyWith(fontSize: 28, fontWeight: FontWeight.w600, color: textColor),
      headlineSmall: heading.copyWith(fontSize: 24, fontWeight: FontWeight.w600, color: textColor),
      titleLarge: heading.copyWith(fontSize: 22, fontWeight: FontWeight.w600, color: textColor),
      titleMedium: body.copyWith(fontSize: 16, fontWeight: FontWeight.w600, color: textColor),
      titleSmall: body.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: textColor),
      bodyLarge: body.copyWith(fontSize: 16, fontWeight: FontWeight.w400, color: textColor),
      bodyMedium: body.copyWith(fontSize: 14, fontWeight: FontWeight.w400, color: textColor),
      bodySmall: body.copyWith(fontSize: 12, fontWeight: FontWeight.w400, color: mutedColor),
      labelLarge: body.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: textColor),
      labelMedium: body.copyWith(fontSize: 12, fontWeight: FontWeight.w500, color: mutedColor),
      labelSmall: body.copyWith(fontSize: 11, fontWeight: FontWeight.w500, color: mutedColor),
    );
  }
}

// ─── Theme Extension for custom tokens ──────────────────────────────────

/// Provides access to extra color tokens not covered by [ColorScheme].
@immutable
class PreviewColors extends ThemeExtension<PreviewColors> {
  const PreviewColors({
    required this.success,
    required this.danger,
    required this.muted,
    required this.border,
  });

  final Color success;
  final Color danger;
  final Color muted;
  final Color border;

  @override
  PreviewColors copyWith({Color? success, Color? danger, Color? muted, Color? border}) {
    return PreviewColors(
      success: success ?? this.success,
      danger: danger ?? this.danger,
      muted: muted ?? this.muted,
      border: border ?? this.border,
    );
  }

  @override
  PreviewColors lerp(PreviewColors? other, double t) {
    if (other == null) return this;
    return PreviewColors(
      success: Color.lerp(success, other.success, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      border: Color.lerp(border, other.border, t)!,
    );
  }
}
