import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Custom painter for rendering a vertical bar chart.
///
/// Each bar is drawn with a rounded top. Labels appear below the bars.
/// The tallest bar scales to the available height; others are proportional.
class BarChartPainter extends CustomPainter {
  BarChartPainter({
    required this.bars,
    this.barRadius = 6.0,
    this.barSpacing = 8.0,
    this.labelHeight = 24.0,
  });

  final List<BarData> bars;
  final double barRadius;
  final double barSpacing;
  final double labelHeight;

  @override
  void paint(Canvas canvas, Size size) {
    if (bars.isEmpty) return;

    final maxValue = bars.fold<double>(0, (m, b) => math.max(m, b.value));
    if (maxValue <= 0) return;

    final chartHeight = size.height - labelHeight;
    final totalSpacing = barSpacing * (bars.length + 1);
    final barWidth = (size.width - totalSpacing) / bars.length;

    for (var i = 0; i < bars.length; i++) {
      final bar = bars[i];
      final barHeight = (bar.value / maxValue) * chartHeight;

      final x = barSpacing + i * (barWidth + barSpacing);
      final y = chartHeight - barHeight;

      final rrect = RRect.fromRectAndCorners(
        Rect.fromLTWH(x, y, barWidth, barHeight),
        topLeft: Radius.circular(barRadius),
        topRight: Radius.circular(barRadius),
      );

      final paint = Paint()
        ..color = bar.color
        ..style = PaintingStyle.fill;

      canvas.drawRRect(rrect, paint);

      // Draw label below the bar
      final textPainter = TextPainter(
        text: TextSpan(
          text: bar.label,
          style: TextStyle(
            color: bar.color.withValues(alpha: 0.7),
            fontSize: 11,
            fontWeight: FontWeight.w500,
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout(maxWidth: barWidth + barSpacing);

      textPainter.paint(
        canvas,
        Offset(
          x + (barWidth - textPainter.width) / 2,
          chartHeight + 6,
        ),
      );
    }
  }

  @override
  bool shouldRepaint(BarChartPainter oldDelegate) {
    return bars != oldDelegate.bars;
  }
}

/// A single bar in the bar chart.
class BarData {
  const BarData({
    required this.value,
    required this.label,
    required this.color,
  });

  final double value;
  final String label;
  final Color color;

  factory BarData.fromJson(Map<String, dynamic> json, Color fallbackColor) {
    return BarData(
      value: (json['value'] as num?)?.toDouble() ?? 0,
      label: (json['label'] as String?) ?? '',
      color: json['color'] != null ? _hexToColor(json['color'] as String) : fallbackColor,
    );
  }

  static Color _hexToColor(String hex) {
    var h = hex.replaceFirst('#', '');
    if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
    if (h.length == 6) h = 'FF$h';
    return Color(int.parse(h, radix: 16));
  }
}

/// A ready-to-use bar chart widget.
class BarChartWidget extends StatelessWidget {
  const BarChartWidget({
    super.key,
    required this.bars,
    this.height = 180,
  });

  final List<BarData> bars;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: height,
      child: CustomPaint(
        painter: BarChartPainter(bars: bars),
      ),
    );
  }
}
