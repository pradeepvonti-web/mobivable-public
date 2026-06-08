import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Custom painter for a semicircular gauge chart.
///
/// Draws a 180° arc background and a colored foreground arc proportional
/// to [value] / [max].
class GaugeChartPainter extends CustomPainter {
  GaugeChartPainter({
    required this.value,
    required this.max,
    required this.foregroundColor,
    required this.backgroundColor,
    this.strokeWidth = 16.0,
    this.thresholds,
  });

  final double value;
  final double max;
  final Color foregroundColor;
  final Color backgroundColor;
  final double strokeWidth;

  /// Optional threshold bands: list of (threshold 0..1, color).
  /// The gauge fill color changes based on where the value falls.
  final List<GaugeThreshold>? thresholds;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height);
    final radius = math.min(size.width / 2, size.height) - strokeWidth / 2;

    if (radius <= 0) return;

    final rect = Rect.fromCircle(center: center, radius: radius);
    const startAngle = math.pi; // left side (180°)
    const sweepAngle = math.pi; // 180° arc

    // ── Background arc ──
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(rect, startAngle, sweepAngle, false, bgPaint);

    // ── Foreground arc ──
    final progress = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    if (progress > 0) {
      // Determine fill color from thresholds if available.
      Color fillColor = foregroundColor;
      if (thresholds != null && thresholds!.isNotEmpty) {
        for (final threshold in thresholds!) {
          if (progress <= threshold.upTo) {
            fillColor = threshold.color;
            break;
          }
        }
      }

      final fgPaint = Paint()
        ..color = fillColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;

      canvas.drawArc(rect, startAngle, sweepAngle * progress, false, fgPaint);
    }
  }

  @override
  bool shouldRepaint(GaugeChartPainter oldDelegate) {
    return value != oldDelegate.value ||
        max != oldDelegate.max ||
        foregroundColor != oldDelegate.foregroundColor;
  }
}

/// Threshold band for the gauge chart.
class GaugeThreshold {
  const GaugeThreshold({required this.upTo, required this.color});

  /// Upper bound for this band (normalized 0..1).
  final double upTo;
  final Color color;

  factory GaugeThreshold.fromJson(Map<String, dynamic> json, Color fallback) {
    return GaugeThreshold(
      upTo: (json['upTo'] as num?)?.toDouble() ?? 1.0,
      color: _parseColor(json['color'] as String?, fallback),
    );
  }

  static Color _parseColor(String? hex, Color fallback) {
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
}

/// A ready-to-use semicircular gauge widget with center value text.
class GaugeChartWidget extends StatelessWidget {
  const GaugeChartWidget({
    super.key,
    required this.value,
    required this.max,
    this.label,
    this.unit,
    this.size = 180,
    this.strokeWidth = 16,
    this.thresholds,
  });

  final double value;
  final double max;
  final String? label;
  final String? unit;
  final double size;
  final double strokeWidth;
  final List<GaugeThreshold>? thresholds;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final muted = theme.colorScheme.outline.withValues(alpha: 0.2);

    // The canvas height is half the width + strokeWidth (semicircle)
    final paintHeight = size / 2 + strokeWidth;

    return SizedBox(
      width: size,
      height: paintHeight + 28, // extra space for labels below
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          CustomPaint(
            size: Size(size, paintHeight),
            painter: GaugeChartPainter(
              value: value,
              max: max,
              foregroundColor: primary,
              backgroundColor: muted,
              strokeWidth: strokeWidth,
              thresholds: thresholds,
            ),
          ),
          // Value text centered inside the arc
          Positioned(
            bottom: 28,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  unit != null
                      ? '${value.toStringAsFixed(value.truncateToDouble() == value ? 0 : 1)}$unit'
                      : value.toStringAsFixed(
                          value.truncateToDouble() == value ? 0 : 1),
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (label != null)
                  Text(
                    label!,
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
}
