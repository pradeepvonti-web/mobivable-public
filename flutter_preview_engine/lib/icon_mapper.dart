import 'package:flutter/material.dart';

/// Maps MIconName strings from the schema JSON to Material [IconData].
///
/// Covers all 80+ icon names defined in the MobileAppSchema.
/// Falls back to [Icons.help_outline] for unknown names.
class IconMapper {
  IconMapper._();

  static const Map<String, IconData> _map = {
    // Navigation & UI
    'home': Icons.home_outlined,
    'search': Icons.search,
    'user': Icons.person_outline,
    'settings': Icons.settings_outlined,
    'bell': Icons.notifications_outlined,
    'heart': Icons.favorite_outline,
    'star': Icons.star_outline,
    'plus': Icons.add,
    'minus': Icons.remove,
    'check': Icons.check,
    'x': Icons.close,
    'chevron-right': Icons.chevron_right,
    'chevron-left': Icons.chevron_left,
    'arrow-up': Icons.arrow_upward,
    'arrow-down': Icons.arrow_downward,

    // Date & Time
    'calendar': Icons.calendar_today_outlined,
    'clock': Icons.access_time_outlined,

    // Location
    'map-pin': Icons.location_on_outlined,
    'map': Icons.map_outlined,
    'compass': Icons.explore_outlined,
    'navigation': Icons.navigation_outlined,
    'globe': Icons.language,

    // Media & Camera
    'camera': Icons.camera_alt_outlined,
    'image': Icons.image_outlined,
    'mic': Icons.mic_outlined,
    'play': Icons.play_arrow_outlined,
    'pause': Icons.pause_outlined,
    'skip-forward': Icons.skip_next_outlined,
    'volume': Icons.volume_up_outlined,
    'video': Icons.videocam_outlined,

    // Connectivity & Device
    'wifi': Icons.wifi,
    'battery': Icons.battery_full,
    'sun': Icons.wb_sunny_outlined,
    'moon': Icons.dark_mode_outlined,

    // Weather & Nature
    'cloud': Icons.cloud_outlined,
    'umbrella': Icons.umbrella_outlined,
    'waves': Icons.waves_outlined,
    'leaf': Icons.eco_outlined,

    // Energy & Effects
    'zap': Icons.flash_on_outlined,
    'flame': Icons.local_fire_department_outlined,
    'sparkles': Icons.auto_awesome_outlined,
    'wand': Icons.auto_fix_high_outlined,

    // Gaming & Achievements
    'target': Icons.gps_fixed,
    'trophy': Icons.emoji_events_outlined,
    'gift': Icons.card_giftcard_outlined,

    // Commerce & Tags
    'tag': Icons.local_offer_outlined,
    'bookmark': Icons.bookmark_outline,
    'dollar-sign': Icons.attach_money,
    'credit-card': Icons.credit_card_outlined,
    'shopping-cart': Icons.shopping_cart_outlined,
    'shopping-bag': Icons.shopping_bag_outlined,
    'package': Icons.inventory_2_outlined,
    'truck': Icons.local_shipping_outlined,

    // Communication
    'message': Icons.chat_bubble_outline,
    'mail': Icons.mail_outline,
    'phone': Icons.phone_outlined,

    // Files & Documents
    'file': Icons.insert_drive_file_outlined,
    'folder': Icons.folder_outlined,

    // Actions
    'edit': Icons.edit_outlined,
    'trash': Icons.delete_outline,
    'download': Icons.download_outlined,
    'upload': Icons.upload_outlined,
    'share': Icons.share_outlined,
    'lock': Icons.lock_outline,
    'unlock': Icons.lock_open_outlined,
    'eye': Icons.visibility_outlined,
    'eye-off': Icons.visibility_off_outlined,
    'refresh': Icons.refresh,
    'filter': Icons.filter_list,

    // Layout & Data
    'list': Icons.list,
    'grid': Icons.grid_view,
    'bar-chart': Icons.bar_chart,
    'pie-chart': Icons.pie_chart_outline,
    'activity': Icons.show_chart,
    'trending-up': Icons.trending_up,
    'trending-down': Icons.trending_down,

    // Food & Lifestyle
    'coffee': Icons.coffee_outlined,
    'utensils': Icons.restaurant_outlined,
    'dumbbell': Icons.fitness_center,
    'bike': Icons.directions_bike,
    'footprints': Icons.directions_walk,

    // AI & Tech
    'robot': Icons.smart_toy_outlined,
  };

  /// Resolves a schema icon name to a Flutter [IconData].
  ///
  /// Returns [Icons.help_outline] when [name] is null or not found.
  static IconData resolve(String? name) {
    if (name == null || name.isEmpty) return Icons.help_outline;
    return _map[name] ?? Icons.help_outline;
  }
}
