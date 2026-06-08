import 'dart:ui';
import 'package:flutter/material.dart';

import 'icon_mapper.dart';
import 'theme_mapper.dart';
import 'widgets/donut_chart_painter.dart';
import 'widgets/bar_chart_painter.dart';
import 'widgets/progress_ring_painter.dart';
import 'widgets/line_chart_painter.dart';
import 'widgets/sparkline_painter.dart';
import 'widgets/shimmer_widget.dart';
import 'widgets/radar_chart_painter.dart';
import 'widgets/gauge_chart_painter.dart';

/// Master switch that maps an element type string from the schema JSON to
/// a production-quality Flutter widget.
///
/// Handles all 40+ element types defined in the MobileAppSchema.
/// All widgets use [Theme.of(context)] for consistent styling and degrade
/// gracefully when optional props are missing.
class ElementRenderer {
  ElementRenderer._();

  /// The main dispatch: reads `element['type']` and returns the
  /// corresponding widget.
  static Widget render(BuildContext context, Map<String, dynamic> element) {
    final type = (element['type'] as String?) ?? '';
    final rawProps = element['props'] as Map<String, dynamic>? ?? element;

    // The studio's schema generator puts container children at the *element*
    // root (`element.elements` / `element.children`), while older props-based
    // schemas put them inside `element.props`. Merge both shapes so container
    // renderers (section, glass-card, gradient-mesh-bg, ...) always find them.
    Map<String, dynamic> props = rawProps;
    final rootElements = element['elements'];
    final rootChildren = element['children'];
    if ((rootElements != null && rawProps['elements'] == null) ||
        (rootChildren != null && rawProps['children'] == null)) {
      props = Map<String, dynamic>.from(rawProps);
      if (rootElements != null && props['elements'] == null) {
        props['elements'] = rootElements;
      }
      if (rootChildren != null && props['children'] == null) {
        props['children'] = rootChildren;
      }
    }

    // ── Visibility support ──
    final visible = element['visible'];
    if (visible == false) return const SizedBox.shrink();

    final rendered = switch (type) {
      'greeting' => _greeting(context, props),
      'progress-ring' => _progressRing(context, props),
      'stat-row' => _statRow(context, props),
      'button' => _button(context, props),
      'activity-feed' => _activityFeed(context, props),
      'card' => _card(context, props),
      'text' => _text(context, props),
      'input' => _input(context, props),
      'image' => _image(context, props),
      'list' => _list(context, props),
      'donut-chart' => _donutChart(context, props),
      'bar-chart' => _barChart(context, props),
      'toggle' => _toggle(context, props),
      'divider' => _divider(context, props),
      'spacer' => _spacer(context, props),
      'section' => _section(context, props),
      'header' => _header(context, props),
      'search-bar' => _searchBar(context, props),
      'avatar' => _avatar(context, props),
      'badge' => _badge(context, props),
      'slider' => _slider(context, props),
      'tab-bar' => _tabBar(context, props),
      'bottom-sheet' => _bottomSheet(context, props),
      'carousel' => _carousel(context, props),
      'rating' => _rating(context, props),
      'chip-group' => _chipGroup(context, props),
      'notification' => _notification(context, props),
      'price-tag' => _priceTag(context, props),
      'step-indicator' => _stepIndicator(context, props),
      'countdown' => _countdown(context, props),
      'grid-cards' => _gridCards(context, props),
      'hero-banner' => _heroBanner(context, props),
      'glass-card' => _glassCard(context, props),
      'gradient-mesh-bg' => _gradientMeshBg(context, props),
      'parallax-hero' => _parallaxHero(context, props),
      'marquee' => _marquee(context, props),
      'stat-card-xl' => _statCardXl(context, props),
      'feature-showcase' => _featureShowcase(context, props),
      'testimonial' => _testimonial(context, props),
      'pricing-card' => _pricingCard(context, props),
      'onboarding-slide' => _onboardingSlide(context, props),
      'line-chart' => _renderLineChart(context, props),
      'sparkline' => _renderSparkline(context, props),
      'progress-bar' => _renderProgressBar(context, props),
      'skeleton' => _renderSkeleton(context, props),
      'empty-state' => _renderEmptyState(context, props),
      'map-card' => _renderMapCard(context, props),
      'chat-bubble' => _renderChatBubble(context, props),
      'video-player' => _renderVideoPlayer(context, props),
      'timeline' => _renderTimeline(context, props),
      'accordion' => _renderAccordion(context, props),
      'dropdown' => _renderDropdown(context, props),
      'date-picker' => _renderDatePicker(context, props),
      'checkbox' => _renderCheckbox(context, props),
      'radio-group' => _renderRadioGroup(context, props),
      'textarea' => _renderTextarea(context, props),
      'swipe-card' => _renderSwipeCard(context, props),
      'calendar-strip' => _renderCalendarStrip(context, props),
      'bank-card' => _renderBankCard(context, props),
      'radar-chart' => _renderRadarChart(context, props),
      'gauge-chart' => _renderGaugeChart(context, props),
      _ => _unknown(context, type),
    };

    return _applyElementStyle(rendered, element);
  }

  // ───────────────────────────────────────────────────────────────────────
  // HELPERS
  // ───────────────────────────────────────────────────────────────────────

  static PreviewColors? _extras(BuildContext context) {
    return Theme.of(context).extension<PreviewColors>();
  }

  static Color _hexToColor(String? hex, Color fallback) {
    if (hex == null || hex.isEmpty) return fallback;
    var h = hex.replaceFirst('#', '');
    if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
    if (h.length == 6) h = 'FF$h';
    try {
      return Color(int.parse(h, radix: 16));
    } catch (_) {
      return fallback;
    }
  }

  static List<Map<String, dynamic>> _listItems(dynamic raw) {
    if (raw is List) return raw.whereType<Map<String, dynamic>>().toList();
    return [];
  }

  /// Recursively renders children elements.
  static List<Widget> _renderChildren(
    BuildContext context,
    dynamic children,
  ) {
    return _listItems(children).map((c) => render(context, c)).toList();
  }

  // ───────────────────────────────────────────────────────────────────────
  // ELEMENT BUILDERS
  // ───────────────────────────────────────────────────────────────────────

  // ─── Greeting ────────────────────────────────────────────────────────

