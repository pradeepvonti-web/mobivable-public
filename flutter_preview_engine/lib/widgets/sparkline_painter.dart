import 'dart:math' as math;
import 'package:flutter/material.dart';

/// A compact CustomPainter for rendering inline sparkline charts.
///
/// Designed for use inside stat cards and small containers.
/// Draws a smooth bezier curve with optional gradient fill and
/// a last-dot indicator.
class SparklinePainter extends CustomPainter {
  SparklinePainter({
    required this.data,
    required this.color,
    this.fill = true,
    this.showLastDot = true,
    this.strokeWidth = 2.0,
  });

  final List<double> data;
  final Color color;
  final bool fill;
  final bool showLastDot;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    if (data.length < 2) return;

    final minVal = data.reduce(math.min);
    final maxVal = data.reduce(math.max);
    final range = maxVal - minVal;
    final effectiveRange = range == 0 ? 1.0 : range;

    // Tiny vertical padding so dots aren't clipped.
    const vPad = 4.0;
    final chartH = size.height - vPad * 2;
    final chartW = size.width;

    final points = <Offset>[];
    for (var i = 0; i < data.length; i++) {
      final x = (i / (data.length - 1)) * chartW;
      final normalized = (data[i] - minVal) / effectiveRange;
      final y = vPad + chartH * (1 - normalized);
      points.add(Offset(x, y));
    }

    // Build smooth bezier path.
    final path = Path()..moveTo(points[0].dx, points[0].dy);
    for (var i = 0; i < points.length - 1; i++) {
      final cpX1 = points[i].dx + (points[i + 1].dx - points[i].dx) / 3;
      final cpY1 = points[i].dy;
      final cpX2 =
          points[i + 1].dx - (points[i + 1].dx - points[i].dx) / 3;
      final cpY2 = points[i + 1].dy;
      path.cubicTo(
          cpX1, cpY1, cpX2, cpY2, points[i + 1].dx, points[i + 1].dy);
    }

    // Draw gradient fill.
    if (fill) {
      final fillPath = Path.from(path)
        ..lineTo(points.last.dx, size.height)
        ..lineTo(points.first.dx, size.height)
        ..close();

      final fillPaint = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            color.withValues(alpha: 0.3),
            color.withValues(alpha: 0.0),
          ],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

      canvas.drawPath(fillPath, fillPaint);
    }

    // Draw line.
    final linePaint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path, linePaint);

    // Draw last-dot indicator.
    if (showLastDot && points.isNotEmpty) {
      final last = points.last;
      final outerDot = Paint()..color = color;
      final innerDot = Paint()..color = Colors.white;
      canvas.drawCircle(last, 4, outerDot);
      canvas.drawCircle(last, 2, innerDot);
    }
  }

  @override
  bool shouldRepaint(SparklinePainter oldDelegate) {
    return data != oldDelegate.data ||
        color != oldDelegate.color ||
        fill != oldDelegate.fill ||
        showLastDot != oldDelegate.showLastDot;
  }
}

/// A ready-to-use sparkline widget wrapping [SparklinePainter].
class SparklineWidget extends StatelessWidget {
  const SparklineWidget({
    super.key,
    required this.data,
    required this.color,
    this.height = 40,
    this.width,
    this.fill = true,
    this.showLastDot = true,
  });

  final List<double> data;
  final Color color;
  final double height;
  final double? width;
  final bool fill;
  final bool showLastDot;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width ?? double.infinity,
      height: height,
      child: CustomPaint(
        painter: SparklinePainter(
          data: data,
          color: color,
          fill: fill,
          showLastDot: showLastDot,
        ),
      ),
    );
  }
}
