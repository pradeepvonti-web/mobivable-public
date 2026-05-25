/**
 * Drag-and-drop component palette for the live mobile preview.
 * Users drag a chip onto the phone; the host (route) appends the
 * element to the currently active screen.
 *
 * Payload contract:
 *   dataTransfer type "application/x-mobile-element"
 *   value: JSON-serialized MElement
 */
import { useState } from "react";
import type { MElement } from "@/lib/mobile-app-schema";
import {
  Type, Square, Image as ImageIcon, BarChart3, Sparkles,
  CreditCard, Quote, Megaphone, Layout, MousePointer2, ChevronDown, ChevronUp,
  LineChart, Activity, Gauge, Target, MapPin, MessageSquare,
  Video, Clock, ChevronRight, List, Calendar, Wallet,
  Radar, ArrowDownUp, ToggleLeft, Search, Star, Bell,
  Tag, Sliders, AlignLeft, CheckSquare, Circle, CalendarDays,
  Timer, Grid3X3, Layers,
} from "lucide-react";

type PaletteItem = {
  type: string;
  label: string;
  group: "premium" | "basic" | "data" | "charts" | "forms" | "interactive" | "differentiator";
  icon: React.ComponentType<{ className?: string }>;
  build: () => MElement;
};

const ITEMS: PaletteItem[] = [
  // ── Premium ────────────────────────────────────────────────────
  { type: "parallax-hero", label: "Parallax Hero", group: "premium", icon: Sparkles, build: () => ({
    type: "parallax-hero",
    props: { title: "New Hero", subtitle: "Tap to edit", eyebrow: "FEATURED", height: 220 },
  } as MElement) },
  { type: "glass-card", label: "Glass Card", group: "premium", icon: Layout, build: () => ({
    type: "glass-card",
    props: { title: "Glass Card", subtitle: "Frosted surface", tint: "primary", children: [] },
  } as MElement) },
  { type: "stat-card-xl", label: "Stat Card XL", group: "premium", icon: BarChart3, build: () => ({
    type: "stat-card-xl",
    props: { label: "Revenue", value: "$12,480", delta: "+8.4%", deltaDirection: "up", sparkline: [4, 6, 5, 8, 7, 10, 12] },
  } as MElement) },
  { type: "feature-showcase", label: "Feature Showcase", group: "premium", icon: Layout, build: () => ({
    type: "feature-showcase",
    props: { title: "New Feature", description: "Describe what makes it shine.", layout: "image-left", buttonLabel: "Learn more" },
  } as MElement) },
  { type: "testimonial", label: "Testimonial", group: "premium", icon: Quote, build: () => ({
    type: "testimonial",
    props: { quote: "This product changed how my team ships.", name: "Alex Morgan", role: "Head of Product", rating: 5 },
  } as MElement) },
  { type: "pricing-card", label: "Pricing Card", group: "premium", icon: CreditCard, build: () => ({
    type: "pricing-card",
    props: { name: "Pro", price: "$19", period: "/mo", features: ["Unlimited projects", "Priority support", "Custom domains"], buttonLabel: "Start trial", highlighted: true },
  } as MElement) },
  { type: "marquee", label: "Marquee", group: "premium", icon: Megaphone, build: () => ({
    type: "marquee",
    props: { items: ["NEW DROP", "FREE SHIPPING", "LIMITED EDITION"], speed: "medium" },
  } as MElement) },
  { type: "hero-banner", label: "Hero Banner", group: "premium", icon: ImageIcon, build: () => ({
    type: "hero-banner",
    props: { title: "Welcome", subtitle: "Get started in seconds", buttonLabel: "Continue" },
  } as MElement) },
  { type: "onboarding-slide", label: "Onboarding Slide", group: "premium", icon: Layers, build: () => ({
    type: "onboarding-slide",
    props: { title: "Welcome", body: "Get started in seconds", buttonLabel: "Next", step: 1, totalSteps: 3 },
  } as MElement) },
  { type: "gradient-mesh-bg", label: "Gradient Mesh", group: "premium", icon: Sparkles, build: () => ({
    type: "gradient-mesh-bg",
    props: { intensity: "medium", height: 200, children: [] },
  } as MElement) },

  // ── Basics ─────────────────────────────────────────────────────
  { type: "text", label: "Text", group: "basic", icon: Type, build: () => ({
    type: "text", props: { content: "New text", size: "md", color: "text" },
  } as MElement) },
  { type: "button", label: "Button", group: "basic", icon: MousePointer2, build: () => ({
    type: "button", props: { label: "Click me", variant: "primary", fullWidth: true }, gesture: "tap-scale",
  } as MElement) },
  { type: "card", label: "Card", group: "basic", icon: Square, build: () => ({
    type: "card", props: { title: "Card title", subtitle: "Card subtitle", children: [] },
  } as MElement) },
  { type: "image", label: "Image", group: "basic", icon: ImageIcon, build: () => ({
    type: "image", props: { alt: "Image", height: 160, gradient: true },
  } as MElement) },
  { type: "divider", label: "Divider", group: "basic", icon: Square, build: () => ({
    type: "divider", props: {},
  } as MElement) },
  { type: "spacer", label: "Spacer", group: "basic", icon: Square, build: () => ({
    type: "spacer", props: { height: 16 },
  } as MElement) },
  { type: "header", label: "Header", group: "basic", icon: Type, build: () => ({
    type: "header", props: { title: "Section Header" },
  } as MElement) },
  { type: "section", label: "Section", group: "basic", icon: Layout, build: () => ({
    type: "section", props: { title: "Section", children: [] },
  } as MElement) },
  { type: "avatar", label: "Avatar", group: "basic", icon: Circle, build: () => ({
    type: "avatar", props: { name: "John Doe", size: "md" },
  } as MElement) },
  { type: "badge", label: "Badge", group: "basic", icon: Tag, build: () => ({
    type: "badge", props: { label: "New", variant: "primary" },
  } as MElement) },
  { type: "search-bar", label: "Search Bar", group: "basic", icon: Search, build: () => ({
    type: "search-bar", props: { placeholder: "Search..." },
  } as MElement) },
  { type: "toggle", label: "Toggle", group: "basic", icon: ToggleLeft, build: () => ({
    type: "toggle", props: { label: "Enable notifications", checked: true },
  } as MElement) },
  { type: "list", label: "List", group: "basic", icon: List, build: () => ({
    type: "list", props: { items: [{ title: "Item 1", subtitle: "Description", chevron: true }, { title: "Item 2", subtitle: "Description", chevron: true }] },
  } as MElement) },
  { type: "input", label: "Input", group: "basic", icon: AlignLeft, build: () => ({
    type: "input", props: { placeholder: "Enter text", label: "Label" },
  } as MElement) },
  { type: "carousel", label: "Carousel", group: "basic", icon: Layers, build: () => ({
    type: "carousel", props: { items: [{ title: "Slide 1" }, { title: "Slide 2" }, { title: "Slide 3" }], height: 140 },
  } as MElement) },

  // ── Data & Stats ───────────────────────────────────────────────
  { type: "stat-row", label: "Stat Row", group: "data", icon: BarChart3, build: () => ({
    type: "stat-row",
    props: { stats: [
      { icon: "activity", value: "1,284", label: "Active" },
      { icon: "trending-up", value: "92%", label: "Growth" },
      { icon: "star", value: "4.9", label: "Rating" },
    ] },
  } as MElement) },
  { type: "bar-chart", label: "Bar Chart", group: "data", icon: BarChart3, build: () => ({
    type: "bar-chart",
    props: { bars: [
      { label: "Mon", value: 40 }, { label: "Tue", value: 65 },
      { label: "Wed", value: 50 }, { label: "Thu", value: 80 },
      { label: "Fri", value: 70 }, { label: "Sat", value: 90 },
    ] },
  } as MElement) },
  { type: "grid-cards", label: "Grid Cards", group: "data", icon: Grid3X3, build: () => ({
    type: "grid-cards",
    props: { columns: 2, items: [{ icon: "star", title: "Card 1", subtitle: "Description" }, { icon: "heart", title: "Card 2", subtitle: "Description" }] },
  } as MElement) },
  { type: "progress-ring", label: "Progress Ring", group: "data", icon: Target, build: () => ({
    type: "progress-ring",
    props: { value: 72, max: 100, label: "Progress", unit: "%" },
  } as MElement) },
  { type: "activity-feed", label: "Activity Feed", group: "data", icon: Activity, build: () => ({
    type: "activity-feed",
    props: { title: "Recent Activity", items: [{ icon: "check", label: "Task completed", time: "2m ago" }] },
  } as MElement) },
  { type: "notification", label: "Notification", group: "data", icon: Bell, build: () => ({
    type: "notification",
    props: { title: "New Update", message: "Your app has been updated", type: "info" },
  } as MElement) },
  { type: "step-indicator", label: "Step Indicator", group: "data", icon: ArrowDownUp, build: () => ({
    type: "step-indicator",
    props: { steps: [{ label: "Cart", completed: true }, { label: "Payment", active: true }, { label: "Done" }] },
  } as MElement) },
  { type: "countdown", label: "Countdown", group: "data", icon: Timer, build: () => ({
    type: "countdown",
    props: { label: "Time Left", hours: 2, minutes: 30, seconds: 0 },
  } as MElement) },
  { type: "price-tag", label: "Price Tag", group: "data", icon: Tag, build: () => ({
    type: "price-tag",
    props: { price: "29.99", originalPrice: "49.99", badge: "-40%" },
  } as MElement) },
  { type: "rating", label: "Rating", group: "data", icon: Star, build: () => ({
    type: "rating",
    props: { value: 4.5, max: 5, label: "4.5 / 5" },
  } as MElement) },
  { type: "chip-group", label: "Chip Group", group: "data", icon: Tag, build: () => ({
    type: "chip-group",
    props: { chips: [{ label: "All", active: true }, { label: "Popular" }, { label: "New" }] },
  } as MElement) },
  { type: "slider", label: "Slider", group: "data", icon: Sliders, build: () => ({
    type: "slider",
    props: { label: "Volume", value: 75, min: 0, max: 100 },
  } as MElement) },
  { type: "tab-bar", label: "Tab Bar", group: "data", icon: Layout, build: () => ({
    type: "tab-bar",
    props: { tabs: [{ label: "Tab 1", active: true }, { label: "Tab 2" }, { label: "Tab 3" }] },
  } as MElement) },
  { type: "skeleton", label: "Skeleton", group: "data", icon: Square, build: () => ({
    type: "skeleton",
    props: { variant: "card", lines: 3 },
  } as MElement) },
  { type: "empty-state", label: "Empty State", group: "data", icon: Square, build: () => ({
    type: "empty-state",
    props: { icon: "search", title: "No results", description: "Try a different search", actionLabel: "Reset" },
  } as MElement) },
  { type: "progress-bar", label: "Progress Bar", group: "data", icon: Activity, build: () => ({
    type: "progress-bar",
    props: { value: 65, max: 100, label: "Upload progress", showPercent: true },
  } as MElement) },

  // ── Charts ─────────────────────────────────────────────────────
  { type: "donut-chart", label: "Donut Chart", group: "charts", icon: Target, build: () => ({
    type: "donut-chart",
    props: { segments: [{ value: 40, color: "#6366f1", label: "Design" }, { value: 30, color: "#22c55e", label: "Dev" }, { value: 30, color: "#f59e0b", label: "QA" }], centerLabel: "Tasks", centerValue: "100" },
  } as MElement) },
  { type: "line-chart", label: "Line Chart", group: "charts", icon: LineChart, build: () => ({
    type: "line-chart",
    props: { series: [{ label: "Revenue", data: [10, 25, 18, 32, 28, 45], color: "#6366f1" }], labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], height: 160 },
  } as MElement) },
  { type: "sparkline", label: "Sparkline", group: "charts", icon: Activity, build: () => ({
    type: "sparkline",
    props: { data: [4, 7, 5, 9, 6, 12, 8], height: 32, color: "#22c55e" },
  } as MElement) },
  { type: "radar-chart", label: "Radar Chart", group: "charts", icon: Radar, build: () => ({
    type: "radar-chart",
    props: { axes: [{ label: "Speed", value: 80 }, { label: "Power", value: 65 }, { label: "Range", value: 90 }, { label: "Defense", value: 70 }, { label: "Magic", value: 55 }] },
  } as unknown as MElement) },
  { type: "gauge-chart", label: "Gauge Chart", group: "charts", icon: Gauge, build: () => ({
    type: "gauge-chart",
    props: { value: 72, max: 100, label: "Performance", unit: "%", color: "#22c55e" },
  } as MElement) },

  // ── Forms ──────────────────────────────────────────────────────
  { type: "dropdown", label: "Dropdown", group: "forms", icon: ChevronDown, build: () => ({
    type: "dropdown",
    props: { label: "Country", placeholder: "Select...", options: [{ label: "USA", value: "us" }, { label: "UK", value: "uk" }] },
  } as MElement) },
  { type: "date-picker", label: "Date Picker", group: "forms", icon: CalendarDays, build: () => ({
    type: "date-picker",
    props: { label: "Start Date", placeholder: "Pick a date", mode: "date" },
  } as MElement) },
  { type: "checkbox", label: "Checkbox", group: "forms", icon: CheckSquare, build: () => ({
    type: "checkbox",
    props: { label: "Preferences", items: [{ label: "Email notifications", checked: true }, { label: "SMS alerts" }] },
  } as MElement) },
  { type: "radio-group", label: "Radio Group", group: "forms", icon: Circle, build: () => ({
    type: "radio-group",
    props: { label: "Plan", options: [{ label: "Free", value: "free" }, { label: "Pro", value: "pro" }], selectedValue: "pro" },
  } as MElement) },
  { type: "textarea", label: "Text Area", group: "forms", icon: AlignLeft, build: () => ({
    type: "textarea",
    props: { label: "Description", placeholder: "Enter details...", rows: 4 },
  } as MElement) },

  // ── Interactive ────────────────────────────────────────────────
  { type: "map-card", label: "Map Card", group: "interactive", icon: MapPin, build: () => ({
    type: "map-card",
    props: { address: "123 Main St, San Francisco, CA", title: "Office Location", actionLabel: "Get Directions" },
  } as MElement) },
  { type: "chat-bubble", label: "Chat Bubble", group: "interactive", icon: MessageSquare, build: () => ({
    type: "chat-bubble",
    props: { messages: [{ sender: "AI", content: "How can I help?", isUser: false }, { sender: "You", content: "Tell me more", isUser: true }], showInput: true },
  } as MElement) },
  { type: "video-player", label: "Video Player", group: "interactive", icon: Video, build: () => ({
    type: "video-player",
    props: { title: "Introduction", duration: "3:45", channel: "Official", progress: 0.3 },
  } as MElement) },
  { type: "timeline", label: "Timeline", group: "interactive", icon: Clock, build: () => ({
    type: "timeline",
    props: { events: [{ title: "Order Placed", time: "10:00 AM", completed: true }, { title: "Processing", time: "10:30 AM", completed: true }, { title: "Shipped", time: "2:00 PM" }] },
  } as MElement) },
  { type: "accordion", label: "Accordion", group: "interactive", icon: ChevronDown, build: () => ({
    type: "accordion",
    props: { sections: [{ title: "What is this?", content: "A great product.", expanded: true }, { title: "How to use?", content: "Just tap and go." }] },
  } as MElement) },
  { type: "bottom-sheet", label: "Bottom Sheet", group: "interactive", icon: Layers, build: () => ({
    type: "bottom-sheet",
    props: { title: "Options", children: [] },
  } as MElement) },

  // ── Differentiators ────────────────────────────────────────────
  { type: "swipe-card", label: "Swipe Card", group: "differentiator", icon: ArrowDownUp, build: () => ({
    type: "swipe-card",
    props: { cards: [{ title: "Alex, 28", subtitle: "Designer", badge: "New" }, { title: "Sam, 25", subtitle: "Engineer" }], showActions: true },
  } as MElement) },
  { type: "calendar-strip", label: "Calendar Strip", group: "differentiator", icon: CalendarDays, build: () => ({
    type: "calendar-strip",
    props: { selectedDate: "2026-05-25", showMonth: true },
  } as unknown as MElement) },
  { type: "bank-card", label: "Bank Card", group: "differentiator", icon: CreditCard, build: () => ({
    type: "bank-card",
    props: { cardNumber: "4111111111111234", holderName: "JOHN DOE", expiry: "12/28", network: "visa", bankName: "NeoBank" },
  } as MElement) },
  { type: "component-ref", label: "Component Ref", group: "differentiator", icon: Layers, build: () => ({
    type: "component-ref",
    props: { name: "my-component" },
  } as MElement) },
];

