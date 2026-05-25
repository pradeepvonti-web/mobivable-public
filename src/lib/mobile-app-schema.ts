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
  | MHeroBanner
  | MGlassCard
  | MGradientMeshBg
  | MParallaxHero
  | MMarquee
  | MStatCardXL
  | MFeatureShowcase
  | MTestimonial
  | MPricingCard
  | MOnboardingSlide
  | MLineChart
  | MSparkline
  | MProgressBar
  | MSkeleton
  | MEmptyState;

export type MEntrance =
  | "none" | "fade-up" | "fade-in" | "scale-in"
  | "slide-left" | "slide-right" | "pop" | "blur-in";

export type MGesture = "tap-scale" | "press-glow" | "swipe-hint";

type BaseElement = {
  id?: string;
  /** Optional grid span in bento-grid layouts: 1 (default) or 2 (full row). */
  span?: 1 | 2;
  /** Entrance animation played when the element mounts. Defaults to fade-up. */
  entrance?: MEntrance;
  /** Gesture affordance hint (interactive feedback). */
  gesture?: MGesture;
  /** Per-element style override applied as a wrapper. */
  style?: {
    backgroundColor?: string;
    gradient?: [string, string];
    borderRadius?: number;
    shadow?: "sm" | "md" | "lg";
    opacity?: number;
    padding?: "xs" | "sm" | "md" | "lg" | "xl";
  };
};


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
    /** AI image-generation prompt; renderer fills `src` from this. */
    prompt?: string;
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
      prompt?: string;
    }>;
    height?: number;
  };
};


// ─── Screen ─────────────────────────────────────────────────────
export type MScreenLayout =
  | "stack"        // default vertical scroll
  | "split-hero"   // first element full-bleed hero, rest stacked
  | "bento-grid"   // asymmetric grid honoring element.span
  | "magazine"     // first element featured large, remainder in 2-col grid
  | "full-bleed";  // no horizontal padding; edge-to-edge

export type MScreen = {
  id: string;
  title: string;
  icon: MIconName;
  elements: MElement[];
  scrollable?: boolean;
  headerStyle?: "default" | "large" | "transparent";
  /** Composition template for the screen body. Defaults to "stack". */
  layout?: MScreenLayout;
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
      image?: string;
      prompt?: string;
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
    image?: string;
    prompt?: string;
  };
};

// ─── Premium primitives ─────────────────────────────────────────

export type MGlassCard = BaseElement & {
  type: "glass-card";
  props: {
    title?: string;
    subtitle?: string;
    tint?: "light" | "dark" | "primary" | "accent";
    children?: MElement[];
    image?: string;
    prompt?: string;
  };
};

export type MGradientMeshBg = BaseElement & {
  type: "gradient-mesh-bg";
  props: {
    colors?: string[];
    intensity?: "subtle" | "medium" | "bold";
    height?: number;
    children?: MElement[];
  };
};

export type MParallaxHero = BaseElement & {
  type: "parallax-hero";
  props: {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    image?: string;
    prompt?: string;
    height?: number;
    buttonLabel?: string;
    align?: "left" | "center";
  };
};

export type MMarquee = BaseElement & {
  type: "marquee";
  props: {
    items: string[];
    speed?: "slow" | "medium" | "fast";
    separator?: string;
    variant?: "primary" | "muted" | "accent";
  };
};

export type MStatCardXL = BaseElement & {
  type: "stat-card-xl";
  props: {
    label: string;
    value: string | number;
    delta?: string;
    deltaDirection?: "up" | "down" | "flat";
    sparkline?: number[];
    icon?: MIconName;
    accent?: string;
  };
};

export type MFeatureShowcase = BaseElement & {
  type: "feature-showcase";
  props: {
    title: string;
    description: string;
    image?: string;
    prompt?: string;
    icon?: MIconName;
    layout?: "image-left" | "image-right" | "image-top";
    buttonLabel?: string;
  };
};

export type MTestimonial = BaseElement & {
  type: "testimonial";
  props: {
    quote: string;
    name: string;
    role?: string;
    avatar?: string;
    rating?: number;
  };
};

export type MPricingCard = BaseElement & {
  type: "pricing-card";
  props: {
    name: string;
    price: string;
    period?: string;
    description?: string;
    features: string[];
    buttonLabel?: string;
    highlighted?: boolean;
    badge?: string;
  };
};

export type MOnboardingSlide = BaseElement & {
  type: "onboarding-slide";
  props: {
    title: string;
    body: string;
    image?: string;
    prompt?: string;
    icon?: MIconName;
    step?: number;
    totalSteps?: number;
    buttonLabel?: string;
  };
};


export type MLineChart = BaseElement & {
  type: "line-chart";
  props: {
    series: Array<{ label: string; data: number[]; color?: string }>;
    labels?: string[];
    height?: number;
    fill?: boolean;
    showDots?: boolean;
    showGrid?: boolean;
  };
};

export type MSparkline = BaseElement & {
  type: "sparkline";
  props: {
    data: number[];
    color?: string;
    height?: number;
    fill?: boolean;
    showLastDot?: boolean;
  };
};

export type MProgressBar = BaseElement & {
  type: "progress-bar";
  props: {
    value: number;
    max?: number;
    label?: string;
    color?: string;
    showPercent?: boolean;
    height?: number;
  };
};

export type MSkeleton = BaseElement & {
  type: "skeleton";
  props: {
    variant: "text" | "card" | "avatar" | "image" | "list";
    lines?: number;
    height?: number;
  };
};

export type MEmptyState = BaseElement & {
  type: "empty-state";
  props: {
    icon: MIconName;
    title: string;
    description?: string;
    actionLabel?: string;
    actionIcon?: MIconName;
  };
};

// ─── Backend (per-project Supabase) ─────────────────────────────
export type MColumnType =
  | "text" | "int" | "float" | "bool" | "timestamp" | "jsonb" | "uuid";

export type MColumn = {
  name: string;
  type: MColumnType;
  nullable?: boolean;
  default?: string;
};

export type MTableRls = "owner" | "public_read" | "none";

export type MTable = {
  name: string;
  columns: MColumn[];
  rls?: MTableRls;
};

export type MBackend = {
  tables?: MTable[];
  auth?: {
    providers?: Array<"email" | "google" | "apple">;
    requireEmailConfirm?: boolean;
  };
  storage?: Array<{ bucket: string; public?: boolean }>;
  push?: boolean;
};

// ─── Full App Schema ────────────────────────────────────────────
export type MobileAppSchema = {
  name: string;
  theme: string | import("./mobile-theme").MobileTheme;
  screens: MScreen[];
  navigation: MNavigation;
  backend?: MBackend;
};
