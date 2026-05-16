/**
 * Schema types for the AI-generated mobile app structure.
 * The AI produces JSON conforming to these types; the MobileAppRenderer consumes them.
 */

// ─── Icon name union ────────────────────────────────────────────
export type MIconName =
  | "home" | "search" | "user" | "settings" | "bell" | "heart"
  | "star" | "plus" | "minus" | "check" | "x" | "chevron-right"
  | "chevron-left" | "arrow-up" | "arrow-down" | "calendar"
  | "clock" | "map-pin" | "camera" | "image" | "mic" | "play"
  | "pause" | "skip-forward" | "volume" | "wifi" | "battery"
  | "sun" | "moon" | "cloud" | "umbrella" | "zap" | "flame"
  | "target" | "trophy" | "gift" | "tag" | "bookmark"
  | "message" | "mail" | "phone" | "video" | "file" | "folder"
  | "edit" | "trash" | "download" | "upload" | "share"
  | "lock" | "unlock" | "eye" | "eye-off" | "refresh"
  | "filter" | "list" | "grid" | "bar-chart" | "pie-chart"
  | "activity" | "trending-up" | "trending-down" | "dollar-sign"
  | "credit-card" | "shopping-cart" | "shopping-bag" | "package"
  | "truck" | "map" | "compass" | "navigation" | "globe"
  | "coffee" | "utensils" | "dumbbell" | "bike" | "footprints"
  | "waves" | "leaf" | "sparkles" | "wand" | "robot";

// ─── Element types ──────────────────────────────────────────────
export type MElement =
  | MGreeting
  | MProgressRing
  | MStatRow
  | MButton
  | MActivityFeed
  | MCard
  | MText
  | MInput
  | MImage
  | MList
  | MDonutChart
  | MBarChart
  | MToggle
  | MDivider
  | MSpacer
  | MSection
  | MHeader
  | MSearchBar
  | MAvatar
  | MBadge
  | MSlider
  | MTabBar
  | MBottomSheet
  | MCarousel
  | MRating
  | MChipGroup
  | MNotification
  | MPriceTag
  | MStepIndicator
  | MCountdown
  | MGridCards
  | MHeroBanner;

type BaseElement = { id?: string };

export type MGreeting = BaseElement & {
  type: "greeting";
  props: { name: string; subtitle?: string; avatar?: string };
};

export type MProgressRing = BaseElement & {
  type: "progress-ring";
  props: {
    value: number;
    max: number;
    label: string;
    unit?: string;
    color?: string;
    size?: "sm" | "md" | "lg";
  };
};

export type MStatRow = BaseElement & {
  type: "stat-row";
  props: {
    stats: Array<{
      icon: MIconName;
      value: string | number;
      label: string;
      color?: string;
    }>;
  };
};

export type MButton = BaseElement & {
  type: "button";
  props: {
    label: string;
    icon?: MIconName;
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
  };
};

export type MActivityFeed = BaseElement & {
  type: "activity-feed";
  props: {
    title?: string;
    items: Array<{
      icon: MIconName;
      label: string;
      detail?: string;
      time?: string;
      color?: string;
    }>;
    emptyText?: string;
  };
};

export type MCard = BaseElement & {
  type: "card";
  props: {
    title?: string;
    subtitle?: string;
    children?: MElement[];
    padding?: "none" | "sm" | "md" | "lg";
  };
};

export type MText = BaseElement & {
  type: "text";
  props: {
    content: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
    weight?: "normal" | "medium" | "semibold" | "bold";
    color?: "text" | "muted" | "primary" | "accent" | "danger" | "success";
    align?: "left" | "center" | "right";
  };
};

export type MInput = BaseElement & {
  type: "input";
  props: {
    placeholder: string;
    label?: string;
    type?: "text" | "email" | "password" | "number" | "search";
    icon?: MIconName;
  };
};

export type MImage = BaseElement & {
  type: "image";
  props: {
    src?: string;
    alt: string;
    height?: number;
    rounded?: "none" | "sm" | "md" | "lg" | "full";
    aspectRatio?: "square" | "video" | "wide";
    gradient?: boolean;
  };
};

export type MList = BaseElement & {
  type: "list";
  props: {
    items: Array<{
      icon?: MIconName;
      title: string;
      subtitle?: string;
      trailing?: string;
      chevron?: boolean;
      avatar?: string;
      badge?: string;
      badgeColor?: string;
    }>;
    dividers?: boolean;
  };
};

