/**
 * Sample app schemas for testing the MobileAppRenderer.
 * These demonstrate what the AI is expected to generate.
 */
import type { MobileAppSchema } from "./mobile-app-schema";

export const SAMPLE_FITTRACK: MobileAppSchema = {
  name: "FitTrack Pro",
  theme: "dark_fitness",
  screens: [
    {
      id: "home",
      title: "Home",
      icon: "home",
      elements: [
        { type: "greeting", props: { name: "Alex", subtitle: "Let's crush your goals today!" } },
        { type: "progress-ring", props: { value: 1240, max: 2000, label: "Daily Calorie Goal", unit: "kcal", size: "lg" } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "footprints", value: "8,432", label: "Steps", color: "#6366f1" },
              { icon: "clock", value: "47", label: "Active Min", color: "#22c55e" },
              { icon: "flame", value: "1,240", label: "Calories", color: "#f59e0b" },
            ],
          },
        },
        { type: "button", props: { label: "Log Activity", icon: "plus", variant: "primary" } },
        {
          type: "activity-feed",
          props: {
            title: "Today's Activities",
            items: [
              { icon: "dumbbell", label: "Morning Workout", detail: "45 min · 320 kcal", time: "7:30 AM", color: "#6366f1" },
              { icon: "bike", label: "Cycling", detail: "30 min · 280 kcal", time: "12:15 PM", color: "#22c55e" },
              { icon: "footprints", label: "Evening Walk", detail: "25 min · 140 kcal", time: "6:45 PM", color: "#f59e0b" },
            ],
          },
        },
      ],
    },
    {
      id: "log",
      title: "Log",
      icon: "edit",
      elements: [
        { type: "header", props: { title: "Log Activity", subtitle: "Track your workout" } },
        { type: "search-bar", props: { placeholder: "Search activities..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "tab-bar",
          props: {
            tabs: [
              { label: "Exercise", active: true },
              { label: "Nutrition" },
              { label: "Sleep" },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "dumbbell", title: "Strength Training", subtitle: "Weights & resistance", trailing: "45 min", chevron: true },
              { icon: "activity", title: "Running", subtitle: "Outdoor or treadmill", trailing: "30 min", chevron: true },
              { icon: "bike", title: "Cycling", subtitle: "Road or stationary", trailing: "40 min", chevron: true },
              { icon: "waves", title: "Swimming", subtitle: "Pool or open water", trailing: "35 min", chevron: true },
              { icon: "leaf", title: "Yoga", subtitle: "Flexibility & mindfulness", trailing: "60 min", chevron: true },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Add Custom Activity", icon: "plus", variant: "outline" } },
      ],
    },
    {
      id: "stats",
      title: "Stats",
      icon: "bar-chart",
      elements: [
        { type: "header", props: { title: "Weekly Stats", subtitle: "May 12 — May 18" } },
        {
          type: "tab-bar",
          props: {
            tabs: [
              { label: "Week", active: true },
              { label: "Month" },
              { label: "Year" },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        {
          type: "card",
          props: {
            title: "Calories Burned",
            children: [
              {
                type: "bar-chart",
                props: {
                  bars: [
                    { label: "Mon", value: 1800, color: "#6366f1" },
                    { label: "Tue", value: 2100, color: "#6366f1" },
                    { label: "Wed", value: 1500, color: "#6366f1" },
                    { label: "Thu", value: 2400, color: "#22c55e" },
                    { label: "Fri", value: 1900, color: "#6366f1" },
                    { label: "Sat", value: 2200, color: "#6366f1" },
                    { label: "Sun", value: 1240, color: "#f59e0b" },
                  ],
                  maxValue: 2500,
                },
              },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            title: "Macros",
            children: [
              {
                type: "donut-chart",
                props: {
                  segments: [
                    { value: 45, color: "#6366f1", label: "Protein" },
                    { value: 35, color: "#22c55e", label: "Carbs" },
                    { value: 20, color: "#f59e0b", label: "Fat" },
                  ],
                  centerValue: "2,100",
                  centerLabel: "kcal avg",
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "history",
      title: "History",
      icon: "clock",
      elements: [
        { type: "header", props: { title: "Activity History" } },
        { type: "search-bar", props: { placeholder: "Search history..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "section",
          props: {
            title: "Today",
            action: "See all",
            children: [
              {
                type: "list",
                props: {
                  items: [
                    { icon: "dumbbell", title: "Morning Workout", subtitle: "45 min · 320 kcal", trailing: "7:30 AM" },
                    { icon: "bike", title: "Cycling", subtitle: "30 min · 280 kcal", trailing: "12:15 PM" },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "section",
          props: {
            title: "Yesterday",
            action: "See all",
            children: [
              {
                type: "list",
                props: {
                  items: [
                    { icon: "activity", title: "Running", subtitle: "35 min · 380 kcal", trailing: "6:00 AM" },
                    { icon: "leaf", title: "Yoga", subtitle: "60 min · 200 kcal", trailing: "5:30 PM" },
                    { icon: "footprints", title: "Evening Walk", subtitle: "20 min · 100 kcal", trailing: "8:00 PM" },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "profile",
      title: "Profile",
      icon: "user",
      elements: [
        { type: "spacer", props: { height: 12 } },
        { type: "avatar", props: { name: "Alex Johnson", size: "xl", status: "online" } },
        { type: "spacer", props: { height: 8 } },
        { type: "text", props: { content: "Alex Johnson", size: "xl", weight: "bold", align: "center" } },
        { type: "text", props: { content: "Premium Member", size: "xs", color: "primary", align: "center" } },
        { type: "spacer", props: { height: 16 } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "target", value: "87%", label: "Goal Rate", color: "#22c55e" },
              { icon: "flame", value: "142", label: "Streak", color: "#f59e0b" },
              { icon: "trophy", value: "28", label: "Badges", color: "#6366f1" },
            ],
          },
        },
        { type: "divider" },
        {
          type: "list",
          props: {
            items: [
              { icon: "settings", title: "Settings", chevron: true },
              { icon: "bell", title: "Notifications", chevron: true, badge: "3", badgeColor: "#ef4444" },
              { icon: "target", title: "Goals", chevron: true },
              { icon: "share", title: "Share Progress", chevron: true },
              { icon: "heart", title: "Health Connect", subtitle: "Synced", chevron: true },
            ],
          },
        },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "home", label: "Home", icon: "home" },
      { screen: "log", label: "Log", icon: "edit" },
      { screen: "stats", label: "Stats", icon: "bar-chart" },
      { screen: "history", label: "History", icon: "clock" },
      { screen: "profile", label: "Profile", icon: "user" },
    ],
  },
};

export const SAMPLE_SHOPLUX: MobileAppSchema = {
  name: "ShopLux",
  theme: "dark_ecommerce",
  screens: [
    {
      id: "home", title: "Home", icon: "home",
      elements: [
        { type: "hero-banner", props: { title: "Summer Sale", subtitle: "Up to 60% off premium brands", gradient: "linear-gradient(135deg, #f59e0b, #d97706)", icon: "tag", buttonLabel: "Shop Now" } },
        { type: "spacer", props: { height: 8 } },
        { type: "chip-group", props: { chips: [{ label: "All", active: true }, { label: "Clothing" }, { label: "Shoes" }, { label: "Accessories" }, { label: "Electronics" }] } },
        { type: "spacer", props: { height: 8 } },
        { type: "section", props: { title: "Trending Now", action: "See all", children: [
          { type: "grid-cards", props: { columns: 2, items: [
            { icon: "shopping-bag", title: "Designer Jacket", subtitle: "$299.00", color: "#f59e0b", badge: "NEW" },
            { icon: "star", title: "Premium Watch", subtitle: "$599.00", color: "#ec4899" },
            { icon: "gift", title: "Gift Bundle", subtitle: "$149.00", color: "#6366f1", badge: "-30%" },
            { icon: "tag", title: "Running Shoes", subtitle: "$189.00", color: "#22c55e" },
          ] } },
        ] } },
        { type: "countdown", props: { label: "Flash Sale Ends In", hours: 2, minutes: 34, seconds: 12 } },
      ],
    },
    {
      id: "product", title: "Product", icon: "shopping-bag",
      elements: [
        { type: "header", props: { title: "Product Details", backButton: true, rightIcon: "heart" } },
        { type: "image", props: { alt: "Designer Jacket", height: 200, gradient: true, rounded: "lg" } },
        { type: "spacer", props: { height: 8 } },
        { type: "text", props: { content: "Premium Designer Jacket", size: "lg", weight: "bold" } },
        { type: "text", props: { content: "Handcrafted Italian leather with silk lining", size: "sm", color: "muted" } },
        { type: "spacer", props: { height: 8 } },
        { type: "rating", props: { value: 4, max: 5, label: "(128 reviews)" } },
        { type: "spacer", props: { height: 8 } },
        { type: "price-tag", props: { price: "299.00", originalPrice: "449.00", badge: "33% OFF", label: "Free shipping on orders over $200" } },
        { type: "divider" },
        { type: "chip-group", props: { chips: [{ label: "S" }, { label: "M", active: true }, { label: "L" }, { label: "XL" }] } },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Add to Cart", icon: "shopping-cart", variant: "primary" } },
      ],
    },
    {
      id: "cart", title: "Cart", icon: "shopping-cart",
      elements: [
        { type: "header", props: { title: "Your Cart", subtitle: "3 items" } },
        { type: "step-indicator", props: { steps: [{ label: "Cart", completed: true }, { label: "Shipping", active: true }, { label: "Payment" }, { label: "Done" }] } },
        { type: "spacer", props: { height: 12 } },
        { type: "list", props: { items: [
          { icon: "shopping-bag", title: "Designer Jacket", subtitle: "Size: M · Qty: 1", trailing: "$299.00" },
          { icon: "star", title: "Premium Watch", subtitle: "Silver · Qty: 1", trailing: "$599.00" },
          { icon: "tag", title: "Running Shoes", subtitle: "Size: 10 · Qty: 1", trailing: "$189.00" },
        ] } },
        { type: "divider" },
        { type: "price-tag", props: { price: "1,087.00", label: "Subtotal (3 items)", badge: "Free Shipping" } },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Proceed to Checkout", icon: "credit-card", variant: "primary" } },
      ],
    },
    {
      id: "notifications", title: "Alerts", icon: "bell",
      elements: [
        { type: "header", props: { title: "Notifications" } },
        { type: "notification", props: { title: "Order Shipped!", message: "Your Designer Jacket is on its way. Track your package.", icon: "truck", type: "success", time: "2m ago" } },
        { type: "notification", props: { title: "Flash Sale!", message: "Premium watches are 40% off for the next 2 hours.", icon: "zap", type: "warning", time: "15m ago" } },
        { type: "notification", props: { title: "Price Drop", message: "Running Shoes you saved dropped to $149.", icon: "trending-down", type: "info", time: "1h ago" } },
        { type: "notification", props: { title: "Payment Failed", message: "Your card ending in 4242 was declined.", icon: "credit-card", type: "error", time: "3h ago" } },
      ],
    },
    {
      id: "profile", title: "Profile", icon: "user",
      elements: [
        { type: "spacer", props: { height: 12 } },
        { type: "avatar", props: { name: "Sarah Chen", size: "xl", status: "online" } },
        { type: "spacer", props: { height: 8 } },
        { type: "text", props: { content: "Sarah Chen", size: "xl", weight: "bold", align: "center" } },
        { type: "badge", props: { label: "Gold Member", color: "accent" } },
        { type: "spacer", props: { height: 12 } },
        { type: "stat-row", props: { stats: [{ icon: "shopping-bag", value: "47", label: "Orders", color: "#f59e0b" }, { icon: "heart", value: "23", label: "Wishlist", color: "#ec4899" }, { icon: "star", value: "4.9", label: "Rating", color: "#6366f1" }] } },
        { type: "list", props: { items: [{ icon: "package", title: "My Orders", chevron: true }, { icon: "heart", title: "Wishlist", chevron: true, badge: "23" }, { icon: "credit-card", title: "Payment Methods", chevron: true }, { icon: "settings", title: "Settings", chevron: true }] } },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "home", label: "Shop", icon: "home" },
      { screen: "product", label: "Product", icon: "shopping-bag" },
      { screen: "cart", label: "Cart", icon: "shopping-cart" },
      { screen: "notifications", label: "Alerts", icon: "bell" },
      { screen: "profile", label: "Profile", icon: "user" },
    ],
  },
};

export const SAMPLE_WEALTHFLOW: MobileAppSchema = {
  name: "WealthFlow",
  theme: "dark_finance",
  screens: [
    {
      id: "home", title: "Home", icon: "home",
      elements: [
        { type: "greeting", props: { name: "Marcus", subtitle: "Your portfolio is up 3.2% today" } },
        { type: "card", props: { title: "Total Balance", children: [
          { type: "text", props: { content: "$124,850.00", size: "2xl", weight: "bold" } },
          { type: "text", props: { content: "+$3,892.00 (3.2%) today", size: "xs", color: "success" } },
        ] } },
        { type: "stat-row", props: { stats: [{ icon: "trending-up", value: "+12.4%", label: "Month", color: "#10b981" }, { icon: "dollar-sign", value: "$8.2K", label: "Income", color: "#6366f1" }, { icon: "pie-chart", value: "18", label: "Assets", color: "#f59e0b" }] } },
        { type: "section", props: { title: "Quick Actions", children: [
          { type: "grid-cards", props: { columns: 3, items: [
            { icon: "arrow-up", title: "Send", color: "#10b981" },
            { icon: "arrow-down", title: "Receive", color: "#6366f1" },
            { icon: "credit-card", title: "Pay", color: "#f59e0b" },
          ] } },
        ] } },
        { type: "section", props: { title: "Recent Transactions", action: "See all", children: [
          { type: "list", props: { items: [
            { icon: "shopping-cart", title: "Amazon", subtitle: "May 15", trailing: "-$84.50" },
            { icon: "coffee", title: "Starbucks", subtitle: "May 15", trailing: "-$6.40" },
            { icon: "arrow-down", title: "Salary Deposit", subtitle: "May 14", trailing: "+$5,200" },
          ] } },
        ] } },
      ],
    },
    {
      id: "portfolio", title: "Portfolio", icon: "pie-chart",
      elements: [
        { type: "header", props: { title: "Portfolio", subtitle: "Asset Allocation" } },
        { type: "donut-chart", props: { segments: [{ value: 45, color: "#10b981", label: "Stocks" }, { value: 25, color: "#6366f1", label: "Bonds" }, { value: 15, color: "#f59e0b", label: "Crypto" }, { value: 15, color: "#ec4899", label: "Real Estate" }], centerValue: "$124.8K", centerLabel: "Total" } },
        { type: "spacer", props: { height: 12 } },
        { type: "list", props: { items: [
          { icon: "trending-up", title: "S&P 500 Index", subtitle: "+8.4% YTD", trailing: "$56,182", badge: "↑", badgeColor: "#10b981" },
          { icon: "dollar-sign", title: "US Treasury Bonds", subtitle: "+2.1% YTD", trailing: "$31,212" },
          { icon: "zap", title: "Bitcoin", subtitle: "+45.2% YTD", trailing: "$18,727", badge: "↑", badgeColor: "#f59e0b" },
          { icon: "home", title: "REIT Fund", subtitle: "+3.8% YTD", trailing: "$18,729" },
        ] } },
      ],
    },
    {
      id: "insights", title: "Insights", icon: "bar-chart",
      elements: [
        { type: "header", props: { title: "Spending Insights" } },
        { type: "tab-bar", props: { tabs: [{ label: "Week", active: true }, { label: "Month" }, { label: "Year" }] } },
        { type: "spacer", props: { height: 12 } },
        { type: "card", props: { title: "Weekly Spending", children: [
          { type: "bar-chart", props: { bars: [{ label: "Mon", value: 45, color: "#10b981" }, { label: "Tue", value: 120, color: "#10b981" }, { label: "Wed", value: 35, color: "#10b981" }, { label: "Thu", value: 280, color: "#f43f5e" }, { label: "Fri", value: 90, color: "#10b981" }, { label: "Sat", value: 165, color: "#10b981" }, { label: "Sun", value: 55, color: "#10b981" }], maxValue: 300 } },
        ] } },
        { type: "spacer", props: { height: 8 } },
        { type: "notification", props: { title: "Budget Alert", message: "You've spent 80% of your dining budget this month.", icon: "bell", type: "warning" } },
        { type: "slider", props: { label: "Monthly Budget Used", value: 72, unit: "%" } },
      ],
    },
    {
      id: "profile", title: "Profile", icon: "user",
      elements: [
        { type: "spacer", props: { height: 12 } },
        { type: "avatar", props: { name: "Marcus Webb", size: "xl", status: "online" } },
        { type: "spacer", props: { height: 8 } },
        { type: "text", props: { content: "Marcus Webb", size: "xl", weight: "bold", align: "center" } },
        { type: "badge", props: { label: "Platinum Investor", color: "primary" } },
        { type: "divider" },
        { type: "toggle", props: { label: "Biometric Login", checked: true, subtitle: "Use Face ID to sign in" } },
        { type: "toggle", props: { label: "Push Notifications", checked: true } },
        { type: "toggle", props: { label: "Dark Mode", checked: true } },
        { type: "divider" },
        { type: "list", props: { items: [{ icon: "lock", title: "Security", chevron: true }, { icon: "bell", title: "Notifications", chevron: true }, { icon: "globe", title: "Currency", subtitle: "USD", chevron: true }, { icon: "settings", title: "Settings", chevron: true }] } },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "home", label: "Home", icon: "home" },
      { screen: "portfolio", label: "Portfolio", icon: "pie-chart" },
      { screen: "insights", label: "Insights", icon: "bar-chart" },
      { screen: "profile", label: "Profile", icon: "user" },
    ],
  },
};

/** Map of all sample apps for the demo selector */
export const SAMPLE_APPS: Record<string, MobileAppSchema> = {
  fittrack: SAMPLE_FITTRACK,
  shoplux: SAMPLE_SHOPLUX,
  wealthflow: SAMPLE_WEALTHFLOW,
};

