import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:js' as js;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';

import 'schema_notifier.dart';
import 'schema_renderer.dart';
import 'navigation_bar.dart';
import 'theme_mapper.dart';

/// GlobalKey on the RepaintBoundary that wraps the rendered preview. Hoisted
/// to a top-level so the message dispatcher in `_PreviewEngineAppState` can
/// reach it without prop-drilling through the Consumer + Scaffold tree.
final GlobalKey previewBoundaryKey = GlobalKey(debugLabel: 'mvbl-preview-boundary');

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => SchemaNotifier(),
      child: const PreviewEngineApp(),
    ),
  );
}

/// Root app widget. Listens for postMessage events from the parent iframe
/// and updates the SchemaNotifier accordingly.
class PreviewEngineApp extends StatefulWidget {
  const PreviewEngineApp({super.key});

  @override
  State<PreviewEngineApp> createState() => _PreviewEngineAppState();
}

class _PreviewEngineAppState extends State<PreviewEngineApp> {
  @override
  void initState() {
    super.initState();
    _listenForMessages();
    // Notify the parent that Flutter is ready
    _sendReadyMessage();
  }

  void _sendReadyMessage() {
    try {
      html.window.parent?.postMessage(
        {'type': 'FLUTTER_READY'},
        '*',
      );
    } catch (_) {}
  }

  void _listenForMessages() {
    // 1. Listen to cross-frame message events directly
    html.window.onMessage.listen((event) {
      try {
        final data = event.data;
        if (data is Map) {
          _handleMapMessage(Map<String, dynamic>.from(data));
        } else if (data is String) {
          _handleStringMessage(data);
        }
      } catch (e) {
        debugPrint('[PreviewEngine] Error handling message event: $e');
      }
    });

    // 2. Define the global JS callback for stringified messages
    js.context['_flutterPreviewOnMessage'] = js.allowInterop((String messageJson) {
      _handleStringMessage(messageJson);
    });
  }

  void _handleStringMessage(String jsonStr) {
    try {
      final decoded = jsonDecode(jsonStr);
      if (decoded is Map) {
        _handleMapMessage(Map<String, dynamic>.from(decoded));
      }
    } catch (e) {
      debugPrint('[PreviewEngine] Error parsing JS message: $e');
    }
  }

  void _handleMapMessage(Map<String, dynamic> data) {
    final type = data['type'] as String?;
    final notifier = context.read<SchemaNotifier>();

    switch (type) {
      case 'SCHEMA_UPDATE':
        final schema = data['schema'];
        if (schema is Map<String, dynamic>) {
          notifier.updateSchema(schema);
        } else if (schema is String) {
          notifier.updateSchema(
            jsonDecode(schema) as Map<String, dynamic>,
          );
        }
        break;

      case 'THEME_UPDATE':
        final theme = data['theme'];
        if (theme is Map<String, dynamic>) {
          notifier.updateTheme(theme);
        } else if (theme is String) {
          notifier.updateTheme(
            jsonDecode(theme) as Map<String, dynamic>,
          );
        }
        break;

      case 'SCREEN_CHANGE':
        // dart2js represents all numbers as JS Numbers; a JSON `1` may arrive
        // as `int` OR `double` depending on the codec path, and `as int?` on a
        // double returns null. Use `num?.toInt()` to handle both safely.
        final rawIndex = data['screenIndex'];
        final index = rawIndex is num ? rawIndex.toInt() : null;
        if (index != null) {
          notifier.setScreen(index);
        }
        break;

      case 'DEVICE_INFO':
        // Could be used for adaptive rendering in the future
        break;

      case 'SCREENSHOT_REQUEST':
        // Studio asked for a PNG of the current screen. The reply must
        // include the original requestId so the studio can match it back
        // to its in-flight promise (it may dispatch multiple captures).
        final requestId = data['requestId'] as String? ?? '';
        // Schedule after the current build phase so the boundary's render
        // object is guaranteed to be present.
        scheduleMicrotask(() => _captureAndReplyToScreenshot(requestId));
        break;
    }
  }

