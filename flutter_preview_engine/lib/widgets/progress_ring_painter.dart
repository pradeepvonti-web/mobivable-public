import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Custom painter for a circular progress ring.
///
/// Draws a muted background arc and a colored foreground arc proportional
/// to [value] / [max]. A center label (value text + subtitle) can be
/// overlaid via the companion widget.
class ProgressRingPainter extends CustomPainter {
  ProgressRingPainter({
    required this.value,
    required this.max,
    required this.foregroundColor,
    required this.backgroundColor,
    this.strokeWidth = 12.0,
  });

  final double value;
  final double max;
  final Color foregroundColor;
  final Color backgroundColor;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (math.min(size.width, size.height) / 2) - strokeWidth / 2;

    if (radius <= 0) return;

    final rect = Rect.fromCircle(center: center, radius: radius);
    const startAngle = -math.pi / 2;
    const fullAngle = 2 * math.pi;

    // Background arc (full circle)
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(rect, startAngle, fullAngle, false, bgPaint);

    // Foreground arc (progress)
    final progress = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    if (progress > 0) {
      final fgPaint = Paint()
        ..color = foregroundColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;

      canvas.drawArc(rect, startAngle, fullAngle * progress, false, fgPaint);
    }
  }

  @override
  bool shouldRepaint(ProgressRingPainter oldDelegate) {
    return value != oldDelegate.value ||
        max != oldDelegate.max ||
        foregroundColor != oldDelegate.foregroundColor;
  }
}

/// A ready-to-use progress ring widget with center text overlay.
class ProgressRingWidget extends StatelessWidget {
  const ProgressRingWidget({
    super.key,
    required this.value,
    required this.max,
    this.label,
    this.valueLabel,
    this.size = 120,
    this.strokeWidth = 12,
  });

  final double value;
  final double max;
  final String? label;
  final String? valueLabel;
  final double size;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final muted = theme.colorScheme.outline.withValues(alpha: 0.2);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(size, size),
            painter: ProgressRingPainter(
              value: value,
              max: max,
              foregroundColor: primary,
              backgroundColor: muted,
              strokeWidth: strokeWidth,
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                valueLabel ?? '${(value / (max > 0 ? max : 1) * 100).round()}%',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (label != null)
                Text(
                  label!,
                  style: theme.textTheme.bodySmall,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