const GROUPS: Array<{ id: PaletteItem["group"]; label: string }> = [
  { id: "premium", label: "Premium" },
  { id: "basic", label: "Basics" },
  { id: "data", label: "Data & Stats" },
  { id: "charts", label: "Charts" },
  { id: "forms", label: "Forms" },
  { id: "interactive", label: "Interactive" },
  { id: "differentiator", label: "Differentiators" },
];

export function ComponentPalette({
  className,
  variant = "compact",
}: {
  className?: string;
  variant?: "compact" | "panel";
}) {
  const [open, setOpen] = useState(true);
  const isPanel = variant === "panel";

  if (isPanel) {
    return (
      <div className={`text-foreground space-y-5 ${className ?? ""}`}>
        <p className="text-xs text-muted-foreground leading-snug">
          Drag any component onto the phone preview to add it to the current screen.
        </p>
        {GROUPS.map((group) => {
          const items = ITEMS.filter((i) => i.group === group.id);
          return (
            <div key={group.id}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData(
                        "application/x-mobile-element",
                        JSON.stringify(item.build()),
                      );
                      e.dataTransfer.setData("text/plain", item.type);
                    }}
                    className="group flex flex-col gap-2 rounded-lg border border-border bg-background/60 hover:bg-accent hover:text-accent-foreground hover:border-primary/50 p-3 cursor-grab active:cursor-grabbing transition-colors"
                    title={`Drag to add ${item.label}`}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    <span className="text-xs font-medium leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg text-foreground ${className ?? ""}`}
      style={{ width: "100%", maxHeight: "70vh", display: "flex", flexDirection: "column" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border text-xs font-semibold uppercase tracking-wider"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Components
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="overflow-y-auto p-2 space-y-3">
          <p className="text-[10px] text-muted-foreground px-1 leading-snug">
            Drag any item onto the phone preview to add it to the current screen.
          </p>
          {GROUPS.map((group) => {
            const items = ITEMS.filter((i) => i.group === group.id);
            return (
              <div key={group.id}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(
                          "application/x-mobile-element",
                          JSON.stringify(item.build()),
                        );
                        e.dataTransfer.setData("text/plain", item.type);
                      }}
                      className="group flex flex-col items-start gap-1 rounded-md border border-border bg-background/60 hover:bg-accent hover:text-accent-foreground hover:border-primary/50 px-2 py-1.5 cursor-grab active:cursor-grabbing transition-colors"
                      title={`Drag to add ${item.label}`}
                    >
                      <item.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                      <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
