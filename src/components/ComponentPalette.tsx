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
} from "lucide-react";

type PaletteItem = {
  type: string;
  label: string;
  group: "primitive" | "basic" | "data";
  icon: React.ComponentType<{ className?: string }>;
  build: () => MElement;
};

const ITEMS: PaletteItem[] = [
  // Premium
  { type: "parallax-hero", label: "Parallax Hero", group: "primitive", icon: Sparkles, build: () => ({
    type: "parallax-hero",
    props: { title: "New Hero", subtitle: "Tap to edit", eyebrow: "FEATURED", height: 220 },
  } as MElement) },
  { type: "glass-card", label: "Glass Card", group: "primitive", icon: Layout, build: () => ({
    type: "glass-card",
    props: { title: "Glass Card", subtitle: "Frosted surface", tint: "primary", children: [] },
  } as MElement) },
  { type: "stat-card-xl", label: "Stat Card XL", group: "primitive", icon: BarChart3, build: () => ({
    type: "stat-card-xl",
    props: { label: "Revenue", value: "$12,480", delta: "+8.4%", deltaDirection: "up", sparkline: [4, 6, 5, 8, 7, 10, 12] },
  } as MElement) },
  { type: "feature-showcase", label: "Feature Showcase", group: "primitive", icon: Layout, build: () => ({
    type: "feature-showcase",
    props: { title: "New Feature", description: "Describe what makes it shine.", layout: "image-left", buttonLabel: "Learn more" },
  } as MElement) },
  { type: "testimonial", label: "Testimonial", group: "primitive", icon: Quote, build: () => ({
    type: "testimonial",
    props: { quote: "This product changed how my team ships.", name: "Alex Morgan", role: "Head of Product", rating: 5 },
  } as MElement) },
  { type: "pricing-card", label: "Pricing Card", group: "primitive", icon: CreditCard, build: () => ({
    type: "pricing-card",
    props: { name: "Pro", price: "$19", period: "/mo", features: ["Unlimited projects", "Priority support", "Custom domains"], buttonLabel: "Start trial", highlighted: true },
  } as MElement) },
  { type: "marquee", label: "Marquee", group: "primitive", icon: Megaphone, build: () => ({
    type: "marquee",
    props: { items: ["NEW DROP", "FREE SHIPPING", "LIMITED EDITION"], speed: "medium" },
  } as MElement) },
  { type: "hero-banner", label: "Hero Banner", group: "primitive", icon: ImageIcon, build: () => ({
    type: "hero-banner",
    props: { title: "Welcome", subtitle: "Get started in seconds", buttonLabel: "Continue" },
  } as MElement) },

  // Basics
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

  // Data
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
];

const GROUPS: Array<{ id: PaletteItem["group"]; label: string }> = [
  { id: "primitive", label: "Premium" },
  { id: "basic", label: "Basics" },
  { id: "data", label: "Data" },
];

export function ComponentPalette({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={`pointer-events-auto rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg text-foreground ${className ?? ""}`}
      style={{ width: 220, maxHeight: "70vh", display: "flex", flexDirection: "column" }}
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
                        // Plain-text fallback so Safari etc. fire onDrop reliably.
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
