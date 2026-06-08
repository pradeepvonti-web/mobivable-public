import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Data model for a single series in the line chart.
class LineChartSeries {
  const LineChartSeries({
    required this.data,
    required this.color,
    this.label,
  });

  final List<double> data;
  final Color color;
  final String? label;

  factory LineChartSeries.fromJson(
      Map<String, dynamic> json, Color fallbackColor) {
    final rawData = json['data'];
    final data = <double>[];
    if (rawData is List) {
      for (final v in rawData) {
        data.add((v as num?)?.toDouble() ?? 0);
      }
    }
    return LineChartSeries(
      data: data,
      color: json['color'] != null
          ? _hexToColor(json['color'] as String, fallbackColor)
          : fallbackColor,
      label: json['label'] as String?,
    );
  }

  static Color _hexToColor(String hex, Color fallback) {
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

/// CustomPainter that renders a multi-series line chart with optional
/// gradient fill, data-point dots, grid lines, and smooth bezier curves.
class LineChartPainter extends CustomPainter {
  LineChartPainter({
    required this.series,
    this.labels = const [],
    this.fill = true,
    this.showDots = true,
    this.showGrid = true,
    this.labelStyle,
    this.gridColor,
  });

  final List<LineChartSeries> series;
  final List<String> labels;
  final bool fill;
  final bool showDots;
  final bool showGrid;
  final TextStyle? labelStyle;
  final Color? gridColor;

  static const double _labelAreaHeight = 24.0;
  static const double _leftPadding = 0.0;
  static const double _topPadding = 8.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (series.isEmpty) return;

    final chartHeight = size.height - _labelAreaHeight - _topPadding;
    final chartWidth = size.width - _leftPadding;
    if (chartHeight <= 0 || chartWidth <= 0) return;

    // Find global min / max across all series.
    double globalMin = double.infinity;
    double globalMax = double.negativeInfinity;
    int maxLength = 0;
    for (final s in series) {
      if (s.data.isEmpty) continue;
      for (final v in s.data) {
        globalMin = math.min(globalMin, v);
        globalMax = math.max(globalMax, v);
      }
      maxLength = math.max(maxLength, s.data.length);
    }
    if (maxLength < 2) return;
    if (globalMax == globalMin) {
      globalMax = globalMin + 1; // avoid division by zero
    }

    // Draw grid lines.
    if (showGrid) {
      final gridPaint = Paint()
        ..color = gridColor ?? Colors.grey.withValues(alpha: 0.15)
        ..strokeWidth = 0.5;
      const gridRows = 4;
      for (var i = 0; i <= gridRows; i++) {
        final y = _topPadding + chartHeight * i / gridRows;
        canvas.drawLine(
          Offset(_leftPadding, y),
          Offset(size.width, y),
          gridPaint,
        );
      }
    }

    // Draw each series.
    for (final s in series) {
      if (s.data.length < 2) continue;

      final points = <Offset>[];
      for (var i = 0; i < s.data.length; i++) {
        final x =
            _leftPadding + (i / (s.data.length - 1)) * chartWidth;
        final normalized = (s.data[i] - globalMin) / (globalMax - globalMin);
        final y = _topPadding + chartHeight * (1 - normalized);
        points.add(Offset(x, y));
      }

      // Build bezier path.
      final path = Path()..moveTo(points[0].dx, points[0].dy);
      for (var i = 0; i < points.length - 1; i++) {
        final cp1x = points[i].dx + (points[i + 1].dx - points[i].dx) / 3;
        final cp1y = points[i].dy;
        final cp2x =
            points[i + 1].dx - (points[i + 1].dx - points[i].dx) / 3;
        final cp2y = points[i + 1].dy;
        path.cubicTo(cp1x, cp1y, cp2x, cp2y, points[i + 1].dx,
            points[i + 1].dy);
      }

      // Draw gradient fill below the curve.
      if (fill) {
        final fillPath = Path.from(path)
          ..lineTo(points.last.dx, _topPadding + chartHeight)
          ..lineTo(points.first.dx, _topPadding + chartHeight)
          ..close();

        final fillPaint = Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              s.color.withValues(alpha: 0.35),
              s.color.withValues(alpha: 0.0),
            ],
          ).createShader(
            Rect.fromLTWH(
                _leftPadding, _topPadding, chartWidth, chartHeight),
          );

        canvas.drawPath(fillPath, fillPaint);
      }

      // Draw line.
      final linePaint = Paint()
        ..color = s.color
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      canvas.drawPath(path, linePaint);

      // Draw dots at data points.
      if (showDots) {
        final dotPaintOuter = Paint()..color = s.color;
        final dotPaintInner = Paint()..color = Colors.white;
        for (final pt in points) {
          canvas.drawCircle(pt, 4, dotPaintOuter);
          canvas.drawCircle(pt, 2, dotPaintInner);
        }
      }
    }

    // Draw x-axis labels.
    if (labels.isNotEmpty) {
      final effectiveLabelStyle = labelStyle ??
          TextStyle(
            color: Colors.grey.shade500,
            fontSize: 10,
            fontWeight: FontWeight.w500,
          );

      final labelCount = labels.length;
      for (var i = 0; i < labelCount; i++) {
        final x = _leftPadding +
            (labelCount > 1 ? (i / (labelCount - 1)) * chartWidth : 0);
        final tp = TextPainter(
          text: TextSpan(text: labels[i], style: effectiveLabelStyle),
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.center,
        )..layout();
        tp.paint(
          canvas,
          Offset(x - tp.width / 2, _topPadding + chartHeight + 6),
        );
      }
    }
  }

  @override
  bool shouldRepaint(LineChartPainter oldDelegate) {
    return series != oldDelegate.series ||
        labels != oldDelegate.labels ||
        fill != oldDelegate.fill ||
        showDots != oldDelegate.showDots ||
        showGrid != oldDelegate.showGrid;
  }
}

/// A ready-to-use line chart widget wrapping [LineChartPainter].
class LineChartWidget extends StatelessWidget {
  const LineChartWidget({
    super.key,
    required this.series,
    this.labels = const [],
    this.height = 200,
    this.fill = true,
    this.showDots = true,
    this.showGrid = true,
  });

  final List<LineChartSeries> series;
  final List<String> labels;
  final double height;
  final bool fill;
  final bool showDots;
  final bool showGrid;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: height,
      child: CustomPaint(
        painter: LineChartPainter(
          series: series,
          labels: labels,
          fill: fill,
          showDots: showDots,
          showGrid: showGrid,
        ),
      ),
    );
  }
}