export type MDonutChart = BaseElement & {
  type: "donut-chart";
  props: {
    segments: Array<{
      value: number;
      color: string;
      label: string;
    }>;
    centerLabel?: string;
    centerValue?: string;
    size?: number;
  };
};

export type MBarChart = BaseElement & {
  type: "bar-chart";
  props: {
    bars: Array<{
      label: string;
      value: number;
      color?: string;
    }>;
    maxValue?: number;
    height?: number;
  };
};

export type MToggle = BaseElement & {
  type: "toggle";
  props: {
    label: string;
    checked?: boolean;
    subtitle?: string;
  };
};

export type MDivider = BaseElement & {
  type: "divider";
  props?: { color?: string };
};

export type MSpacer = BaseElement & {
  type: "spacer";
  props?: { height?: number };
};

export type MSection = BaseElement & {
  type: "section";
  props: {
    title: string;
    subtitle?: string;
    children: MElement[];
    action?: string;
  };
};

export type MHeader = BaseElement & {
  type: "header";
  props: {
    title: string;
    subtitle?: string;
    backButton?: boolean;
    rightIcon?: MIconName;
    avatar?: string;
  };
};

export type MSearchBar = BaseElement & {
  type: "search-bar";
  props: {
    placeholder?: string;
  };
};

export type MAvatar = BaseElement & {
  type: "avatar";
  props: {
    name: string;
    src?: string;
    size?: "sm" | "md" | "lg" | "xl";
    status?: "online" | "offline" | "away";
  };
};

export type MBadge = BaseElement & {
  type: "badge";
  props: {
    label: string;
    color?: "primary" | "accent" | "danger" | "success" | "muted";
  };
};

export type MSlider = BaseElement & {
  type: "slider";
  props: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    unit?: string;
  };
};

export type MTabBar = BaseElement & {
  type: "tab-bar";
  props: {
    tabs: Array<{ label: string; active?: boolean }>;
  };
};

export type MBottomSheet = BaseElement & {
  type: "bottom-sheet";
  props: {
    title: string;
    children: MElement[];
  };
};

export type MCarousel = BaseElement & {
  type: "carousel";
  props: {
    items: Array<{
      image?: string;
      title: string;
      subtitle?: string;
      gradient?: string;
    }>;
    height?: number;
  };
};

// ─── Screen ─────────────────────────────────────────────────────
export type MScreen = {
  id: string;
  title: string;
  icon: MIconName;
  elements: MElement[];
  scrollable?: boolean;
  headerStyle?: "default" | "large" | "transparent";
};

// ─── Navigation ─────────────────────────────────────────────────
export type MNavItem = {
  screen: string;
  label: string;
  icon: MIconName;
};

export type MNavigation = {
  type: "bottom-tabs";
  items: MNavItem[];
};

// ─── New Phase 3 Elements ───────────────────────────────────────
export type MRating = BaseElement & {
  type: "rating";
  props: { value: number; max?: number; label?: string; size?: "sm" | "md" | "lg" };
};

export type MChipGroup = BaseElement & {
  type: "chip-group";
  props: {
    chips: Array<{ label: string; active?: boolean; icon?: MIconName; color?: string }>;
  };
};

export type MNotification = BaseElement & {
  type: "notification";
  props: {
    title: string;
    message: string;
    icon?: MIconName;
    type?: "info" | "success" | "warning" | "error";
    time?: string;
  };
};

export type MPriceTag = BaseElement & {
  type: "price-tag";
  props: {
    price: string;
    originalPrice?: string;
    label?: string;
    badge?: string;
    currency?: string;
  };
};

export type MStepIndicator = BaseElement & {
  type: "step-indicator";
  props: {
    steps: Array<{ label: string; completed?: boolean; active?: boolean }>;
  };
};

export type MCountdown = BaseElement & {
  type: "countdown";
  props: { label: string; hours: number; minutes: number; seconds: number };
};

export type MGridCards = BaseElement & {
  type: "grid-cards";
  props: {
    columns?: 2 | 3;
    items: Array<{
      icon?: MIconName;
      title: string;
      subtitle?: string;
      color?: string;
      badge?: string;
    }>;
  };
};

export type MHeroBanner = BaseElement & {
  type: "hero-banner";
  props: {
    title: string;
    subtitle?: string;
    gradient?: string;
    height?: number;
    icon?: MIconName;
    buttonLabel?: string;
  };
};

// ─── Full App Schema ────────────────────────────────────────────
export type MobileAppSchema = {
  name: string;
  theme: string | import("./mobile-theme").MobileTheme;
  screens: MScreen[];
  navigation: MNavigation;
};
