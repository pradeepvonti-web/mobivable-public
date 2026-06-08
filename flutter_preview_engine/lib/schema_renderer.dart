import 'dart:ui';
import 'package:flutter/material.dart';

import 'element_renderer.dart';

/// Renders a complete screen from its JSON definition.
///
/// Takes a screen map with `id`, `title`, `icon`, `elements`, and an optional
/// `layout` field. Supports multiple layout modes:
/// - `stack` (default) — a simple scrollable column
/// - `full-bleed` — edge-to-edge, no horizontal padding
/// - `bento-grid` — a masonry / grid layout
/// - `magazine` — alternating full-width and half-width cards
/// - `split-hero` — first element takes top half, rest below
class SchemaRenderer extends StatelessWidget {
  const SchemaRenderer({
    super.key,
    required this.screen,
  });

  /// The screen JSON map from the schema.
  final Map<String, dynamic> screen;

  @override
  Widget build(BuildContext context) {
    final elements = _elements;
    if (elements.isEmpty) return _buildEmpty(context);

    final layout = (screen['layout'] as String?) ?? 'stack';

    return switch (layout) {
      'full-bleed' => _buildFullBleed(context, elements),
      'bento-grid' => _buildBentoGrid(context, elements),
      'magazine' => _buildMagazine(context, elements),
      'split-hero' => _buildSplitHero(context, elements),
      _ => _buildStack(context, elements),
    };
  }

  /// Extracts the list of element maps from the screen.
  List<Map<String, dynamic>> get _elements {
    final raw = screen['elements'];
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .toList();
    }
    return [];
  }

  // ─── Layout: Stack (default) ─────────────────────────────────────────

  Widget _buildStack(BuildContext context, List<Map<String, dynamic>> elements) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: elements.length,
      itemBuilder: (ctx, i) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: ElementRenderer.render(ctx, elements[i]),
      ),
    );
  }

  // ─── Layout: Full-Bleed ──────────────────────────────────────────────

  Widget _buildFullBleed(BuildContext context, List<Map<String, dynamic>> elements) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      itemCount: elements.length,
      itemBuilder: (ctx, i) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: ElementRenderer.render(ctx, elements[i]),
      ),
    );
  }

  // ─── Layout: Bento Grid ──────────────────────────────────────────────

  Widget _buildBentoGrid(BuildContext context, List<Map<String, dynamic>> elements) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: elements.map((el) {
          // Grid span: 1 = half-width, 2 = full-width
          final span = (el['gridSpan'] as num?)?.toInt() ?? 1;
          final screenWidth = MediaQuery.of(context).size.width;
          final itemWidth = span >= 2
              ? screenWidth - 24
              : (screenWidth - 34) / 2;

          return SizedBox(
            width: itemWidth,
            child: ElementRenderer.render(context, el),
          );
        }).toList(),
      ),
    );
  }

  // ─── Layout: Magazine ────────────────────────────────────────────────

  Widget _buildMagazine(BuildContext context, List<Map<String, dynamic>> elements) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          for (var i = 0; i < elements.length; i++) ...[
            if (i % 3 == 0)
              // Full-width hero item
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ElementRenderer.render(context, elements[i]),
              )
            else if (i + 1 < elements.length && i % 3 == 1)
              // Two items side-by-side
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: ElementRenderer.render(context, elements[i])),
                    const SizedBox(width: 10),
                    Expanded(
                      child: i + 1 < elements.length
                          ? ElementRenderer.render(context, elements[i + 1])
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }

  // ─── Layout: Split-Hero ──────────────────────────────────────────────

  Widget _buildSplitHero(BuildContext context, List<Map<String, dynamic>> elements) {
    return Column(
      children: [
        // Hero (first element) takes ~40% of screen
        Expanded(
          flex: 4,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            child: ElementRenderer.render(context, elements.first),
          ),
        ),
        // Rest scrolls below
        Expanded(
          flex: 6,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            itemCount: elements.length - 1,
            itemBuilder: (ctx, i) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ElementRenderer.render(ctx, elements[i + 1]),
            ),
          ),
        ),
      ],
    );
  }

  // ─── Empty State ─────────────────────────────────────────────────────

  Widget _buildEmpty(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.layers_outlined, size: 48, color: theme.colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            'No elements on this screen',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}