  /// Capture the [RepaintBoundary] keyed by [previewBoundaryKey] as a PNG
  /// and post it back to the parent window.
  ///
  /// Errors are caught and posted as `error` so the studio can surface them
  /// instead of waiting for the timeout.
  Future<void> _captureAndReplyToScreenshot(String requestId) async {
    void post(Map<String, dynamic> payload) {
      try {
        html.window.parent?.postMessage({
          'type': 'FLUTTER_SCREENSHOT',
          'requestId': requestId,
          ...payload,
        }, '*');
      } catch (_) {
        // If postMessage itself fails, there's no recovery path.
      }
    }

    try {
      final boundary = previewBoundaryKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null) {
        post({'error': 'No render boundary mounted yet — schema may not have arrived.'});
        return;
      }
      // pixelRatio = 2 gives App-Store-quality output without exploding payload size.
      final ui.Image image = await boundary.toImage(pixelRatio: 2.0);
      final ByteData? bytes =
          await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (bytes == null) {
        post({'error': 'toByteData returned null.'});
        return;
      }
      final Uint8List pngBytes = bytes.buffer.asUint8List();
      final String b64 = base64Encode(pngBytes);
      post({'dataUrl': 'data:image/png;base64,$b64'});
    } catch (e) {
      post({'error': 'Capture failed: $e'});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<SchemaNotifier>(
      builder: (context, notifier, _) {
        // Convert the flat MobileTheme format to the ThemeMapper's expected format.
        // MobileTheme has: primary, accent, background, card, text, muted, border, danger, success, mode, typography, radius
        // ThemeMapper expects: { colors: {...}, typography: {...}, radius: {...}, mode: ... }
        final rawTheme = notifier.theme;
        final themeData = rawTheme != null
            ? ThemeMapper.fromJson(_normalizeThemeForMapper(rawTheme))
            : ThemeMapper.fromJson(null);

        return MaterialApp(
          title: 'Preview Engine',
          debugShowCheckedModeBanner: false,
          theme: themeData,
          home: notifier.schema != null
              ? const _SchemaAppShell()
              : const _EmptyState(),
        );
      },
    );
  }

  /// Converts the flat MobileTheme JSON into the nested format expected by ThemeMapper.
  static Map<String, dynamic> _normalizeThemeForMapper(Map<String, dynamic> theme) {
    // If it already has a 'colors' key, it's already in the right format.
    if (theme.containsKey('colors')) return theme;

    // Convert flat format → nested format
    return {
      'colors': {
        'primary': theme['primary'] ?? '#6366f1',
        'accent': theme['accent'] ?? '#8b5cf6',
        'background': theme['background'] ?? '#0a0a1a',
        'card': theme['card'] ?? '#111827',
        'text': theme['text'] ?? '#f8fafc',
        'muted': theme['muted'] ?? '#64748b',
        'border': theme['border'] ?? '#1e293b',
        'danger': theme['danger'] ?? '#ef4444',
        'success': theme['success'] ?? '#22c55e',
      },
      'typography': theme['typography'] ?? {
        'headingFont': 'Inter',
        'bodyFont': 'Inter',
      },
      'radius': theme['radius'] ?? {
        'sm': 6.0,
        'md': 10.0,
        'lg': 16.0,
        'xl': 24.0,
        'full': 999.0,
      },
      'mode': theme['mode'] ?? 'dark',
    };
  }
}

/// The main app shell that shows the current screen + bottom navigation.
class _SchemaAppShell extends StatelessWidget {
  const _SchemaAppShell();

  @override
  Widget build(BuildContext context) {
    final notifier = context.watch<SchemaNotifier>();
    final screens = notifier.screens;
    final navItems = notifier.navigationItems;
    final currentIndex = notifier.currentScreenIndex.clamp(0, screens.isEmpty ? 0 : screens.length - 1);

    if (screens.isEmpty) {
      return const Scaffold(
        body: Center(child: Text('No screens defined')),
      );
    }

    final currentScreen = screens[currentIndex];

    return Scaffold(
      // RepaintBoundary makes this subtree its own layer, which lets us
      // capture it cleanly via boundary.toImage() on SCREENSHOT_REQUEST
      // without disturbing the rest of the widget tree (e.g. status bar,
      // bottom nav). Key is the top-level previewBoundaryKey so the
      // dispatcher can reach the render object without prop-drilling.
      body: SafeArea(
        child: RepaintBoundary(
          key: previewBoundaryKey,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: SchemaRenderer(
              key: ValueKey(currentScreen['id'] ?? currentIndex),
              screen: currentScreen,
            ),
          ),
        ),
      ),
      bottomNavigationBar: navItems.length > 1
          ? const PreviewNavigationBar()
          : null,
    );
  }
}

/// Shown when no schema has been received yet.
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: theme.colorScheme.primary.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Waiting for app schema…',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Design your app in the editor',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