  static Widget _greeting(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? 'Hello!';
    final subtitle = p['subtitle'] as String?;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle, style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.outline,
            )),
          ],
        ],
      ),
    );
  }

  // ─── Progress Ring ───────────────────────────────────────────────────

  static Widget _progressRing(BuildContext context, Map<String, dynamic> p) {
    final value = (p['value'] as num?)?.toDouble() ?? 0;
    final max = (p['max'] as num?)?.toDouble() ?? 100;
    final label = p['label'] as String?;
    final valueLabel = p['valueLabel'] as String?;
    final size = (p['size'] as num?)?.toDouble() ?? 120;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: ProgressRingWidget(
          value: value,
          max: max,
          label: label,
          valueLabel: valueLabel,
          size: size,
        ),
      ),
    );
  }

  // ─── Stat Row ────────────────────────────────────────────────────────

  static Widget _statRow(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final items = _listItems(p['items']);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: items.map((item) {
          final icon = item['icon'] as String?;
          final value = (item['value'] ?? '').toString();
          final label = (item['label'] as String?) ?? '';

          return Expanded(
            child: Column(
              children: [
                if (icon != null)
                  Icon(
                    IconMapper.resolve(icon),
                    size: 20,
                    color: theme.colorScheme.primary,
                  ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  // ─── Button ──────────────────────────────────────────────────────────

  static Widget _button(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = (p['label'] as String?) ?? 'Button';
    final variant = (p['variant'] as String?) ?? 'primary';
    final icon = p['icon'] as String?;
    final isFullWidth = (p['fullWidth'] as bool?) ?? false;
    final extras = _extras(context);

    Widget btn;
    switch (variant) {
      case 'secondary':
        btn = FilledButton.tonal(
          onPressed: () {},
          child: _buttonChild(icon, label),
        );
        break;
      case 'outline':
        btn = OutlinedButton(
          onPressed: () {},
          child: _buttonChild(icon, label),
        );
        break;
      case 'ghost':
        btn = TextButton(
          onPressed: () {},
          child: _buttonChild(icon, label),
        );
        break;
      case 'danger':
        btn = ElevatedButton(
          onPressed: () {},
          style: ElevatedButton.styleFrom(
            backgroundColor: extras?.danger ?? Colors.red,
            foregroundColor: Colors.white,
          ),
          child: _buttonChild(icon, label),
        );
        break;
      default: // primary
        btn = ElevatedButton(
          onPressed: () {},
          child: _buttonChild(icon, label),
        );
    }

    if (isFullWidth) {
      return SizedBox(
        width: double.infinity,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: btn,
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: btn,
    );
  }

  static Widget _buttonChild(String? icon, String label) {
    if (icon != null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(IconMapper.resolve(icon), size: 18),
          const SizedBox(width: 8),
          Text(label),
        ],
      );
    }
    return Text(label);
  }

  // ─── Activity Feed ───────────────────────────────────────────────────

  static Widget _activityFeed(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final items = _listItems(p['items']);

    return Column(
      children: items.asMap().entries.map((entry) {
        final i = entry.key;
        final item = entry.value;
        final title = (item['title'] as String?) ?? '';
        final subtitle = item['subtitle'] as String?;
        final time = item['time'] as String?;
        final icon = item['icon'] as String?;
        final isLast = i == items.length - 1;

        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Timeline dots & line
              SizedBox(
                width: 32,
                child: Column(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      margin: const EdgeInsets.only(top: 6),
                      decoration: BoxDecoration(
                        color: i == 0
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outline.withValues(alpha: 0.3),
                        shape: BoxShape.circle,
                      ),
                    ),
                    if (!isLast)
                      Expanded(
                        child: Container(
                          width: 2,
                          color: theme.colorScheme.outline.withValues(alpha: 0.15),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: theme.textTheme.titleSmall),
                            if (subtitle != null)
                              Text(subtitle, style: theme.textTheme.bodySmall),
                          ],
                        ),
                      ),
                      if (time != null)
                        Text(time, style: theme.textTheme.labelSmall),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // ─── Card ────────────────────────────────────────────────────────────

  static Widget _card(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = p['title'] as String?;
    final children = _renderChildren(context, p['children'] ?? p['elements']);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null) ...[
              Text(title, style: theme.textTheme.titleMedium),
              const SizedBox(height: 12),
            ],
            ...children,
          ],
        ),
      ),
    );
  }

  // ─── Text ────────────────────────────────────────────────────────────

  static Widget _text(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final content = (p['content'] as String?) ?? (p['text'] as String?) ?? '';
    final size = p['size'] as String?;
    final weight = p['weight'] as String?;
    final color = p['color'] as String?;
    final align = p['align'] as String?;

    TextStyle style = theme.textTheme.bodyMedium ?? const TextStyle();

    // Size mapping
    switch (size) {
      case 'xs':
        style = style.copyWith(fontSize: 11);
        break;
      case 'sm':
        style = style.copyWith(fontSize: 12);
        break;
      case 'lg':
        style = style.copyWith(fontSize: 18);
        break;
      case 'xl':
        style = style.copyWith(fontSize: 22);
        break;
      case '2xl':
        style = style.copyWith(fontSize: 28);
        break;
      case '3xl':
        style = style.copyWith(fontSize: 34);
        break;
    }

    // Weight mapping
    switch (weight) {
      case 'light':
        style = style.copyWith(fontWeight: FontWeight.w300);
        break;
      case 'normal':
        style = style.copyWith(fontWeight: FontWeight.w400);
        break;
      case 'medium':
        style = style.copyWith(fontWeight: FontWeight.w500);
        break;
      case 'semibold':
        style = style.copyWith(fontWeight: FontWeight.w600);
        break;
      case 'bold':
        style = style.copyWith(fontWeight: FontWeight.w700);
        break;
    }

    // Color mapping
    if (color == 'muted') {
      style = style.copyWith(color: theme.colorScheme.outline);
    } else if (color == 'primary') {
      style = style.copyWith(color: theme.colorScheme.primary);
    } else if (color == 'danger') {
      style = style.copyWith(color: _extras(context)?.danger);
    } else if (color == 'success') {
      style = style.copyWith(color: _extras(context)?.success);
    } else if (color != null) {
      style = style.copyWith(color: _hexToColor(color, style.color ?? Colors.black));
    }

    TextAlign? textAlign;
    switch (align) {
      case 'center':
        textAlign = TextAlign.center;
        break;
      case 'right':
        textAlign = TextAlign.right;
        break;
      case 'left':
        textAlign = TextAlign.left;
        break;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Text(content, style: style, textAlign: textAlign),
    );
  }

  // ─── Input ───────────────────────────────────────────────────────────

  static Widget _input(BuildContext context, Map<String, dynamic> p) {
    final label = p['label'] as String?;
    final placeholder = (p['placeholder'] as String?) ?? '';
    final icon = p['icon'] as String?;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextField(
        decoration: InputDecoration(
          labelText: label,
          hintText: placeholder,
          prefixIcon: icon != null ? Icon(IconMapper.resolve(icon)) : null,
        ),
      ),
    );
  }

  // ─── Image ───────────────────────────────────────────────────────────

  static Widget _image(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final src = p['src'] as String?;
    final height = (p['height'] as num?)?.toDouble() ?? 180;
    final radius = (p['radius'] as num?)?.toDouble() ?? 12;
    final alt = (p['alt'] as String?) ?? '';

    if (src != null && src.startsWith('http')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Image.network(
          src,
          height: height,
          width: double.infinity,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _imagePlaceholder(theme, height, radius, alt),
        ),
      );
    }

    return _imagePlaceholder(theme, height, radius, alt);
  }

  static Widget _imagePlaceholder(ThemeData theme, double height, double radius, String alt) {
    return Container(
      height: height,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.15),
            theme.colorScheme.secondary.withValues(alpha: 0.1),
          ],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.image_outlined, size: 32, color: theme.colorScheme.outline),
            if (alt.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(alt, style: theme.textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }

  // ─── List ────────────────────────────────────────────────────────────

  static Widget _list(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final items = _listItems(p['items']);
    final showDividers = (p['dividers'] as bool?) ?? true;

    return Column(
      children: items.asMap().entries.map((entry) {
        final i = entry.key;
        final item = entry.value;
        final title = (item['title'] as String?) ?? '';
        final subtitle = item['subtitle'] as String?;
        final icon = item['icon'] as String?;
        final trailing = item['trailing'] as String?;
        final badge = item['badge'] as String?;
        final avatarUrl = item['avatar'] as String?;
        final showChevron = (item['chevron'] as bool?) ?? false;

        Widget? leading;
        if (avatarUrl != null) {
          leading = CircleAvatar(
            radius: 20,
            backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
            child: Text(
              title.isNotEmpty ? title[0].toUpperCase() : '?',
              style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.w600),
            ),
          );
        } else if (icon != null) {
          leading = Icon(IconMapper.resolve(icon), color: theme.colorScheme.primary);
        }

        Widget? trailingWidget;
        if (badge != null) {
          trailingWidget = Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              badge,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          );
        } else if (trailing != null) {
          trailingWidget = Text(trailing, style: theme.textTheme.bodySmall);
        } else if (showChevron) {
          trailingWidget = Icon(Icons.chevron_right, color: theme.colorScheme.outline);
        }

        return Column(
          children: [
            ListTile(
              leading: leading,
              title: Text(title),
              subtitle: subtitle != null ? Text(subtitle) : null,
              trailing: trailingWidget,
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              dense: true,
            ),
            if (showDividers && i < items.length - 1)
              const Divider(height: 1, indent: 16),
          ],
        );
      }).toList(),
    );
  }

  // ─── Donut Chart ─────────────────────────────────────────────────────

  static Widget _donutChart(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final rawSegments = _listItems(p['segments']);
    final centerValue = p['centerValue'] as String?;
    final centerLabel = p['centerLabel'] as String?;
    final size = (p['size'] as num?)?.toDouble() ?? 160;

    final defaultColors = [
      theme.colorScheme.primary,
      theme.colorScheme.secondary,
      _extras(context)?.success ?? Colors.green,
      _extras(context)?.danger ?? Colors.red,
      Colors.orange,
      Colors.teal,
    ];

    final segments = rawSegments.asMap().entries.map((e) {
      return DonutSegment.fromJson(
        e.value,
        defaultColors[e.key % defaultColors.length],
      );
    }).toList();

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: DonutChartWidget(
          segments: segments,
          centerValue: centerValue,
          centerLabel: centerLabel,
          size: size,
        ),
      ),
    );
  }

  // ─── Bar Chart ───────────────────────────────────────────────────────

  static Widget _barChart(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final rawBars = _listItems(p['bars'] ?? p['items']);
    final height = (p['height'] as num?)?.toDouble() ?? 180;

    final defaultColors = [
      theme.colorScheme.primary,
      theme.colorScheme.primary.withValues(alpha: 0.7),
      theme.colorScheme.secondary,
      _extras(context)?.success ?? Colors.green,
      Colors.orange,
    ];

    final bars = rawBars.asMap().entries.map((e) {
      return BarData.fromJson(
        e.value,
        defaultColors[e.key % defaultColors.length],
      );
    }).toList();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: BarChartWidget(bars: bars, height: height),
    );
  }

  // ─── Toggle ──────────────────────────────────────────────────────────

  static Widget _toggle(BuildContext context, Map<String, dynamic> p) {
    final title = (p['label'] as String?) ?? (p['title'] as String?) ?? '';
    final subtitle = p['subtitle'] as String?;
    final value = (p['value'] as bool?) ?? false;

    return SwitchListTile(
      title: Text(title),
      subtitle: subtitle != null ? Text(subtitle) : null,
      value: value,
      onChanged: (_) {},
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
    );
  }

  // ─── Divider ─────────────────────────────────────────────────────────

  static Widget _divider(BuildContext context, Map<String, dynamic> p) {
    return Padding(
      padding: EdgeInsets.symmetric(
        vertical: (p['spacing'] as num?)?.toDouble() ?? 8,
      ),
      child: const Divider(),
    );
  }

  // ─── Spacer ──────────────────────────────────────────────────────────

  static Widget _spacer(BuildContext context, Map<String, dynamic> p) {
    final height = (p['height'] as num?)?.toDouble() ?? 16;
    return SizedBox(height: height);
  }

  // ─── Section ─────────────────────────────────────────────────────────

  static Widget _section(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = p['title'] as String?;
    final action = p['action'] as String?;
    final children = _renderChildren(context, p['children'] ?? p['elements']);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (action != null)
                    Text(
                      action,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                ],
              ),
            ),
          ...children,
        ],
      ),
    );
  }

  // ─── Header ──────────────────────────────────────────────────────────

  static Widget _header(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? '';
    final subtitle = p['subtitle'] as String?;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle, style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.outline,
            )),
          ],
        ],
      ),
    );
  }

  // ─── Search Bar ──────────────────────────────────────────────────────

  static Widget _searchBar(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final placeholder = (p['placeholder'] as String?) ?? 'Search...';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextField(
        decoration: InputDecoration(
          hintText: placeholder,
          prefixIcon: Icon(Icons.search, color: theme.colorScheme.outline),
          filled: true,
          fillColor: theme.colorScheme.surface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(
              color: theme.colorScheme.outline.withValues(alpha: 0.2),
            ),
          ),
        ),
      ),
    );
  }

  // ─── Avatar ──────────────────────────────────────────────────────────

  static Widget _avatar(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final name = (p['name'] as String?) ?? '';
    final size = (p['size'] as num?)?.toDouble() ?? 48;
    final status = p['status'] as String?;

    final initials = name.split(' ').map((w) => w.isNotEmpty ? w[0] : '').take(2).join().toUpperCase();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: size / 2,
            backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.15),
            child: Text(
              initials,
              style: TextStyle(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w600,
                fontSize: size * 0.35,
              ),
            ),
          ),
          if (status != null)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: status == 'online'
                      ? (_extras(context)?.success ?? Colors.green)
                      : theme.colorScheme.outline,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: theme.colorScheme.surface,
                    width: 2,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ─── Badge ───────────────────────────────────────────────────────────

  static Widget _badge(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = (p['label'] as String?) ?? '';
    final variant = (p['variant'] as String?) ?? 'default';

    Color bg;
    Color fg;
    switch (variant) {
      case 'success':
        bg = (_extras(context)?.success ?? Colors.green).withValues(alpha: 0.15);
        fg = _extras(context)?.success ?? Colors.green;
        break;
      case 'danger':
        bg = (_extras(context)?.danger ?? Colors.red).withValues(alpha: 0.15);
        fg = _extras(context)?.danger ?? Colors.red;
        break;
      case 'warning':
        bg = Colors.orange.withValues(alpha: 0.15);
        fg = Colors.orange;
        break;
      case 'primary':
        bg = theme.colorScheme.primary.withValues(alpha: 0.15);
        fg = theme.colorScheme.primary;
        break;
      default:
        bg = theme.colorScheme.outline.withValues(alpha: 0.1);
        fg = theme.colorScheme.onSurface;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: fg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  // ─── Slider ──────────────────────────────────────────────────────────

  static Widget _slider(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final value = (p['value'] as num?)?.toDouble() ?? 50;
    final min = (p['min'] as num?)?.toDouble() ?? 0;
    final max = (p['max'] as num?)?.toDouble() ?? 100;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(label, style: theme.textTheme.titleSmall),
                  Text(
                    value.round().toString(),
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          Slider(
            value: value.clamp(min, max),
            min: min,
            max: max,
            onChanged: (_) {},
          ),
        ],
      ),
    );
  }

  // ─── Tab Bar ─────────────────────────────────────────────────────────

  static Widget _tabBar(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final tabs = _listItems(p['tabs'] ?? p['items']);
    final activeIndex = (p['activeIndex'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: tabs.asMap().entries.map((entry) {
            final i = entry.key;
            final tab = entry.value;
            final label = (tab['label'] as String?) ?? '';
            final isActive = i == activeIndex;

            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: isActive
                      ? theme.colorScheme.primary
                      : theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: isActive
                      ? null
                      : Border.all(
                          color: theme.colorScheme.outline.withValues(alpha: 0.2),
                        ),
                ),
                child: Text(
                  label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: isActive
                        ? theme.colorScheme.onPrimary
                        : theme.colorScheme.onSurface,
                    fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  // ─── Bottom Sheet ────────────────────────────────────────────────────

  static Widget _bottomSheet(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = p['title'] as String?;
    final children = _renderChildren(context, p['children'] ?? p['elements']);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.outline.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          if (title != null) ...[
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
          ],
          ...children,
        ],
      ),
    );
  }

  // ─── Carousel ────────────────────────────────────────────────────────

  static Widget _carousel(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final items = _listItems(p['items']);
    final height = (p['height'] as num?)?.toDouble() ?? 180;

    return SizedBox(
      height: height,
      child: PageView.builder(
        controller: PageController(viewportFraction: 0.85),
        itemCount: items.isEmpty ? 1 : items.length,
        itemBuilder: (ctx, i) {
          if (items.isEmpty) {
            return Card(
              child: Center(child: Text('Slide ${i + 1}', style: theme.textTheme.bodyMedium)),
            );
          }
          final item = items[i];
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (item['title'] != null)
                      Text(item['title'] as String, style: theme.textTheme.titleMedium),
                    if (item['subtitle'] != null) ...[
                      const SizedBox(height: 4),
                      Text(item['subtitle'] as String, style: theme.textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ─── Rating ──────────────────────────────────────────────────────────

  static Widget _rating(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final value = (p['value'] as num?)?.toDouble() ?? 0;
    final max = (p['max'] as num?)?.toInt() ?? 5;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(max, (i) {
          IconData icon;
          if (i < value.floor()) {
            icon = Icons.star_rounded;
          } else if (i < value) {
            icon = Icons.star_half_rounded;
          } else {
            icon = Icons.star_outline_rounded;
          }
          return Icon(icon, color: Colors.amber, size: 24);
        }),
      ),
    );
  }

  // ─── Chip Group ──────────────────────────────────────────────────────

  static Widget _chipGroup(BuildContext context, Map<String, dynamic> p) {
    final items = _listItems(p['items'] ?? p['chips']);
    final selectedIndex = (p['selectedIndex'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: items.asMap().entries.map((entry) {
          final i = entry.key;
          final item = entry.value;
          final label = (item['label'] as String?) ?? '';
          return ChoiceChip(
            label: Text(label),
            selected: i == selectedIndex,
            onSelected: (_) {},
          );
        }).toList(),
      ),
    );
  }

  // ─── Notification ────────────────────────────────────────────────────

  static Widget _notification(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? '';
    final message = p['message'] as String?;
    final time = p['time'] as String?;
    final icon = p['icon'] as String?;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                IconMapper.resolve(icon),
                size: 20,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: theme.textTheme.titleSmall),
                  if (message != null) ...[
                    const SizedBox(height: 2),
                    Text(message, style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
            if (time != null)
              Text(time, style: theme.textTheme.labelSmall),
          ],
        ),
      ),
    );
  }

  // ─── Price Tag ───────────────────────────────────────────────────────

  static Widget _priceTag(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final price = (p['price'] as String?) ?? '';
    final originalPrice = p['originalPrice'] as String?;
    final badge = p['badge'] as String?;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            price,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          if (originalPrice != null) ...[
            const SizedBox(width: 8),
            Text(
              originalPrice,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.outline,
                decoration: TextDecoration.lineThrough,
              ),
            ),
          ],
          if (badge != null) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: (_extras(context)?.success ?? Colors.green).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                badge,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: _extras(context)?.success ?? Colors.green,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ─── Step Indicator ──────────────────────────────────────────────────

  static Widget _stepIndicator(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final steps = _listItems(p['steps'] ?? p['items']);
    final currentStep = (p['currentStep'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: steps.asMap().entries.map((entry) {
          final i = entry.key;
          final step = entry.value;
          final label = (step['label'] as String?) ?? '${i + 1}';
          final isCompleted = i < currentStep;
          final isCurrent = i == currentStep;

          return Expanded(
            child: Row(
              children: [
                // Step circle
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: isCompleted || isCurrent
                        ? theme.colorScheme.primary
                        : theme.colorScheme.outline.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: isCompleted
                        ? Icon(Icons.check, size: 16, color: theme.colorScheme.onPrimary)
                        : Text(
                            '${i + 1}',
                            style: TextStyle(
                              color: isCurrent
                                  ? theme.colorScheme.onPrimary
                                  : theme.colorScheme.outline,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                // Connecting line
                if (i < steps.length - 1)
                  Expanded(
                    child: Container(
                      height: 2,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      color: isCompleted
                          ? theme.colorScheme.primary
                          : theme.colorScheme.outline.withValues(alpha: 0.15),
                    ),
                  ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  // ─── Countdown ───────────────────────────────────────────────────────

  static Widget _countdown(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final hours = (p['hours'] as num?)?.toInt() ?? 0;
    final minutes = (p['minutes'] as num?)?.toInt() ?? 0;
    final seconds = (p['seconds'] as num?)?.toInt() ?? 0;

    Widget timeBox(String value, String label) {
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.15),
              ),
            ),
            child: Text(
              value.padLeft(2, '0'),
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(label, style: theme.textTheme.labelSmall),
        ],
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          timeBox(hours.toString(), 'HRS'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(':', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          ),
          timeBox(minutes.toString(), 'MIN'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(':', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          ),
          timeBox(seconds.toString(), 'SEC'),
        ],
      ),
    );
  }

  // ─── Grid Cards ──────────────────────────────────────────────────────

  static Widget _gridCards(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final items = _listItems(p['items']);
    final columns = (p['columns'] as num?)?.toInt() ?? 2;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 1.1,
      ),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final item = items[i];
        final title = (item['title'] as String?) ?? '';
        final subtitle = item['subtitle'] as String?;
        final icon = item['icon'] as String?;

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      IconMapper.resolve(icon),
                      color: theme.colorScheme.primary,
                      size: 24,
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                Text(
                  title,
                  style: theme.textTheme.titleSmall,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  // ─── Hero Banner ─────────────────────────────────────────────────────

  static Widget _heroBanner(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? '';
    final subtitle = p['subtitle'] as String?;
    final buttonLabel = p['buttonLabel'] as String?;
    final height = (p['height'] as num?)?.toDouble() ?? 200;

    return Container(
      height: height,
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            theme.colorScheme.primary,
            theme.colorScheme.secondary,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            title,
            style: theme.textTheme.headlineSmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: Colors.white.withValues(alpha: 0.85),
              ),
            ),
          ],
          if (buttonLabel != null) ...[
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: theme.colorScheme.primary,
              ),
              child: Text(buttonLabel),
            ),
          ],
        ],
      ),
    );
  }

  // ─── Glass Card ──────────────────────────────────────────────────────

  static Widget _glassCard(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = p['title'] as String?;
    final children = _renderChildren(context, p['children'] ?? p['elements']);

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.15),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (title != null) ...[
                Text(title, style: theme.textTheme.titleMedium),
                const SizedBox(height: 12),
              ],
              ...children,
            ],
          ),
        ),
      ),
    );
  }

  // ─── Gradient Mesh BG ────────────────────────────────────────────────

  static Widget _gradientMeshBg(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final children = _renderChildren(context, p['children'] ?? p['elements']);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0.0, 0.4, 0.7, 1.0],
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.12),
            theme.colorScheme.secondary.withValues(alpha: 0.08),
            theme.colorScheme.primary.withValues(alpha: 0.05),
            theme.colorScheme.surface,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }

  // ─── Parallax Hero ───────────────────────────────────────────────────

  static Widget _parallaxHero(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? '';
    final subtitle = p['subtitle'] as String?;
    final height = (p['height'] as num?)?.toDouble() ?? 220;

    return Container(
      height: height,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.3),
            theme.colorScheme.surface,
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.5),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 20,
            bottom: 20,
            right: 20,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: Colors.white.withValues(alpha: 0.85),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Marquee ─────────────────────────────────────────────────────────

  static Widget _marquee(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final text = (p['text'] as String?) ?? 'Scrolling text...';

    // Static placeholder: real marquee would use AnimationController
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.campaign_outlined, size: 18, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  // ─── Stat Card XL ────────────────────────────────────────────────────

  static Widget _statCardXl(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = p['title'] as String?;
    final value = (p['value'] as String?) ?? '0';
    final delta = p['delta'] as String?;
    final deltaType = (p['deltaType'] as String?) ?? 'positive';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null)
              Text(title, style: theme.textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(
              value,
              style: theme.textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            if (delta != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    deltaType == 'positive' ? Icons.trending_up : Icons.trending_down,
                    size: 18,
                    color: deltaType == 'positive'
                        ? (_extras(context)?.success ?? Colors.green)
                        : (_extras(context)?.danger ?? Colors.red),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    delta,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: deltaType == 'positive'
                          ? (_extras(context)?.success ?? Colors.green)
                          : (_extras(context)?.danger ?? Colors.red),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
            // Sparkline placeholder
            const SizedBox(height: 12),
            Container(
              height: 40,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: LinearGradient(
                  colors: [
                    theme.colorScheme.primary.withValues(alpha: 0.1),
                    theme.colorScheme.primary.withValues(alpha: 0.02),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Feature Showcase ────────────────────────────────────────────────

  static Widget _featureShowcase(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? '';
    final description = p['description'] as String?;
    final icon = p['icon'] as String?;
    final buttonLabel = p['buttonLabel'] as String?;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            // Image / Icon placeholder
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(
                child: Icon(
                  IconMapper.resolve(icon),
                  size: 36,
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: theme.textTheme.titleMedium),
                  if (description != null) ...[
                    const SizedBox(height: 4),
                    Text(description, style: theme.textTheme.bodySmall, maxLines: 3),
                  ],
                  if (buttonLabel != null) ...[
                    const SizedBox(height: 10),
                    TextButton(
                      onPressed: () {},
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 0),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(buttonLabel),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Testimonial ─────────────────────────────────────────────────────

  static Widget _testimonial(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final quote = (p['quote'] as String?) ?? '';
    final name = (p['name'] as String?) ?? '';
    final role = p['role'] as String?;
    final rating = (p['rating'] as num?)?.toDouble() ?? 5;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Rating stars
            Row(
              children: List.generate(5, (i) {
                return Icon(
                  i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: Colors.amber,
                  size: 18,
                );
              }),
            ),
            const SizedBox(height: 12),
            Text(
              '"$quote"',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontStyle: FontStyle.italic,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.15),
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: TextStyle(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: theme.textTheme.titleSmall),
                    if (role != null)
                      Text(role, style: theme.textTheme.bodySmall),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ─── Pricing Card ───────────────────────────────────────────────────

  static Widget _pricingCard(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final planName = (p['planName'] as String?) ?? 'Plan';
    final price = (p['price'] as String?) ?? '\$0';
    final period = (p['period'] as String?) ?? '/month';
    final features = (p['features'] as List?)?.cast<String>() ?? [];
    final buttonLabel = (p['buttonLabel'] as String?) ?? 'Get Started';
    final highlighted = (p['highlighted'] as bool?) ?? false;

    return Card(
      color: highlighted ? theme.colorScheme.primary : null,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text(
              planName,
              style: theme.textTheme.titleMedium?.copyWith(
                color: highlighted ? theme.colorScheme.onPrimary : null,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  price,
                  style: theme.textTheme.displaySmall?.copyWith(
                    color: highlighted ? theme.colorScheme.onPrimary : null,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    period,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: highlighted
                          ? theme.colorScheme.onPrimary.withValues(alpha: 0.7)
                          : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ...features.map((f) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle_outline,
                    size: 18,
                    color: highlighted
                        ? theme.colorScheme.onPrimary.withValues(alpha: 0.8)
                        : (_extras(context)?.success ?? Colors.green),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    f,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: highlighted ? theme.colorScheme.onPrimary : null,
                    ),
                  ),
                ],
              ),
            )),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: highlighted
                  ? ElevatedButton(
                      onPressed: () {},
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: theme.colorScheme.primary,
                      ),
                      child: Text(buttonLabel),
                    )
                  : OutlinedButton(
                      onPressed: () {},
                      child: Text(buttonLabel),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Onboarding Slide ────────────────────────────────────────────────

  static Widget _onboardingSlide(BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = (p['title'] as String?) ?? '';
    final body = p['body'] as String?;
    final icon = p['icon'] as String?;
    final buttonLabel = p['buttonLabel'] as String?;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Icon / image area
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Icon(
                IconMapper.resolve(icon),
                size: 48,
                color: theme.colorScheme.primary,
              ),
            ),
          ),
          const SizedBox(height: 32),
          Text(
            title,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.center,
          ),
          if (body != null) ...[
            const SizedBox(height: 12),
            Text(
              body,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.outline,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
          ],
          if (buttonLabel != null) ...[
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {},
                child: Text(buttonLabel),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ─── Line Chart ──────────────────────────────────────────────────────

  static Widget _renderLineChart(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final rawSeries = _listItems(p['series']);
    final labels = (p['labels'] as List?)?.cast<String>() ?? [];
    final height = (p['height'] as num?)?.toDouble() ?? 200;
    final fill = (p['fill'] as bool?) ?? true;
    final showDots = (p['showDots'] as bool?) ?? true;
    final showGrid = (p['showGrid'] as bool?) ?? true;

    final defaultColors = [
      theme.colorScheme.primary,
      theme.colorScheme.secondary,
      _extras(context)?.success ?? Colors.green,
      _extras(context)?.danger ?? Colors.red,
      Colors.orange,
      Colors.teal,
    ];

    final series = rawSeries.asMap().entries.map((e) {
      return LineChartSeries.fromJson(
        e.value,
        defaultColors[e.key % defaultColors.length],
      );
    }).toList();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: LineChartWidget(
        series: series,
        labels: labels,
        height: height,
        fill: fill,
        showDots: showDots,
        showGrid: showGrid,
      ),
    );
  }

  // ─── Sparkline ───────────────────────────────────────────────────────

  static Widget _renderSparkline(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final rawData = p['data'];
    final data = <double>[];
    if (rawData is List) {
      for (final v in rawData) {
        data.add((v as num?)?.toDouble() ?? 0);
      }
    }
    final color =
        _hexToColor(p['color'] as String?, theme.colorScheme.primary);
    final fill = (p['fill'] as bool?) ?? true;
    final showLastDot = (p['showLastDot'] as bool?) ?? true;
    final height = (p['height'] as num?)?.toDouble() ?? 40;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: SparklineWidget(
        data: data,
        color: color,
        height: height,
        fill: fill,
        showLastDot: showLastDot,
      ),
    );
  }

  // ─── Progress Bar ────────────────────────────────────────────────────

  static Widget _renderProgressBar(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final value = (p['value'] as num?)?.toDouble() ?? 0;
    final max = (p['max'] as num?)?.toDouble() ?? 100;
    final showPercent = (p['showPercent'] as bool?) ?? true;
    final height = (p['height'] as num?)?.toDouble() ?? 8;
    final color =
        _hexToColor(p['color'] as String?, theme.colorScheme.primary);
    final trackColor =
        theme.colorScheme.onSurface.withValues(alpha: 0.08);

    final fraction = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    final percentText = '${(fraction * 100).round()}%';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null || showPercent)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (label != null)
                    Text(label, style: theme.textTheme.titleSmall),
                  if (showPercent)
                    Text(
                      percentText,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
            ),
          ClipRRect(
            borderRadius: BorderRadius.circular(height / 2),
            child: SizedBox(
              height: height,
              width: double.infinity,
              child: Stack(
                children: [
                  // Track
                  Container(color: trackColor),
                  // Fill
                  FractionallySizedBox(
                    widthFactor: fraction,
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            color,
                            color.withValues(alpha: 0.7),
                          ],
                        ),
                      ),
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

  // ─── Skeleton ────────────────────────────────────────────────────────

  static Widget _renderSkeleton(
      BuildContext context, Map<String, dynamic> p) {
    final variant =
        ShimmerWidget.parseVariant(p['variant'] as String?);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ShimmerWidget(variant: variant),
    );
  }

  // ─── Empty State ─────────────────────────────────────────────────────

  static Widget _renderEmptyState(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final icon = p['icon'] as String?;
    final title = (p['title'] as String?) ?? 'Nothing here';
    final description = p['description'] as String?;
    final buttonLabel = p['buttonLabel'] as String?;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              IconMapper.resolve(icon),
              size: 64,
              color: theme.colorScheme.outline.withValues(alpha: 0.4),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            if (description != null) ...[
              const SizedBox(height: 8),
              Text(
                description,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.outline,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (buttonLabel != null) ...[
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {},
                child: Text(buttonLabel),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ─── Map Card ────────────────────────────────────────────────────────

  static Widget _renderMapCard(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final address = (p['address'] as String?) ?? '123 Main Street';
    final subtitle = p['subtitle'] as String?;
    final buttonLabel = (p['buttonLabel'] as String?) ?? 'Get Directions';
    final icon = p['icon'] as String?;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Map placeholder with gradient
            Container(
              height: 160,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    const Color(0xFF4FC3F7),
                    const Color(0xFF81C784),
                    const Color(0xFFA5D6A7),
                  ],
                ),
              ),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.9),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Icon(
                    IconMapper.resolve(icon ?? 'location'),
                    size: 28,
                    color: const Color(0xFFE53935),
                  ),
                ),
              ),
            ),
            // Bottom info area
            Container(
              padding: const EdgeInsets.all(16),
              color: theme.colorScheme.surface,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    address,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.outline,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.directions, size: 18),
                      label: Text(buttonLabel),
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

  // ─── Chat Bubble ─────────────────────────────────────────────────────

  static Widget _renderChatBubble(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final messages = _listItems(p['messages'] ?? p['items']);
    final showInput = (p['showInput'] as bool?) ?? false;
    final inputPlaceholder =
        (p['inputPlaceholder'] as String?) ?? 'Type a message...';

    return Column(
      children: [
        ...messages.map((msg) {
          final text = (msg['text'] as String?) ?? '';
          final isUser = (msg['isUser'] as bool?) ?? false;
          final time = msg['time'] as String?;
          final name = msg['name'] as String?;

          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisAlignment:
                  isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (!isUser) ...[
                  CircleAvatar(
                    radius: 14,
                    backgroundColor:
                        theme.colorScheme.primary.withValues(alpha: 0.15),
                    child: Text(
                      (name != null && name.isNotEmpty)
                          ? name[0].toUpperCase()
                          : '?',
                      style: TextStyle(
                        color: theme.colorScheme.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Column(
                    crossAxisAlignment: isUser
                        ? CrossAxisAlignment.end
                        : CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: isUser
                              ? theme.colorScheme.primary
                              : theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(16),
                            topRight: const Radius.circular(16),
                            bottomLeft:
                                Radius.circular(isUser ? 16 : 4),
                            bottomRight:
                                Radius.circular(isUser ? 4 : 16),
                          ),
                        ),
                        child: Text(
                          text,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: isUser
                                ? theme.colorScheme.onPrimary
                                : theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                      if (time != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            time,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.outline,
                              fontSize: 10,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
        // Optional input bar
        if (showInput) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.15),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    inputPlaceholder,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.send_rounded,
                  size: 20,
                  color: theme.colorScheme.primary,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // ─── Video Player ────────────────────────────────────────────────────

  static Widget _renderVideoPlayer(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final title = p['title'] as String?;
    final channel = p['channel'] as String?;
    final duration = p['duration'] as String?;
    final progress = (p['progress'] as num?)?.toDouble();
    final height = (p['height'] as num?)?.toDouble() ?? 200;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          children: [
            // Dark gradient placeholder
            Container(
              height: height,
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF2C2C2C),
                    Color(0xFF1A1A1A),
                  ],
                ),
              ),
            ),
            // Center play button
            SizedBox(
              height: height,
              width: double.infinity,
              child: Center(
                child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.9),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.3),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.play_arrow_rounded,
                    size: 36,
                    color: Color(0xFF1A1A1A),
                  ),
                ),
              ),
            ),
            // Bottom overlay with title, channel, duration
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 24, 14, 10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.75),
                    ],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (title != null)
                                Text(
                                  title,
                                  style:
                                      theme.textTheme.titleSmall?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              if (channel != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    channel,
                                    style: theme.textTheme.bodySmall
                                        ?.copyWith(
                                      color: Colors.white
                                          .withValues(alpha: 0.7),
                                      fontSize: 11,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (duration != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.6),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              duration,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                      ],
                    ),
                    // Progress bar
                    if (progress != null) ...[
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: SizedBox(
                          height: 3,
                          child: LinearProgressIndicator(
                            value: progress.clamp(0.0, 1.0),
                            backgroundColor:
                                Colors.white.withValues(alpha: 0.2),
                            valueColor:
                                const AlwaysStoppedAnimation<Color>(
                              Color(0xFFFF1744),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Timeline ────────────────────────────────────────────────────────

  static Widget _renderTimeline(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final events = _listItems(p['events'] ?? p['items']);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        children: events.asMap().entries.map((entry) {
          final i = entry.key;
          final event = entry.value;
          final title = (event['title'] as String?) ?? '';
          final description = event['description'] as String?;
          final time = event['time'] as String?;
          final completed = (event['completed'] as bool?) ?? false;
          final isLast = i == events.length - 1;

          return IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Left: vertical line + dot
                SizedBox(
                  width: 36,
                  child: Column(
                    children: [
                      Container(
                        width: 22,
                        height: 22,
                        margin: const EdgeInsets.only(top: 2),
                        decoration: BoxDecoration(
                          color: completed
                              ? theme.colorScheme.primary
                              : Colors.transparent,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: completed
                                ? theme.colorScheme.primary
                                : theme.colorScheme.outline
                                    .withValues(alpha: 0.4),
                            width: 2,
                          ),
                        ),
                        child: completed
                            ? Icon(
                                Icons.check,
                                size: 14,
                                color: theme.colorScheme.onPrimary,
                              )
                            : null,
                      ),
                      if (!isLast)
                        Expanded(
                          child: Container(
                            width: 2,
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            color: completed
                                ? theme.colorScheme.primary
                                    .withValues(alpha: 0.4)
                                : theme.colorScheme.outline
                                    .withValues(alpha: 0.15),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Right: card
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    title,
                                    style: theme.textTheme.titleSmall
                                        ?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                if (time != null)
                                  Text(
                                    time,
                                    style: theme.textTheme.labelSmall
                                        ?.copyWith(
                                      color: theme.colorScheme.outline,
                                    ),
                                  ),
                              ],
                            ),
                            if (description != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                description,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.outline,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  // ─── Accordion ───────────────────────────────────────────────────────

  static Widget _renderAccordion(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final sections = _listItems(p['sections'] ?? p['items']);

    return Card(
      child: Column(
        children: sections.asMap().entries.map((entry) {
          final i = entry.key;
          final section = entry.value;
          final title = (section['title'] as String?) ?? '';
          final content = (section['content'] as String?) ?? '';
          final icon = section['icon'] as String?;
          final expanded = (section['expanded'] as bool?) ?? false;
          final isLast = i == sections.length - 1;

          return Column(
            children: [
              // Header row
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  children: [
                    if (icon != null) ...[
                      Icon(
                        IconMapper.resolve(icon),
                        size: 20,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 12),
                    ],
                    Expanded(
                      child: Text(
                        title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      expanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 22,
                      color: theme.colorScheme.outline,
                    ),
                  ],
                ),
              ),
              // Content (visible when expanded)
              if (expanded)
                Padding(
                  padding:
                      const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      content,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.outline,
                        height: 1.5,
                      ),
                    ),
                  ),
                ),
              // Divider between sections
              if (!isLast)
                Divider(
                  height: 1,
                  indent: 16,
                  endIndent: 16,
                  color:
                      theme.colorScheme.outline.withValues(alpha: 0.12),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }

  // ─── Dropdown ────────────────────────────────────────────────────────

  static Widget _renderDropdown(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final value = p['value'] as String?;
    final placeholder = (p['placeholder'] as String?) ?? 'Select...';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(label, style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
          ],
          Container(
            width: double.infinity,
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.3),
              ),
              color: theme.colorScheme.surface,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value ?? placeholder,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: value != null
                          ? theme.colorScheme.onSurface
                          : theme.colorScheme.outline,
                    ),
                  ),
                ),
                Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 22,
                  color: theme.colorScheme.outline,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Date Picker ─────────────────────────────────────────────────────

  static Widget _renderDatePicker(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final value = p['value'] as String?;
    final placeholder = (p['placeholder'] as String?) ?? 'Select date...';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(label, style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
          ],
          Container(
            width: double.infinity,
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.3),
              ),
              color: theme.colorScheme.surface,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value ?? placeholder,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: value != null
                          ? theme.colorScheme.onSurface
                          : theme.colorScheme.outline,
                    ),
                  ),
                ),
                Icon(
                  Icons.calendar_today_outlined,
                  size: 20,
                  color: theme.colorScheme.outline,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Checkbox ────────────────────────────────────────────────────────

  static Widget _renderCheckbox(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final items = _listItems(p['items'] ?? p['options']);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(label, style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
          ],
          ...items.map((item) {
            final itemLabel = (item['label'] as String?) ?? '';
            final checked = (item['checked'] as bool?) ?? false;
            final description = item['description'] as String?;

            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Icon(
                      checked
                          ? Icons.check_box_rounded
                          : Icons.check_box_outline_blank_rounded,
                      size: 22,
                      color: checked
                          ? theme.colorScheme.primary
                          : theme.colorScheme.outline,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          itemLabel,
                          style: theme.textTheme.bodyMedium,
                        ),
                        if (description != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              description,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.outline,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // ─── Radio Group ─────────────────────────────────────────────────────

  static Widget _renderRadioGroup(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final items = _listItems(p['items'] ?? p['options']);
    final selectedIndex = (p['selectedIndex'] as num?)?.toInt() ?? -1;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(label, style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
          ],
          ...items.asMap().entries.map((entry) {
            final i = entry.key;
            final item = entry.value;
            final itemLabel = (item['label'] as String?) ?? '';
            final description = item['description'] as String?;
            final selected = i == selectedIndex;

            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Icon(
                      selected
                          ? Icons.radio_button_checked_rounded
                          : Icons.radio_button_off_rounded,
                      size: 22,
                      color: selected
                          ? theme.colorScheme.primary
                          : theme.colorScheme.outline,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          itemLabel,
                          style: theme.textTheme.bodyMedium,
                        ),
                        if (description != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              description,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.outline,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // ─── Textarea ────────────────────────────────────────────────────────

  static Widget _renderTextarea(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final label = p['label'] as String?;
    final value = p['value'] as String?;
    final placeholder = (p['placeholder'] as String?) ?? '';
    final helper = p['helper'] as String?;
    final maxLength = (p['maxLength'] as num?)?.toInt();
    final rows = (p['rows'] as num?)?.toInt() ?? 4;

    final currentLength = (value ?? '').length;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(label, style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
          ],
          Container(
            width: double.infinity,
            constraints: BoxConstraints(
              minHeight: (rows * 22.0) + 24, // approximate line height
            ),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.3),
              ),
              color: theme.colorScheme.surface,
            ),
            child: Align(
              alignment: Alignment.topLeft,
              child: Text(
                (value != null && value.isNotEmpty) ? value : placeholder,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: (value != null && value.isNotEmpty)
                      ? theme.colorScheme.onSurface
                      : theme.colorScheme.outline,
                  height: 1.5,
                ),
              ),
            ),
          ),
          // Footer: helper + character count
          if (helper != null || maxLength != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  if (helper != null)
                    Expanded(
                      child: Text(
                        helper,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.outline,
                        ),
                      ),
                    ),
                  if (maxLength != null)
                    Text(
                      '$currentLength/$maxLength',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.outline,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ─── Swipe Card ──────────────────────────────────────────────────────

  static Widget _renderSwipeCard(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final extras = _extras(context);

    // Accept two schema shapes:
    //   1. Legacy: { title, subtitle, badge, imagePrompt, cardCount }
    //   2. New (AI emits this): { cards: [{ title, subtitle, badge, prompt|image, color }, ...] }
    final cardsList = (p['cards'] is List)
        ? (p['cards'] as List).whereType<Map<String, dynamic>>().toList()
        : const <Map<String, dynamic>>[];
    final hasCardArray = cardsList.isNotEmpty;

    // Top card is the first in the AI-emitted array, else fall back to top-level props.
    final topCard = hasCardArray ? cardsList.first : const <String, dynamic>{};
    final title = (topCard['title'] as String?) ??
        (p['title'] as String?) ??
        'Card Title';
    final subtitle =
        (topCard['subtitle'] as String?) ?? (p['subtitle'] as String?);
    final badge = (topCard['badge'] as String?) ?? (p['badge'] as String?);
    final imagePrompt = (topCard['prompt'] as String?) ??
        (topCard['image'] as String?) ??
        (p['imagePrompt'] as String?) ??
        'Photo';
    final cardCount = hasCardArray
        ? cardsList.length.clamp(2, 4)
        : (p['cardCount'] as num?)?.toInt().clamp(2, 4) ?? 3;

    // Build the stacked cards (bottom to top).
    final cards = <Widget>[];

    for (int i = cardCount - 1; i >= 0; i--) {
      final isTop = i == 0;
      final angle = i * 3.0 * (i.isEven ? 1 : -1); // slight alternating rotation
      final yOffset = i * 8.0;
      final opacity = isTop ? 1.0 : (1.0 - i * 0.15).clamp(0.4, 1.0);

      cards.add(
        Transform.translate(
          offset: Offset(0, -yOffset),
          child: Transform.rotate(
            angle: angle * 3.14159 / 180,
            child: Opacity(
              opacity: opacity,
              child: Container(
                width: 260,
                height: 340,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.10 + i * 0.02),
                      blurRadius: 16 - i * 2,
                      offset: Offset(0, 6 + i * 2),
                    ),
                  ],
                  color: theme.colorScheme.surface,
                ),
                child: isTop
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Image placeholder
                          Container(
                            height: 200,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(16),
                              ),
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  theme.colorScheme.primary
                                      .withValues(alpha: 0.25),
                                  theme.colorScheme.secondary
                                      .withValues(alpha: 0.15),
                                  theme.colorScheme.tertiary
                                      .withValues(alpha: 0.20),
                                ],
                              ),
                            ),
                            child: Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.image_outlined,
                                      size: 36,
                                      color: theme.colorScheme.primary
                                          .withValues(alpha: 0.5)),
                                  const SizedBox(height: 6),
                                  Text(
                                    imagePrompt,
                                    style:
                                        theme.textTheme.bodySmall?.copyWith(
                                      color: theme.colorScheme.primary
                                          .withValues(alpha: 0.6),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        title,
                                        style: theme.textTheme.titleMedium
                                            ?.copyWith(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    if (badge != null)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 3,
                                        ),
                                        decoration: BoxDecoration(
                                          color: theme.colorScheme.primary
                                              .withValues(alpha: 0.12),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          badge,
                                          style: theme.textTheme.labelSmall
                                              ?.copyWith(
                                            color:
                                                theme.colorScheme.primary,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                if (subtitle != null) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    subtitle,
                                    style:
                                        theme.textTheme.bodySmall?.copyWith(
                                      color: theme.colorScheme.outline,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      )
                    : null, // background cards are blank
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        children: [
          SizedBox(
            height: 360,
            child: Center(
              child: Stack(
                alignment: Alignment.center,
                children: cards,
              ),
            ),
          ),
          const SizedBox(height: 16),
          // Action buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Reject button
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (extras?.danger ?? Colors.red).withValues(alpha: 0.1),
                  border: Border.all(
                    color:
                        (extras?.danger ?? Colors.red).withValues(alpha: 0.3),
                    width: 2,
                  ),
                ),
                child: Icon(
                  Icons.close_rounded,
                  color: extras?.danger ?? Colors.red,
                  size: 28,
                ),
              ),
              const SizedBox(width: 32),
              // Accept button
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color:
                      (extras?.success ?? Colors.green).withValues(alpha: 0.1),
                  border: Border.all(
                    color: (extras?.success ?? Colors.green)
                        .withValues(alpha: 0.3),
                    width: 2,
                  ),
                ),
                child: Icon(
                  Icons.check_rounded,
                  color: extras?.success ?? Colors.green,
                  size: 28,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ─── Calendar Strip ─────────────────────────────────────────────────

  static Widget _renderCalendarStrip(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final selectedIndex = (p['selectedIndex'] as num?)?.toInt() ?? 0;
    final showHeader = (p['showHeader'] as bool?) ?? true;
    final markedIndices = <int>{};
    final rawMarked = p['markedDates'] as List?;
    if (rawMarked != null) {
      for (final m in rawMarked) {
        if (m is num) markedIndices.add(m.toInt());
      }
    }

    // Use current week starting from Monday.
    final now = DateTime.now();
    final mondayOffset = now.weekday - 1; // Monday = 1
    final monday = now.subtract(Duration(days: mondayOffset));

    const dayAbbr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Optional month/year header
    final months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showHeader)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                '${months[monday.month - 1]} ${monday.year}',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(7, (i) {
              final day = monday.add(Duration(days: i));
              final isSelected = i == selectedIndex;
              final isMarked = markedIndices.contains(i);
              final isToday = day.year == now.year &&
                  day.month == now.month &&
                  day.day == now.day;

              return Expanded(
                child: Column(
                  children: [
                    Text(
                      dayAbbr[i],
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: isSelected
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outline,
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isSelected
                            ? theme.colorScheme.primary
                            : Colors.transparent,
                        border: isToday && !isSelected
                            ? Border.all(
                                color: theme.colorScheme.primary
                                    .withValues(alpha: 0.4),
                                width: 1.5,
                              )
                            : null,
                      ),
                      child: Center(
                        child: Text(
                          '${day.day}',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: isSelected
                                ? theme.colorScheme.onPrimary
                                : theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Marked-date dot
                    Container(
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isMarked
                            ? theme.colorScheme.primary
                            : Colors.transparent,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  // ─── Bank Card ──────────────────────────────────────────────────────

  static Widget _renderBankCard(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final bankName = (p['bankName'] as String?) ?? 'Bank';
    final holderName = (p['holderName'] as String?) ?? 'CARD HOLDER';
    final lastFour = (p['lastFour'] as String?) ?? '4242';
    final expiry = (p['expiry'] as String?) ?? '12/28';
    final network = (p['network'] as String?) ?? 'VISA';
    final gradientColors = p['gradientColors'] as List?;

    // Default premium gradient
    List<Color> bgColors;
    if (gradientColors != null && gradientColors.length >= 2) {
      bgColors = gradientColors
          .map((c) => _hexToColor(c as String?, theme.colorScheme.primary))
          .toList();
    } else {
      bgColors = [
        const Color(0xFF1A1A2E),
        const Color(0xFF16213E),
        const Color(0xFF0F3460),
      ];
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: AspectRatio(
        aspectRatio: 1.6,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: bgColors,
            ),
            boxShadow: [
              BoxShadow(
                color: bgColors.first.withValues(alpha: 0.4),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top row: bank name + network
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      bankName,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                    Text(
                      network,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                // Chip icon placeholder
                Container(
                  width: 40,
                  height: 28,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(4),
                    gradient: LinearGradient(
                      colors: [
                        Colors.amber.shade300,
                        Colors.amber.shade600,
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Card number
                Text(
                  '••••  ••••  ••••  $lastFour',
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 3,
                  ),
                ),
                const Spacer(),
                // Bottom row: holder name + expiry
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'CARD HOLDER',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: Colors.white.withValues(alpha: 0.5),
                            letterSpacing: 1,
                            fontSize: 9,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          holderName.toUpperCase(),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.5,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'EXPIRES',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: Colors.white.withValues(alpha: 0.5),
                            letterSpacing: 1,
                            fontSize: 9,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          expiry,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ─── Radar Chart ────────────────────────────────────────────────────

  static Widget _renderRadarChart(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final rawAxes = _listItems(p['axes'] ?? p['items']);
    final size = (p['size'] as num?)?.toDouble() ?? 200;
    final fillColorHex = p['fillColor'] as String?;
    final strokeColorHex = p['strokeColor'] as String?;

    final axes = rawAxes.map((a) => RadarAxis.fromJson(a)).toList();

    // If no axes provided, show a demo with default data.
    if (axes.isEmpty) {
      const demoLabels = ['Speed', 'Power', 'Range', 'Defense', 'Agility'];
      const demoValues = [0.8, 0.65, 0.9, 0.5, 0.75];
      for (int i = 0; i < demoLabels.length; i++) {
        axes.add(RadarAxis(label: demoLabels[i], value: demoValues[i]));
      }
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: RadarChartWidget(
          axes: axes,
          size: size,
          fillColor: fillColorHex != null
              ? _hexToColor(fillColorHex, theme.colorScheme.primary.withValues(alpha: 0.2))
              : null,
          strokeColor: strokeColorHex != null
              ? _hexToColor(strokeColorHex, theme.colorScheme.primary)
              : null,
        ),
      ),
    );
  }

  // ─── Gauge Chart ────────────────────────────────────────────────────

  static Widget _renderGaugeChart(
      BuildContext context, Map<String, dynamic> p) {
    final theme = Theme.of(context);
    final value = (p['value'] as num?)?.toDouble() ?? 0;
    final max = (p['max'] as num?)?.toDouble() ?? 100;
    final label = p['label'] as String?;
    final unit = p['unit'] as String?;
    final size = (p['size'] as num?)?.toDouble() ?? 180;
    final strokeWidth = (p['strokeWidth'] as num?)?.toDouble() ?? 16;

    // Parse optional thresholds
    List<GaugeThreshold>? thresholds;
    final rawThresholds = p['thresholds'] as List?;
    if (rawThresholds != null) {
      thresholds = rawThresholds
          .whereType<Map<String, dynamic>>()
          .map((t) =>
              GaugeThreshold.fromJson(t, theme.colorScheme.primary))
          .toList();
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: GaugeChartWidget(
          value: value,
          max: max,
          label: label,
          unit: unit,
          size: size,
          strokeWidth: strokeWidth,
          thresholds: thresholds,
        ),
      ),
    );
  }

  // ─── Apply Element Style Wrapper ─────────────────────────────────────

  /// Reads an optional `style` map from the element JSON and wraps
  /// [child] in a styled [Container] / [Opacity] accordingly.
  static const _sizeTokens = <String, double>{
    'none': 0,
    'xs': 4,
    'sm': 8,
    'md': 12,
    'lg': 16,
    'xl': 24,
  };

  static Widget _applyElementStyle(
      Widget child, Map<String, dynamic> element) {
    final style = element['style'] as Map<String, dynamic>?;

    // Handle margin from element root
    final marginToken = element['margin'] as String?;
    final marginValue = _sizeTokens[marginToken];

    if (style == null && marginValue == null) return child;

    Widget result = child;

    if (marginValue != null && marginValue > 0) {
      result = Padding(
        padding: EdgeInsets.all(marginValue),
        child: result,
      );
    }

    if (style == null) return result;

    // Parse individual style properties.
    final bgColor = style['backgroundColor'] as String?;
    final gradientRaw = style['gradient'] as Map<String, dynamic>?;
    final borderRadiusRaw = (style['borderRadius'] as num?)?.toDouble();
    final shadowRaw = style['shadow'] as Map<String, dynamic>?;
    final paddingRaw = style['padding'] as num?;
    final opacityRaw = (style['opacity'] as num?)?.toDouble();

    // Build decoration.
    BoxDecoration? decoration;
    final hasDecoration = bgColor != null ||
        gradientRaw != null ||
        borderRadiusRaw != null ||
        shadowRaw != null;

    if (hasDecoration) {
      Gradient? gradient;
      if (gradientRaw != null) {
        final rawColors = gradientRaw['colors'] as List?;
        if (rawColors != null && rawColors.length >= 2) {
          final gColors = rawColors
              .map((c) => _hexToColor(c as String?, Colors.transparent))
              .toList();
          gradient = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gColors,
          );
        }
      }

      BoxShadow? shadow;
      if (shadowRaw != null) {
        shadow = BoxShadow(
          color: _hexToColor(
            shadowRaw['color'] as String?,
            Colors.black.withValues(alpha: 0.1),
          ),
          blurRadius: (shadowRaw['blur'] as num?)?.toDouble() ?? 10,
          offset: Offset(
            (shadowRaw['x'] as num?)?.toDouble() ?? 0,
            (shadowRaw['y'] as num?)?.toDouble() ?? 4,
          ),
        );
      }

      decoration = BoxDecoration(
        color: gradient == null
            ? (bgColor != null
                ? _hexToColor(bgColor, Colors.transparent)
                : null)
            : null,
        gradient: gradient,
        borderRadius: borderRadiusRaw != null
            ? BorderRadius.circular(borderRadiusRaw)
            : null,
        boxShadow: shadow != null ? [shadow] : null,
      );
    }

    // result is already wrapped with margin if needed above.

    if (hasDecoration || paddingRaw != null) {
      result = Container(
        decoration: decoration,
        padding: paddingRaw != null
            ? EdgeInsets.all(paddingRaw.toDouble())
            : null,
        child: result,
      );
    }

    if (opacityRaw != null) {
      result = Opacity(
        opacity: opacityRaw.clamp(0.0, 1.0),
        child: result,
      );
    }

    // ── Action support: wrap in InkWell for tap feedback ──
    final actionRaw = element['action'] as Map<String, dynamic>?;
    if (actionRaw != null) {
      final actionType = actionRaw['type'] as String?;
      result = Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () {},
          child: result,
        ),
      );
    }

    return result;
  }

  // ─── Unknown Type Fallback ───────────────────────────────────────────

  static Widget _unknown(BuildContext context, String type) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        color: theme.colorScheme.outline.withValues(alpha: 0.05),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.15),
          style: BorderStyle.solid,
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.help_outline, size: 16, color: theme.colorScheme.outline),
          const SizedBox(width: 8),
          Text(
            'Unknown element: $type',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}
