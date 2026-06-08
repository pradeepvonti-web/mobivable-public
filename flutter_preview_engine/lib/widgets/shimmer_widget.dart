import 'package:flutter/material.dart';

/// Supported shimmer skeleton variants.
enum ShimmerVariant {
  text,
  card,
  avatar,
  image,
  list,
}

/// A shimmer / skeleton-loading widget that shows a repeating
/// gradient sweep animation over placeholder shapes.
///
/// [variant] controls the shape:
/// - **text**: Multiple rounded lines of varying widths.
/// - **card**: A single large rounded rectangle.
/// - **avatar**: A circle.
/// - **image**: A large rounded rectangle mimicking an image.
/// - **list**: Multiple rows, each with an avatar circle + two text lines.
class ShimmerWidget extends StatefulWidget {
  const ShimmerWidget({
    super.key,
    this.variant = ShimmerVariant.text,
  });

  final ShimmerVariant variant;

  /// Factory to parse a variant string from JSON.
  static ShimmerVariant parseVariant(String? raw) {
    switch (raw) {
      case 'card':
        return ShimmerVariant.card;
      case 'avatar':
        return ShimmerVariant.avatar;
      case 'image':
        return ShimmerVariant.image;
      case 'list':
        return ShimmerVariant.list;
      case 'text':
      default:
        return ShimmerVariant.text;
    }
  }

  @override
  State<ShimmerWidget> createState() => _ShimmerWidgetState();
}

class _ShimmerWidgetState extends State<ShimmerWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ShaderMask(
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                Colors.grey.shade300,
                Colors.grey.shade100,
                Colors.grey.shade300,
              ],
              stops: [
                (_controller.value - 0.3).clamp(0.0, 1.0),
                _controller.value,
                (_controller.value + 0.3).clamp(0.0, 1.0),
              ],
            ).createShader(bounds);
          },
          blendMode: BlendMode.srcATop,
          child: _buildSkeleton(context),
        );
      },
    );
  }

  Widget _buildSkeleton(BuildContext context) {
    final theme = Theme.of(context);
    final baseColor = theme.colorScheme.onSurface.withValues(alpha: 0.08);

    switch (widget.variant) {
      case ShimmerVariant.text:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _bar(baseColor, double.infinity, 14),
            const SizedBox(height: 10),
            _bar(baseColor, double.infinity, 14),
            const SizedBox(height: 10),
            _bar(baseColor, 180, 14),
          ],
        );

      case ShimmerVariant.card:
        return Container(
          width: double.infinity,
          height: 120,
          decoration: BoxDecoration(
            color: baseColor,
            borderRadius: BorderRadius.circular(12),
          ),
        );

      case ShimmerVariant.avatar:
        return Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: baseColor,
            shape: BoxShape.circle,
          ),
        );

      case ShimmerVariant.image:
        return Container(
          width: double.infinity,
          height: 180,
          decoration: BoxDecoration(
            color: baseColor,
            borderRadius: BorderRadius.circular(12),
          ),
        );

      case ShimmerVariant.list:
        return Column(
          children: List.generate(3, (i) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: baseColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _bar(baseColor, double.infinity, 12),
                        const SizedBox(height: 8),
                        _bar(baseColor, 100, 12),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        );
    }
  }

  /// A simple rounded rectangle placeholder bar.
  Widget _bar(Color color, double width, double height) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(height / 2),
      ),
    );
  }
}

/// Convenience wrapper that exposes the [AnimatedBuilder] used internally.
/// Flutter does not ship `AnimatedBuilder` — it's called [AnimatedBuilder]
/// which is an alias for [AnimatedWidget]'s builder pattern. We use the
/// real class name below.
///
/// (This file compiles because Flutter's [AnimatedBuilder] is defined in
/// `package:flutter/widgets.dart`.)
