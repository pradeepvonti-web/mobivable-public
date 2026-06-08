import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'icon_mapper.dart';
import 'schema_notifier.dart';

/// Bottom navigation bar built from the schema's navigation items.
///
/// Reads navigation items from [SchemaNotifier] and maps icon names
/// to Material icons via [IconMapper]. Handles tab switching by calling
/// [SchemaNotifier.setScreen].
class PreviewNavigationBar extends StatelessWidget {
  const PreviewNavigationBar({super.key});

  @override
  Widget build(BuildContext context) {
    final notifier = context.watch<SchemaNotifier>();
    final items = notifier.navigationItems;
    final currentIndex = notifier.currentScreenIndex;

    if (items.length < 2) return const SizedBox.shrink();

    // BottomNavigationBar requires at least 2 items
    return BottomNavigationBar(
      currentIndex: currentIndex.clamp(0, items.length - 1),
      onTap: (index) => notifier.setScreen(index),
      items: items.map((item) {
        final label = (item['label'] as String?) ?? '';
        final iconName = item['icon'] as String?;
        return BottomNavigationBarItem(
          icon: Icon(IconMapper.resolve(iconName)),
          label: label,
        );
      }).toList(),
    );
  }
}
