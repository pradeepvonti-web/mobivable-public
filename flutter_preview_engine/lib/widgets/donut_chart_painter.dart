import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Custom painter for rendering a donut (ring) chart with arc segments.
///
/// Each segment is drawn as an arc with its own color. The chart has a
/// configurable hole in the center where a value + label can be displayed.
class DonutChartPainter extends CustomPainter {
  DonutChartPainter({
    required this.segments,
    this.strokeWidth = 24.0,
    this.gapAngle = 0.04,
  });

  /// List of segments: `{ "value": num, "color": Color, "label": String? }`.
  final List<DonutSegment> segments;

  /// Width of the donut ring.
  final double strokeWidth;

  /// Small gap (in radians) between each segment for visual separation.
  final double gapAngle;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (math.min(size.width, size.height) / 2) - strokeWidth / 2;

    if (segments.isEmpty || radius <= 0) return;

    final total = segments.fold<double>(0, (sum, s) => sum + s.value);
    if (total <= 0) return;

    final totalGap = gapAngle * segments.length;
    final availableAngle = 2 * math.pi - totalGap;

    var startAngle = -math.pi / 2; // Start from top

    for (final segment in segments) {
      final sweepAngle = (segment.value / total) * availableAngle;

      final paint = Paint()
        ..color = segment.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;

      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweepAngle,
        false,
        paint,
      );

      startAngle += sweepAngle + gapAngle;
    }
  }

  @override
  bool shouldRepaint(DonutChartPainter oldDelegate) {
    return segments != oldDelegate.segments ||
        strokeWidth != oldDelegate.strokeWidth;
  }
}

/// A single segment in a donut chart.
class DonutSegment {
  const DonutSegment({
    required this.value,
    required this.color,
    this.label,
  });

  final double value;
  final Color color;
  final String? label;

  /// Creates a [DonutSegment] from a JSON map.
  factory DonutSegment.fromJson(Map<String, dynamic> json, Color fallbackColor) {
    return DonutSegment(
      value: (json['value'] as num?)?.toDouble() ?? 0,
      color: json['color'] != null ? _hexToColor(json['color'] as String) : fallbackColor,
      label: json['label'] as String?,
    );
  }

  static Color _hexToColor(String hex) {
    var h = hex.replaceFirst('#', '');
    if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
    if (h.length == 6) h = 'FF$h';
    return Color(int.parse(h, radix: 16));
  }
}

/// A ready-to-use donut chart widget.
///
/// Renders the arcs via [DonutChartPainter] and overlays a centered
/// value + label.
class DonutChartWidget extends StatelessWidget {
  const DonutChartWidget({
    super.key,
    required this.segments,
    this.centerValue,
    this.centerLabel,
    this.size = 160,
    this.strokeWidth = 20,
  });

  final List<DonutSegment> segments;
  final String? centerValue;
  final String? centerLabel;
  final double size;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(size, size),
            painter: DonutChartPainter(
              segments: segments,
              strokeWidth: strokeWidth,
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (centerValue != null)
                Text(
                  centerValue!,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              if (centerLabel != null)
                Text(
                  centerLabel!,
                  style: theme.textTheme.bodySmall,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
