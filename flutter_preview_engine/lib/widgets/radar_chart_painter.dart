import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Data model for a single axis on the radar chart.
class RadarAxis {
  const RadarAxis({required this.label, required this.value});

  final String label;

  /// Normalized value between 0.0 and 1.0.
  final double value;

  factory RadarAxis.fromJson(Map<String, dynamic> json) {
    return RadarAxis(
      label: (json['label'] as String?) ?? '',
      value: (json['value'] as num?)?.toDouble().clamp(0.0, 1.0) ?? 0.0,
    );
  }
}

/// Custom painter for a spider / radar chart.
///
/// Draws concentric polygon rings, axis lines from center, and a filled
/// polygon connecting the data values.
class RadarChartPainter extends CustomPainter {
  RadarChartPainter({
    required this.axes,
    required this.fillColor,
    required this.strokeColor,
    required this.gridColor,
    required this.axisColor,
    this.gridLevels = 4,
  });

  final List<RadarAxis> axes;
  final Color fillColor;
  final Color strokeColor;
  final Color gridColor;
  final Color axisColor;
  final int gridLevels;

  @override
  void paint(Canvas canvas, Size size) {
    if (axes.isEmpty) return;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 * 0.72;
    final count = axes.length;
    final angleStep = 2 * math.pi / count;

    // ── Draw concentric polygon rings ──
    final gridPaint = Paint()
      ..color = gridColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    for (int level = 1; level <= gridLevels; level++) {
      final r = radius * level / gridLevels;
      final path = Path();
      for (int i = 0; i <= count; i++) {
        final angle = -math.pi / 2 + angleStep * (i % count);
        final point = Offset(
          center.dx + r * math.cos(angle),
          center.dy + r * math.sin(angle),
        );
        if (i == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }
      path.close();
      canvas.drawPath(path, gridPaint);
    }

    // ── Draw axis lines from center to each vertex ──
    final axisPaint = Paint()
      ..color = axisColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    for (int i = 0; i < count; i++) {
      final angle = -math.pi / 2 + angleStep * i;
      final endpoint = Offset(
        center.dx + radius * math.cos(angle),
        center.dy + radius * math.sin(angle),
      );
      canvas.drawLine(center, endpoint, axisPaint);
    }

    // ── Draw filled data polygon ──
    final dataPath = Path();
    for (int i = 0; i <= count; i++) {
      final idx = i % count;
      final angle = -math.pi / 2 + angleStep * idx;
      final r = radius * axes[idx].value;
      final point = Offset(
        center.dx + r * math.cos(angle),
        center.dy + r * math.sin(angle),
      );
      if (i == 0) {
        dataPath.moveTo(point.dx, point.dy);
      } else {
        dataPath.lineTo(point.dx, point.dy);
      }
    }
    dataPath.close();

    // Fill
    final fillPaint = Paint()
      ..color = fillColor
      ..style = PaintingStyle.fill;
    canvas.drawPath(dataPath, fillPaint);

    // Stroke
    final dataPaint = Paint()
      ..color = strokeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawPath(dataPath, dataPaint);

    // ── Draw data point dots ──
    final dotPaint = Paint()
      ..color = strokeColor
      ..style = PaintingStyle.fill;
    for (int i = 0; i < count; i++) {
      final angle = -math.pi / 2 + angleStep * i;
      final r = radius * axes[i].value;
      final point = Offset(
        center.dx + r * math.cos(angle),
        center.dy + r * math.sin(angle),
      );
      canvas.drawCircle(point, 3.5, dotPaint);
    }
  }

  @override
  bool shouldRepaint(RadarChartPainter oldDelegate) {
    return axes != oldDelegate.axes ||
        fillColor != oldDelegate.fillColor ||
        strokeColor != oldDelegate.strokeColor;
  }
}

/// A ready-to-use radar chart widget with axis labels around the chart.
class RadarChartWidget extends StatelessWidget {
  const RadarChartWidget({
    super.key,
    required this.axes,
    this.size = 200,
    this.fillColor,
    this.strokeColor,
  });

  final List<RadarAxis> axes;
  final double size;
  final Color? fillColor;
  final Color? strokeColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final muted = theme.colorScheme.outline.withValues(alpha: 0.15);
    final axisLine = theme.colorScheme.outline.withValues(alpha: 0.25);
    final fill = fillColor ?? primary.withValues(alpha: 0.2);
    final stroke = strokeColor ?? primary;

    // Extra padding for labels
    const labelPad = 36.0;
    final totalSize = size + labelPad * 2;

    return SizedBox(
      width: totalSize,
      height: totalSize,
      child: Stack(
        children: [
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(labelPad),
              child: CustomPaint(
                size: Size(size, size),
                painter: RadarChartPainter(
                  axes: axes,
                  fillColor: fill,
                  strokeColor: stroke,
                  gridColor: muted,
                  axisColor: axisLine,
                ),
              ),
            ),
          ),
          // Labels
          ..._buildLabels(theme),
        ],
      ),
    );
  }

  List<Widget> _buildLabels(ThemeData theme) {
    if (axes.isEmpty) return [];
    final count = axes.length;
    final angleStep = 2 * math.pi / count;
    const labelPad = 36.0;
    final center = (size + labelPad * 2) / 2;
    final labelRadius = size / 2 * 0.72 + 18;

    return List.generate(count, (i) {
      final angle = -math.pi / 2 + angleStep * i;
      final x = center + labelRadius * math.cos(angle);
      final y = center + labelRadius * math.sin(angle);

      return Positioned(
        left: x - 30,
        top: y - 8,
        child: SizedBox(
          width: 60,
          child: Text(
            axes[i].label,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 10,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      );
    });
  }
}
