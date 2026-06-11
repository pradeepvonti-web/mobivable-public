/**
 * Template Vault taxonomy — the archetype catalog the batch generator
 * (scripts/generate-templates.ts) turns into ready-to-use templates.
 *
 * 40 categories × 10 archetypes = 400 archetype specs. Each archetype is
 * generated ONCE (one-time AI spend) and stored in `app_templates`; users then
 * instantiate templates with ZERO AI credits. Combined with the 5 theme
 * variants applied at instantiation (TEMPLATE_THEME_VARIANTS), the vault
 * surfaces 400 × 5 = 2000 ready-to-use combinations.
 *
 * Keep descriptors concrete (screens + key features) — they become the
 * generation prompt via archetypePrompt().
 */

export interface ArchetypeSpec {
  /** Stable unique slug — used for idempotent seeding. */
  slug: string;
  name: string;
  category: string;
  tags: string[];
  /** One-line concrete description: main screens + signature features. */
  descriptor: string;
}

/** Theme variants applied at instantiation (keys of MOBILE_THEMES). */
export const TEMPLATE_THEME_VARIANTS = [
  "dark_midnight",
  "dark_neobank",
  "light_clean",
  "light_warm",
  "dark_luxury",
] as const;

const A = (
  category: string,
  slug: string,
  name: string,
  tags: string[],
  descriptor: string,
): ArchetypeSpec => ({ slug: `${category}-${slug}`, name, category, tags, descriptor });

export const TEMPLATE_TAXONOMY: ArchetypeSpec[] = [
  // ── Finance & Budgeting ─────────────────────────────────────────
  A("finance", "budget-tracker", "BudgetWise", ["budget", "expenses", "charts"], "Personal budget tracker: dashboard with income/expense totals and a donut chart by category, budget progress bars, transactions list, add-transaction form"),
  A("finance", "expense-splitter", "SplitEase", ["groups", "bills", "settle"], "Group expense splitter: groups list, group detail with member balances, add-expense with split options, settle-up flow"),
  A("finance", "savings-goals", "GoalStash", ["savings", "goals", "progress"], "Savings goals app: goal cards with progress rings, goal detail with contribution history, add-goal wizard, monthly summary"),
  A("finance", "subscription-tracker", "SubSentry", ["subscriptions", "renewals", "alerts"], "Subscription tracker: upcoming renewals timeline, monthly spend summary, subscription list with logos, add/edit subscription"),
  A("finance", "invoice-manager", "InvoiceKit", ["invoices", "clients", "payments"], "Freelancer invoice manager: invoice list with status badges, invoice detail, create-invoice form with line items, client list"),
  A("finance", "net-worth", "WorthWatch", ["assets", "net-worth", "charts"], "Net-worth dashboard: assets vs liabilities chart over time, account list grouped by type, add-account form, monthly change summary"),
  A("finance", "bill-reminders", "BillBell", ["bills", "reminders", "calendar"], "Bill reminder app: calendar of due dates, bills list with paid/unpaid states, bill detail with history, notification settings"),
  A("finance", "tip-calculator", "TipTap", ["calculator", "split", "quick"], "Tip calculator: single screen with bill input, tip percentage presets, per-person split stepper, rounded total display"),
  A("finance", "crypto-portfolio", "CoinDeck", ["crypto", "portfolio", "prices"], "Crypto portfolio: holdings list with live-style prices and 24h change, portfolio value chart, coin detail with sparkline, add-transaction"),
  A("finance", "receipt-vault", "ReceiptSafe", ["receipts", "scan", "categories"], "Receipt organizer: receipt grid by month, receipt detail with photo and amounts, category totals, add-receipt with camera"),

  // ── Fitness & Workouts ──────────────────────────────────────────
  A("fitness", "workout-log", "FitTrack Pro", ["workouts", "calories", "progress"], "Workout tracker: today dashboard with step/calorie rings, workout log list, exercise detail with sets/reps, weekly summary charts"),
  A("fitness", "running", "RunRhythm", ["running", "gps", "pace"], "Running companion: run history with distance/pace, run detail with route placeholder map and splits, weekly mileage chart, start-run screen"),
  A("fitness", "home-workouts", "HomeFit", ["hiit", "video", "plans"], "Home workout app: program list with difficulty badges, workout player screen with timer and exercise steps, schedule, progress stats"),
  A("fitness", "gym-pr", "LiftLedger", ["strength", "prs", "1rm"], "Strength PR tracker: lift list with current 1RM, lift detail with PR history chart, log-set screen, bodyweight tracker"),
  A("fitness", "yoga", "Asana Flow", ["yoga", "sessions", "calm"], "Yoga app: session library by style and duration, session player with pose steps, streak calendar, breathing exercise screen"),
  A("fitness", "step-challenge", "StepSquad", ["steps", "leaderboard", "social"], "Step challenge app: daily step ring, friends leaderboard, challenge list with join buttons, profile with badges"),
  A("fitness", "cycling", "PedalPath", ["cycling", "routes", "stats"], "Cycling log: ride history with elevation and speed, ride detail, monthly distance chart, bike maintenance checklist"),
  A("fitness", "stretching", "LimberUp", ["mobility", "routines", "timer"], "Stretching & mobility app: routine list by body area, guided routine player with hold timers, flexibility progress, daily reminder settings"),
  A("fitness", "swim-log", "LapBook", ["swimming", "laps", "sets"], "Swim tracker: session log with laps and stroke breakdown, session detail, monthly distance summary, pool-length settings"),
  A("fitness", "fitness-coach", "CoachCue", ["plans", "check-ins", "clients"], "Personal-trainer client app: assigned plan view, daily check-in form, progress photos grid, message-coach screen"),

  // ── Health & Wellness ───────────────────────────────────────────
  A("health", "habit-tracker", "HabitHive", ["habits", "streaks", "stats"], "Habit tracker: today checklist with streak flames, habit detail with completion calendar, weekly stats, add-habit with schedule picker"),
  A("health", "water-intake", "AquaLog", ["hydration", "reminders", "progress"], "Water intake tracker: daily progress ring with quick-add glasses, history list, weekly chart, reminder settings"),
  A("health", "sleep", "SleepScope", ["sleep", "trends", "bedtime"], "Sleep tracker: last-night summary with sleep-stage bars, sleep history chart, bedtime routine checklist, smart-alarm settings"),
  A("health", "meditation", "StillMind", ["meditation", "sessions", "calm"], "Meditation app: featured session cards, session player with ambient timer, streak calendar, mood check-in"),
  A("health", "calorie-counter", "KcalKeeper", ["nutrition", "macros", "diary"], "Calorie counter: daily diary grouped by meal, macro rings, food search with quick-add, weight trend chart"),
  A("health", "mood-journal", "MoodMosaic", ["mood", "journal", "insights"], "Mood journal: daily mood picker with note, mood calendar heatmap, insights screen with triggers, reminders"),
  A("health", "meds", "DoseDaily", ["medication", "schedule", "adherence"], "Medication reminder: today's doses with taken/skip actions, med list with schedules, adherence stats, refill alerts"),
  A("health", "fasting", "FastWindow", ["fasting", "timer", "stages"], "Intermittent fasting tracker: live fast timer with stage markers, fasting history, plan picker (16:8 etc.), weight log"),
  A("health", "therapy-journal", "InnerNotes", ["cbt", "journal", "prompts"], "Guided therapy journal: daily prompt cards, entry editor with feelings tags, entry history, progress reflections"),
  A("health", "cycle", "LunaCycle", ["cycle", "calendar", "symptoms"], "Cycle tracker: cycle calendar with phase colors, daily symptom log, predictions summary, insights screen"),

  // ── E-commerce & Shopping ───────────────────────────────────────
  A("ecommerce", "fashion-store", "ShopLux", ["store", "cart", "checkout"], "Fashion storefront: home with hero and product rails, product detail with size picker, cart, checkout flow with order confirmation"),
  A("ecommerce", "sneaker-drops", "KickQueue", ["sneakers", "drops", "countdown"], "Sneaker drop app: upcoming drops with countdowns, drop detail with sizes, raffle entry flow, my-entries list"),
  A("ecommerce", "grocery", "CartFresh", ["grocery", "lists", "delivery"], "Grocery shopping app: category grid, product list with quantity steppers, cart with substitutions, delivery slot picker"),
  A("ecommerce", "marketplace", "SwapSpot", ["listings", "chat", "sell"], "Second-hand marketplace: feed of listings with filters, listing detail with seller card, post-item flow with photos, chat inbox"),
  A("ecommerce", "wishlist", "WishWell", ["wishlist", "price-drops", "share"], "Universal wishlist: saved items grid with price badges, item detail with price history, collections, share-list screen"),
  A("ecommerce", "flash-deals", "DealDash", ["deals", "countdown", "categories"], "Flash deals app: live deals with countdown timers, deal detail with claimed progress bar, categories, my-orders"),
  A("ecommerce", "handmade", "CraftCorner", ["artisan", "shops", "favorites"], "Handmade goods market: curated collections, shop profile pages, product detail with maker story, favorites"),
  A("ecommerce", "digital-store", "PixelMart", ["digital", "downloads", "library"], "Digital products store: product grid (presets, templates), product detail with previews, purchase flow, my-library with downloads"),
  A("ecommerce", "refill", "ReOrder", ["essentials", "repeat", "subscriptions"], "Essentials reorder app: my-products grid with one-tap reorder, order history, subscription schedules, delivery tracking"),
  A("ecommerce", "bookstore", "PageTurn", ["books", "reviews", "store"], "Bookstore: discover screen with shelves, book detail with reviews and rating bars, reading list, checkout"),

  // ── Food & Cooking ──────────────────────────────────────────────
  A("food", "recipes", "PlateCraft", ["recipes", "steps", "favorites"], "Recipe app: discover feed with cuisine filters, recipe detail with ingredients checklist and step mode, favorites, shopping list"),
  A("food", "meal-planner", "WeekPlate", ["meal-prep", "calendar", "groceries"], "Meal planner: weekly calendar with meal slots, recipe picker, auto grocery list grouped by aisle, nutrition summary"),
  A("food", "restaurant-finder", "TableScout", ["restaurants", "reviews", "nearby"], "Restaurant discovery: nearby list with rating and price chips, restaurant detail with menu highlights and hours, saved spots, review composer"),
  A("food", "coffee-log", "BrewBook", ["coffee", "brews", "ratings"], "Coffee brewing journal: brew log with method and ratio, bean library with roaster notes, brew timer with steps, taste ratings"),
  A("food", "food-delivery", "DishDart", ["delivery", "cart", "tracking"], "Food delivery app: restaurant list with ETAs, menu with item modifiers, cart and checkout, live order tracking screen"),
  A("food", "baking", "ProofBox", ["baking", "recipes", "timers"], "Baking companion: recipe cards with hydration percentages, scaled-ingredient calculator, multi-stage proof timers, bake gallery"),
  A("food", "wine-cellar", "CorkNotes", ["wine", "cellar", "tastings"], "Wine cellar app: bottle inventory with vintage filters, bottle detail with tasting notes, wishlist, pairing suggestions screen"),
  A("food", "cocktails", "ShakerList", ["cocktails", "ingredients", "bar"], "Cocktail recipe app: browse by spirit, recipe detail with ratios and glassware, my-bar inventory matching, favorites"),
  A("food", "lunch-roulette", "BiteSpin", ["random", "groups", "quick"], "Lunch decision app: spin-wheel picker from saved spots, group vote screen, place detail, history of picks"),
  A("food", "diet-filter", "CleanPlate", ["allergens", "scanner", "diets"], "Dietary filter app: product checker with allergen flags, safe-foods list by diet, scan-history, profile with restrictions"),

  // ── Productivity & Tasks ────────────────────────────────────────
  A("productivity", "todo", "TaskTide", ["tasks", "projects", "today"], "To-do app: today list with priorities, project boards, task detail with subtasks and due dates, completed stats"),
  A("productivity", "kanban", "FlowBoard", ["kanban", "columns", "teams"], "Kanban board app: board list, column view with draggable-style cards, card detail with checklist and labels, activity feed"),
  A("productivity", "pomodoro", "FocusForge", ["pomodoro", "timer", "stats"], "Focus timer: pomodoro timer with session ring, task picker for sessions, daily focus stats, settings with intervals"),
  A("productivity", "notes", "NoteNest", ["notes", "folders", "search"], "Notes app: notebook list, note editor with formatting toolbar, pinned notes, full-text search screen"),
  A("productivity", "time-tracker", "HourGlassr", ["time", "clients", "reports"], "Time tracking app: running timer with project picker, timesheet by day, weekly report chart, client/project management"),
  A("productivity", "goals-okr", "NorthStar", ["okrs", "key-results", "check-ins"], "Personal OKR app: objective cards with progress, key-result detail with check-in history, quarterly review screen, archive"),
  A("productivity", "reading-list", "ShelfLater", ["articles", "queue", "tags"], "Read-later app: article queue with reading-time estimates, reader view, tags and favorites, weekly reading stats"),
  A("productivity", "voice-memos", "EchoPad", ["voice", "transcripts", "folders"], "Voice memo app: recording screen with waveform, memo list with durations, memo detail with transcript placeholder, folders"),
  A("productivity", "day-planner", "DayDeck", ["schedule", "timeblock", "agenda"], "Time-blocking day planner: timeline view with blocks, quick-add block sheet, daily agenda summary, templates for routines"),
  A("productivity", "password-vault", "KeyKeep", ["vault", "secure", "categories"], "Password manager UI: vault list grouped by category, entry detail with reveal toggles, add-entry form, security audit screen"),

  // ── Social & Community ──────────────────────────────────────────
  A("social", "community-feed", "SocialConnect", ["feed", "posts", "profiles"], "Community app: home feed with like/comment actions, post composer, user profiles with follower stats, notifications"),
  A("social", "interest-groups", "CircleUp", ["groups", "events", "chat"], "Interest groups app: discover groups grid, group page with posts and events, member list, group chat"),
  A("social", "qa-forum", "AnswerHive", ["questions", "votes", "topics"], "Q&A forum: question feed with vote counts, question detail with answers, ask-question composer, topic following"),
  A("social", "photo-sharing", "LensLoop", ["photos", "stories", "explore"], "Photo sharing app: photo feed, story-style highlights row, explore grid, profile gallery with edit screen"),
  A("social", "local-events", "BlockParty", ["events", "rsvp", "nearby"], "Neighborhood events app: nearby events list with date chips, event detail with RSVP, create-event flow, my-events calendar"),
  A("social", "book-club", "ChapterChat", ["books", "clubs", "discussions"], "Book club app: club home with current read progress, discussion threads by chapter, meeting scheduler, member shelf"),
  A("social", "pen-pals", "InkPals", ["letters", "matches", "slow"], "Slow-messaging pen pal app: pal matches with shared interests, letter composer with delivery delay, letterbox inbox, profile"),
  A("social", "creator-fans", "FanForge", ["creators", "posts", "tiers"], "Creator fan app: creator feed with locked/unlocked posts, membership tier cards, direct messages, creator about page"),
  A("social", "polls", "PulsePoll", ["polls", "votes", "results"], "Polling app: trending polls feed, poll detail with animated result bars, create-poll flow, my-polls dashboard"),
  A("social", "alumni", "AlumNet", ["alumni", "directory", "jobs"], "Alumni network: member directory with class filters, member profile, job board, reunion events"),

  // ── Education & Learning ────────────────────────────────────────
  A("education", "flashcards", "RecallDeck", ["flashcards", "srs", "decks"], "Flashcard app: deck list with due counts, study session with flip cards and grading buttons, deck editor, retention stats"),
  A("education", "language", "LingoLeap", ["language", "lessons", "streak"], "Language learning app: lesson path with units, exercise screen with multiple-choice and typing, streak and XP header, profile with league"),
  A("education", "course-player", "LearnLane", ["courses", "videos", "progress"], "Course platform: enrolled courses with progress bars, lesson player with chapters, quiz screen, certificates"),
  A("education", "exam-prep", "PrepPilot", ["quizzes", "mock-exams", "weak-areas"], "Exam prep app: subject dashboard with readiness score, timed mock exam screen, question review with explanations, weak-areas drilldown"),
  A("education", "kids-math", "NumberNinjas", ["kids", "math", "games"], "Kids math practice: world map of levels, game-style problem screen with hearts, sticker rewards, parent progress view"),
  A("education", "coding", "CodeSteps", ["coding", "challenges", "hints"], "Learn-to-code app: track list (JS, Python), challenge screen with code snippet blocks, hint sheet, completion badges"),
  A("education", "study-planner", "CramCal", ["study", "schedule", "subjects"], "Study planner: subject list with upcoming exams, study session scheduler, revision checklist, focus stats"),
  A("education", "trivia", "QuizClash", ["trivia", "multiplayer", "categories"], "Trivia quiz app: category grid, head-to-head match screen with timers, round results, leaderboard"),
  A("education", "music-theory", "ChordWise", ["music", "lessons", "ear-training"], "Music theory tutor: lesson modules, interactive exercise screen (intervals, chords), ear-training quiz, daily practice streak"),
  A("education", "skill-tracker", "MasteryMap", ["skills", "hours", "milestones"], "Skill mastery tracker: skill cards with hour counters, practice log, milestone timeline, weekly review"),

  // ── Travel & Places ─────────────────────────────────────────────
  A("travel", "trip-planner", "RoamReady", ["itinerary", "days", "bookings"], "Trip planner: trips list with cover photos, day-by-day itinerary builder, booking cards (flight/hotel), packing checklist"),
  A("travel", "city-guide", "UrbanAtlas", ["guides", "spots", "maps"], "City guide: curated spot collections, spot detail with photos and tips, saved places, neighborhood explorer"),
  A("travel", "flight-tracker", "GateGazer", ["flights", "status", "alerts"], "Flight tracker: my flights with live status chips, flight detail with timeline (gate, boarding), add-flight search, alerts settings"),
  A("travel", "packing", "PackPerfect", ["packing", "lists", "templates"], "Packing list app: trip lists with progress, smart category checklist, templates by trip type, shared lists"),
  A("travel", "travel-journal", "WanderLog", ["journal", "photos", "map"], "Travel journal: entries timeline with photos, entry composer with location tag, trip map view placeholder, yearly recap"),
  A("travel", "road-trip", "MilePost", ["roadtrip", "stops", "fuel"], "Road trip app: route stops list with drive times, stop detail, fuel/expense log, trip stats dashboard"),
  A("travel", "hostel-budget", "BackpackBase", ["budget", "hostels", "currency"], "Backpacker budget app: daily spend tracker with currency converter, country budgets, accommodation list, trip summary"),
  A("travel", "loyalty-miles", "MileMaven", ["miles", "points", "cards"], "Travel points tracker: program balances dashboard, earning history, redemption goals, card benefits list"),
  A("travel", "weekend-ideas", "EscapeHatch", ["getaways", "ideas", "saved"], "Weekend getaway ideas: destination cards by drive time, destination detail with itinerary, saved escapes, seasonal picks"),
  A("travel", "campervan", "VanVenture", ["camping", "spots", "checklists"], "Campervan companion: campsite list with amenities icons, site detail, van maintenance checklist, trip log"),

  // ── On-demand & Services ────────────────────────────────────────
  A("services", "home-cleaning", "SparkleBook", ["booking", "cleaners", "schedule"], "Home cleaning booking: service picker with pricing, cleaner profiles with ratings, booking flow with time slots, upcoming bookings"),
  A("services", "handyman", "FixFinder", ["repairs", "quotes", "jobs"], "Handyman app: service categories, request-a-quote flow with photos, pro profiles, job status tracker"),
  A("services", "laundry", "FoldFast", ["laundry", "pickup", "tracking"], "Laundry pickup app: order builder with garment counts, pickup/delivery scheduler, order tracking timeline, pricing list"),
  A("services", "car-wash", "ShineStop", ["carwash", "packages", "membership"], "Mobile car wash: package cards with comparisons, booking flow with vehicle picker, membership plan screen, wash history"),
  A("services", "pet-sitting", "SitSpot", ["pets", "sitters", "bookings"], "Pet sitting marketplace: sitter list with badges, sitter profile with reviews, booking request flow, message thread"),
  A("services", "tutoring", "TutorLink", ["tutors", "sessions", "subjects"], "Tutoring marketplace: tutor cards by subject, tutor profile with availability calendar, book-session flow, my sessions"),
  A("services", "moving", "HaulHelp", ["moving", "inventory", "quotes"], "Moving helper app: inventory builder by room, quote comparison, moving-day checklist, crew tracking screen"),
  A("services", "beauty", "GlowGo", ["salon", "stylists", "appointments"], "Beauty booking: service menu with durations, stylist gallery, appointment picker, loyalty punch card"),
  A("services", "lawn-care", "TurfTamer", ["lawn", "visits", "plans"], "Lawn care app: service plan cards, visit schedule with before/after photos, property profile, invoices"),
  A("services", "errands", "DashDo", ["errands", "runners", "tasks"], "Errand runner app: post-an-errand flow, runner matches with ETAs, live task status, payment summary"),

  // ── Real Estate & Home ──────────────────────────────────────────
  A("realestate", "home-search", "NestQuest", ["listings", "filters", "tours"], "Real estate search: listing feed with price/bed filters, listing detail with photo carousel and facts grid, saved homes, schedule-tour flow"),
  A("realestate", "rental-manager", "LeaseLedger", ["rentals", "tenants", "rent"], "Landlord app: property cards with occupancy, tenant list with lease dates, rent payment tracker, maintenance requests"),
  A("realestate", "roommate", "PadPals", ["roommates", "matches", "chat"], "Roommate finder: profile cards with compatibility scores, filters (budget, habits), match chat, my listing editor"),
  A("realestate", "renovation", "RenoTrack", ["projects", "budget", "contractors"], "Renovation tracker: project boards by room, budget vs actual chart, contractor contacts, progress photo timeline"),
  A("realestate", "open-house", "DoorList", ["open-houses", "notes", "compare"], "Open house companion: visit schedule, house scorecard with notes and photos, side-by-side compare screen, agent contacts"),
  A("realestate", "moving-in", "FreshNest", ["checklist", "utilities", "setup"], "New home setup: move-in checklist by week, utilities setup tracker, address-change list, home documents vault"),
  A("realestate", "mortgage", "LoanLens", ["mortgage", "calculator", "rates"], "Mortgage helper: payment calculator with sliders, amortization chart, saved scenarios compare, pre-approval checklist"),
  A("realestate", "home-inventory", "HavenList", ["inventory", "rooms", "insurance"], "Home inventory: room-by-room item grid with values, item detail with receipts, total coverage summary, export screen"),
  A("realestate", "hoa", "BlockBoard", ["hoa", "announcements", "dues"], "HOA community app: announcements feed, dues payment status, amenity booking, issue reporting"),
  A("realestate", "vacation-rental", "StayHost", ["hosting", "calendar", "guests"], "Vacation rental host app: booking calendar, guest message inbox, turnover task checklist, earnings dashboard"),

  // ── Dating & Relationships ──────────────────────────────────────
  A("dating", "swipe", "SparkMatch", ["swipe", "matches", "chat"], "Dating app: swipeable profile cards, matches grid, chat with icebreaker prompts, profile editor with photo manager"),
  A("dating", "slow-dating", "SlowBloom", ["curated", "daily", "depth"], "Curated daily-match dating: one daily match card with deep profile, question-prompt answers, conversation screen, preferences"),
  A("dating", "couples", "TwoGather", ["couples", "dates", "shared"], "Couples app: shared date-idea deck, countdown to next date, shared lists and notes, anniversary timeline"),
  A("dating", "date-night", "NightOwl", ["ideas", "spinner", "bookings"], "Date night planner: idea generator wheel, curated date packs by vibe, planned dates calendar, memory journal"),
  A("dating", "long-distance", "BridgeHearts", ["ldr", "timezones", "rituals"], "Long-distance couple app: dual time-zone clocks, shared daily question, visit countdown, photo exchange feed"),
  A("dating", "friend-finder", "PalQuest", ["friends", "activities", "groups"], "Platonic friend finder: activity-based matching cards, hangout proposals, group meetups, chat"),
  A("dating", "icebreakers", "BanterBox", ["questions", "games", "party"], "Conversation games app: question deck categories, party game mode with turns, favorites, custom deck builder"),
  A("dating", "profile-coach", "GlowProfile", ["profile", "feedback", "tips"], "Dating profile coach: profile audit checklist, photo rating cards, bio rewrite suggestions screen, progress tracker"),
  A("dating", "speed-events", "MinglePop", ["events", "rounds", "matches"], "Speed dating events: upcoming events list, event lobby with round timer, match selections screen, mutual match reveals"),
  A("dating", "memory-book", "UsArchive", ["memories", "milestones", "photos"], "Relationship memory book: milestone timeline, memory entries with photos, monthly highlights, shared bucket list"),

  // ── Events & Tickets ────────────────────────────────────────────
  A("events", "discovery", "VibeFinder", ["events", "tickets", "nearby"], "Event discovery: tonight/this-week feed with category chips, event detail with lineup and venue map placeholder, ticket selection, my tickets wallet"),
  A("events", "wedding", "AisleReady", ["wedding", "rsvp", "checklist"], "Wedding planner: countdown dashboard, guest list with RSVP states, vendor checklist with budgets, day-of timeline"),
  A("events", "party-rsvp", "FetePage", ["invites", "rsvp", "updates"], "Party invite app: event page builder, RSVP tracking with +1s, announcements thread, photo album"),
  A("events", "conference", "SummitPass", ["agenda", "speakers", "networking"], "Conference companion: agenda by track with bookmarking, speaker directory, attendee networking cards, venue map placeholder"),
  A("events", "festival", "FestMate", ["lineup", "schedule", "friends"], "Festival app: lineup grid by stage/day, my schedule with conflicts, friend finder pin board, festival info screen"),
  A("events", "ticket-resale", "SeatSwap", ["resale", "listings", "transfer"], "Ticket resale: event search, listing cards with seat detail, secure-transfer flow, my listings and sales"),
  A("events", "meetups", "GatherRound", ["meetups", "groups", "calendar"], "Meetup organizer: group page with upcoming events, event detail with attendee list, create-event flow, attendance streaks"),
  A("events", "kids-parties", "PartyPals", ["kids", "themes", "planning"], "Kids party planner: theme gallery, party checklist with timeline, guest RSVP tracker, vendor shortlist"),
  A("events", "fundraisers", "GalaGo", ["charity", "auctions", "donations"], "Fundraiser event app: event page with goal thermometer, silent-auction item bids, donation flow, sponsor wall"),
  A("events", "sports-tickets", "StadiumPass", ["games", "seats", "teams"], "Sports ticket app: team schedule with home/away, seat-map section picker placeholder, ticket wallet with QR, game-day info"),

  // ── Pets ────────────────────────────────────────────────────────
  A("pets", "pet-care", "PawPlanner", ["pets", "care", "reminders"], "Pet care app: pet profiles with photos, care schedule (feeding, walks, meds), vet visit log, weight chart"),
  A("pets", "dog-walking", "WalkWag", ["walks", "gps", "streaks"], "Dog walk tracker: walk timer with distance, walk history with routes placeholder, streak calendar, multiple dog profiles"),
  A("pets", "training", "GoodBoyGuide", ["training", "tricks", "progress"], "Dog training app: skill modules with step-by-step lessons, practice session logger, progress badges, clicker screen"),
  A("pets", "pet-social", "FurFeed", ["photos", "profiles", "community"], "Pet social network: pet photo feed, pet profile pages, breed communities, paw-mail messages"),
  A("pets", "adoption", "HomeFur", ["adoption", "shelters", "applications"], "Pet adoption: adoptable pet cards with filters, pet detail with shelter info, application form flow, favorites"),
  A("pets", "cat-health", "WhiskerWatch", ["cats", "health", "litter"], "Cat health tracker: daily log (food, water, litter), symptom notes, vet records vault, weight trend"),
  A("pets", "aquarium", "TankTender", ["aquarium", "water-tests", "schedule"], "Aquarium manager: tank dashboards with parameter charts, water test logger, maintenance schedule, livestock list"),
  A("pets", "bird-watching", "PerchSpot", ["birding", "sightings", "lifelist"], "Birdwatching log: sighting recorder with species search, life list with badges, local hotspots, monthly recap"),
  A("pets", "pet-food", "BowlBalance", ["nutrition", "portions", "brands"], "Pet nutrition app: portion calculator by weight/age, food diary, brand comparison cards, treat budget tracker"),
  A("pets", "horse-care", "StableMate", ["horses", "schedule", "records"], "Horse care manager: horse profiles, feeding/farrier/vet schedule, training log, competition records"),

  // ── Music & Audio ───────────────────────────────────────────────
  A("music", "practice-log", "WoodshedPro", ["practice", "instruments", "goals"], "Music practice tracker: practice timer with focus areas, session history, repertoire list with mastery levels, weekly goals"),
  A("music", "setlists", "GigSheet", ["setlists", "bands", "shows"], "Band setlist manager: setlist builder with drag-style ordering, song library with keys/BPM, show schedule, lyrics viewer"),
  A("music", "podcast", "PodPace", ["podcasts", "queue", "discover"], "Podcast player: subscriptions grid, episode queue with progress bars, player screen with speed controls, discover by category"),
  A("music", "vinyl", "WaxStacks", ["vinyl", "collection", "wishlist"], "Vinyl collection app: record grid by artist, record detail with pressing info, wishlist, collection value stats"),
  A("music", "ear-trainer", "PitchPath", ["ear-training", "exercises", "levels"], "Ear training app: exercise categories (intervals, chords, rhythm), drill screen with instant feedback, daily streak, accuracy stats"),
  A("music", "lyrics-ideas", "VerseVault", ["songwriting", "ideas", "demos"], "Songwriter notebook: idea capture (lyrics, voice memos), song drafts with sections, rhyme workspace, demo recordings list"),
  A("music", "concert-log", "EncoreDiary", ["concerts", "memories", "stats"], "Concert diary: attended shows timeline with photos, show detail with setlist notes, artist stats, upcoming shows wishlist"),
  A("music", "dj-crates", "CrateDigger", ["dj", "tracks", "sets"], "DJ crate organizer: track library with BPM/key tags, crate builder, set planner with transitions notes, gig history"),
  A("music", "choir", "HarmonyHub", ["choir", "parts", "rehearsals"], "Choir app: repertoire with part tracks, rehearsal schedule with RSVPs, announcements, attendance records"),
  A("music", "instrument-learn", "FretFlow", ["guitar", "chords", "lessons"], "Guitar learning app: chord library with diagrams, lesson path, practice backing tracks list, chord-change drill timer"),

  // ── Photo & Video ───────────────────────────────────────────────
  A("photo", "photo-challenges", "ShotPrompt", ["challenges", "daily", "gallery"], "Photo challenge app: daily prompt card, submission gallery with votes, streak tracker, my portfolio"),
  A("photo", "family-album", "KinFrame", ["family", "albums", "sharing"], "Private family album: shared albums grid, photo detail with comments, auto monthly recaps, invite family flow"),
  A("photo", "photo-organizer", "SnapSort", ["organize", "duplicates", "albums"], "Photo organizer: swipe keep/delete cleaner, album manager, duplicates finder results, storage stats"),
  A("photo", "presets", "ToneCraft", ["filters", "presets", "editing"], "Preset marketplace UI: preset packs with before/after sliders, pack detail, my presets library, creator profiles"),
  A("photo", "video-journal", "ReelDiary", ["video", "journal", "memories"], "One-second-a-day video journal: daily clip recorder, month timeline grid, compiled recap player, reminders"),
  A("photo", "portfolio", "FrameFolio", ["portfolio", "clients", "galleries"], "Photographer portfolio: project galleries, client proofing screen with selects, booking inquiries inbox, pricing packages"),
  A("photo", "scan-docs", "SheetScan", ["scanner", "documents", "folders"], "Document scanner UI: scan screen with edge guides, document library with folders, OCR text view placeholder, export options"),
  A("photo", "wallpapers", "WallWonder", ["wallpapers", "collections", "daily"], "Wallpaper app: curated daily picks, category browsing, preview-on-device screen, favorites"),
  A("photo", "photo-books", "PagePress", ["albums", "print", "layouts"], "Photo book builder: book projects, page layout editor with templates, photo picker, order summary"),
  A("photo", "astro", "StarShot", ["astrophotography", "conditions", "log"], "Astrophotography planner: shoot conditions dashboard (moon, clouds), target list, shot log with settings, location bookmarks"),

  // ── Sports & Scores ─────────────────────────────────────────────
  A("sports", "scores", "ScoreStream", ["live", "scores", "leagues"], "Live scores app: today's games with live chips, game detail with stats and play feed, standings tables, my teams"),
  A("sports", "fantasy", "DraftDen", ["fantasy", "lineup", "matchups"], "Fantasy sports app: my team lineup with projections, weekly matchup screen, waiver wire list, league standings"),
  A("sports", "pickup-games", "CourtCall", ["pickup", "games", "join"], "Pickup sports app: nearby games map-list, game detail with player slots, create-game flow, player profiles with skill levels"),
  A("sports", "golf", "FairwayNotes", ["golf", "scorecard", "stats"], "Golf companion: digital scorecard, round history with handicap trend, course notes, stats screen (FIR, GIR, putts)"),
  A("sports", "tennis-ladder", "BaselineClub", ["tennis", "ladder", "matches"], "Tennis club ladder: rankings list, challenge flow, match result reporting, head-to-head records"),
  A("sports", "martial-arts", "DojoTrack", ["bjj", "classes", "techniques"], "Martial arts journal: class log with techniques drilled, belt progress timeline, technique library with notes, attendance streak"),
  A("sports", "ski", "PowderPal", ["skiing", "resorts", "season"], "Ski season app: resort conditions cards, day log with vertical and runs, season stats dashboard, trip planning"),
  A("sports", "bowling", "PinPal", ["bowling", "scores", "leagues"], "Bowling tracker: frame-by-frame score entry, game history with averages, league night schedule, ball arsenal list"),
  A("sports", "climbing", "CragLog", ["climbing", "routes", "grades"], "Climbing logbook: session log with routes and grades, project tracker with attempts, gym/crag list, grade pyramid chart"),
  A("sports", "youth-team", "SquadSync", ["teams", "schedule", "carpool"], "Youth team manager: game/practice schedule with availability, roster with positions, carpool coordination, team announcements"),

  // ── News & Reading ──────────────────────────────────────────────
  A("news", "briefing", "DailyDigest", ["news", "briefing", "topics"], "Morning briefing app: top stories digest, topic following, story reader view, daily streak with read stats"),
  A("news", "rss", "FeedScout", ["rss", "sources", "folders"], "RSS reader: source folders with unread counts, article list with previews, reader mode, saved articles"),
  A("news", "newsletter", "LetterBoxd", ["newsletters", "inbox", "discover"], "Newsletter reader: subscription inbox grouped by sender, issue reader, discover directory, read-later queue"),
  A("news", "local", "TownTattler", ["local", "community", "alerts"], "Local news app: neighborhood story feed, events and alerts tabs, story detail with comments, submit-a-tip form"),
  A("news", "tech", "StackSignal", ["tech", "trending", "comments"], "Tech news aggregator: trending feed with points and comment counts, story discussion view, topic filters, weekend digest"),
  A("news", "long-reads", "SlowStory", ["longform", "queue", "highlights"], "Longform reading app: curated weekly long reads, reader with progress and highlights, highlight library, reading time stats"),
  A("news", "markets", "TickerTape", ["markets", "watchlist", "news"], "Markets news app: watchlist with price chips, ticker detail with news feed and chart, market movers, alerts"),
  A("news", "science", "LabReport", ["science", "studies", "explainers"], "Science news app: discoveries feed by field, explainer detail with key takeaways, save-to-collection, weekly quiz"),
  A("news", "audio-news", "EarWire", ["audio", "briefings", "playlists"], "Audio news app: daily briefing player, story playlist queue, source picker, listening history"),
  A("news", "fact-check", "TruthLens", ["fact-check", "claims", "ratings"], "Fact-check app: trending claims with verdict badges, claim detail with sources, search claims, submit-a-claim"),

  // ── Business & CRM ──────────────────────────────────────────────
  A("business", "crm", "LeadLoom", ["crm", "pipeline", "contacts"], "Mobile CRM: pipeline kanban by stage, contact detail with activity timeline, add-deal flow, monthly revenue forecast"),
  A("business", "inventory", "StockSense", ["inventory", "skus", "alerts"], "Inventory manager: product list with stock levels and low-stock badges, item detail with movement history, stock-take screen, reorder alerts"),
  A("business", "field-service", "RouteServe", ["jobs", "dispatch", "checklists"], "Field service app: today's job route list, job detail with checklist and photo proof, customer signature screen, timesheet"),
  A("business", "pos-lite", "TillTap", ["pos", "orders", "products"], "Point-of-sale UI: product grid with cart, charge screen with tender options, order history, daily sales summary"),
  A("business", "appointments", "SlotMaster", ["booking", "calendar", "clients"], "Appointment manager: day/week calendar, client booking detail, service menu editor, no-show and revenue stats"),
  A("business", "team-standup", "SyncDaily", ["standups", "updates", "blockers"], "Async standup app: daily update composer (did/doing/blocked), team feed, blocker board, participation streaks"),
  A("business", "expenses", "ReimburseIt", ["expenses", "receipts", "approval"], "Business expense app: expense submission with receipt photo, approval queue for managers, report builder, policy limits screen"),
  A("business", "queue", "LineLogic", ["queue", "tickets", "waitlist"], "Customer queue manager: live queue with called/waiting states, ticket kiosk screen, wait-time stats, SMS-style notify log"),
  A("business", "loyalty-punch", "StampStation", ["loyalty", "rewards", "customers"], "Small-business loyalty: customer punch cards, reward catalog, scan-to-stamp screen, campaign stats"),
  A("business", "contractors-quotes", "BidBuilder", ["quotes", "jobs", "invoices"], "Contractor quoting: quote builder with line items and margins, job pipeline, quote-to-invoice conversion, client list"),

  // ── Kids & Family ───────────────────────────────────────────────
  A("family", "chores", "ChoreChamps", ["chores", "kids", "rewards"], "Family chore app: kid profiles with point balances, chore board with photo proof, reward store, weekly family leaderboard"),
  A("family", "allowance", "PiggyPath", ["allowance", "savings", "kids"], "Kids allowance app: balance dashboard with save/spend/give jars, earn tasks list, savings goals with progress, parent approvals"),
  A("family", "baby-log", "TinyTracks", ["baby", "feeding", "sleep"], "Newborn tracker: feed/sleep/diaper quick-log buttons, daily timeline, growth charts, caregiver handoff notes"),
  A("family", "co-parenting", "BridgeCal", ["custody", "calendar", "expenses"], "Co-parenting app: custody calendar with exchanges, shared expense ledger, messages with tone-check hint, kid info vault"),
  A("family", "meal-votes", "DinnerBell", ["family", "meals", "votes"], "Family dinner app: weekly menu proposals with votes, recipe box, grocery list, cooking duty rotation"),
  A("family", "screen-time", "PixelPact", ["screen-time", "limits", "earning"], "Screen-time agreement app: daily allowance meters per kid, earn-time tasks, request/approve flow, weekly report"),
  A("family", "family-tree", "RootsKeeper", ["genealogy", "tree", "stories"], "Family tree app: interactive tree browser, person profiles with photos and stories, memory prompts, relative birthdays"),
  A("family", "babysitter", "SitterSheet", ["babysitting", "info", "schedule"], "Babysitter info app: kid care cards (allergies, routines), emergency contacts, activity log for parents, payment summary"),
  A("family", "milestones", "GrowGlow", ["milestones", "photos", "memories"], "Child milestone tracker: milestone checklist by age, photo memories timeline, monthly letters, share-with-family"),
  A("family", "calendar", "HomeBaseCal", ["family", "calendar", "lists"], "Shared family calendar: color-coded member events, weekly agenda, shared shopping/todo lists, location check-ins"),

  // ── Faith & Spirituality ────────────────────────────────────────
  A("faith", "devotional", "DailyManna", ["devotional", "verses", "streak"], "Daily devotional: verse-of-the-day card, reading plan progress, journal reflections, prayer streak"),
  A("faith", "prayer-list", "IntercedeApp", ["prayer", "requests", "answered"], "Prayer list app: request cards with categories, answered-prayer archive with testimonies, prayer timer, group sharing"),
  A("faith", "bible-study", "ScriptureScope", ["study", "notes", "plans"], "Bible study app: book/chapter navigation, verse highlighting and notes, study plans, bookmarks"),
  A("faith", "church-home", "ParishApp", ["church", "events", "giving"], "Church community app: announcements feed, sermon library player, event signups, giving screen"),
  A("faith", "meditation-east", "ZenPath", ["mindfulness", "mantras", "timers"], "Mindfulness practice app: guided practice library, mantra counter with beads UI, practice streak, teacher quotes"),
  A("faith", "quran", "AyahDaily", ["quran", "recitation", "tracker"], "Quran companion: surah navigation with audio placeholders, daily ayah card, memorization tracker, prayer times screen"),
  A("faith", "gratitude", "GraceNotes", ["gratitude", "journal", "prompts"], "Gratitude journal: three-things daily entry, gratitude jar visualization, prompt packs, monthly look-back"),
  A("faith", "fasting-faith", "LentLight", ["fasting", "seasons", "community"], "Faith fasting app: fast commitment cards, season calendar (Lent, Ramadan), daily encouragement, group accountability"),
  A("faith", "youth-group", "FlockUp", ["youth", "events", "check-in"], "Youth group app: event schedule with parent permission states, check-in screen, small-group rosters, photo wall"),
  A("faith", "sermon-notes", "PewNotes", ["sermons", "notes", "series"], "Sermon notes app: note editor with scripture inserts, series organization, speaker library, shareable note cards"),

  // ── Cars & Auto ─────────────────────────────────────────────────
  A("auto", "maintenance", "WrenchLog", ["maintenance", "service", "reminders"], "Car maintenance log: vehicle dashboard with upcoming services, service history with costs, mileage tracker, document vault"),
  A("auto", "fuel", "PumpTrack", ["fuel", "mpg", "costs"], "Fuel tracker: fill-up logger, MPG trend chart, monthly fuel spend, station price notes"),
  A("auto", "car-shopping", "AutoScout", ["shopping", "compare", "test-drives"], "Car shopping companion: shortlist cards with specs, side-by-side compare, test-drive checklist with notes, dealer contacts"),
  A("auto", "detailing", "GlossGarage", ["detailing", "products", "schedule"], "Car detailing app: wash/detail schedule, product inventory with ratings, before/after gallery, technique guides"),
  A("auto", "road-assist", "CurbSide", ["assistance", "requests", "status"], "Roadside assistance UI: one-tap help request (tow, battery, flat), live provider status timeline, vehicle profiles, service history"),
  A("auto", "ev-charging", "VoltVenture", ["ev", "charging", "range"], "EV companion: charge status dashboard, charging session log with costs, station bookmarks, trip range planner"),
  A("auto", "classic-car", "GarageGold", ["classic", "restoration", "parts"], "Classic car restoration: project task board by system, parts sourcing list with status, expense tracker, build photo diary"),
  A("auto", "motorcycle", "ThrottleNotes", ["moto", "rides", "gear"], "Motorcycle app: ride log with routes and weather, gear locker with mileage, maintenance schedule, riding-season stats"),
  A("auto", "parking", "SpotSaver", ["parking", "timers", "history"], "Parking helper: save-my-spot with photo and note, meter timer with alerts, parking history, garage favorites"),
  A("auto", "fleet-lite", "FleetFocus", ["fleet", "vehicles", "drivers"], "Small fleet manager: vehicle list with status chips, driver assignments, inspection checklists, cost dashboard"),

  // ── Gardening & Outdoors ────────────────────────────────────────
  A("garden", "plant-care", "LeafLove", ["plants", "watering", "care"], "Houseplant care: plant gallery with health badges, care schedule (water, fertilize), plant detail with care guide, growth photo timeline"),
  A("garden", "vegetable", "PatchPlanner", ["vegetables", "beds", "harvest"], "Vegetable garden planner: bed layout grid, planting calendar by crop, task list by week, harvest log with weights"),
  A("garden", "plant-id", "FloraFind", ["identify", "collection", "notes"], "Plant identification companion: capture screen, identified-plants collection, species detail with care needs, location notes"),
  A("garden", "composting", "RotRight", ["compost", "ratios", "turns"], "Composting app: bin dashboards with temperature logs, green/brown ratio guide, turn schedule, harvest tracker"),
  A("garden", "landscape", "YardCanvas", ["landscaping", "projects", "zones"], "Landscape project app: yard zone cards, project plans with budgets, plant wishlist by sun needs, seasonal task calendar"),
  A("garden", "foraging", "WildBasket", ["foraging", "seasons", "spots"], "Foraging journal: seasonal species guide, find log with private spots, identification checklists, recipe ideas"),
  A("garden", "beekeeping", "HiveMinder", ["bees", "inspections", "harvest"], "Beekeeping log: hive cards with health status, inspection checklist forms, treatment schedule, honey harvest records"),
  A("garden", "chickens", "CoopKeeper", ["chickens", "eggs", "flock"], "Backyard chicken app: egg count tracker with charts, flock roster with breeds, coop task schedule, expense vs egg-value"),
  A("garden", "trails", "TrailTrek", ["hiking", "trails", "log"], "Hiking log: trail wishlist with difficulty, hike log with photos and conditions, gear checklist, yearly stats"),
  A("garden", "weather-garden", "SkySow", ["weather", "frost", "planting"], "Garden weather app: frost alerts dashboard, planting windows by crop, rain log, microclimate notes"),

  // ── Crypto & Web3 ───────────────────────────────────────────────
  A("crypto", "wallet-ui", "VaultView", ["wallet", "tokens", "activity"], "Crypto wallet UI: token balances with fiat values, send/receive flow screens, transaction activity feed, address book"),
  A("crypto", "dca-tracker", "StackSats", ["dca", "bitcoin", "schedule"], "DCA tracker: recurring buy schedule, cost-basis dashboard with average price, stacking history chart, milestone badges"),
  A("crypto", "nft-gallery", "MintShelf", ["nft", "gallery", "collections"], "NFT gallery: collection grid with floor prices, item detail with traits, watchlist, portfolio value summary"),
  A("crypto", "defi-dash", "YieldYard", ["defi", "positions", "apy"], "DeFi dashboard UI: positions list with APY chips, protocol detail with rewards, claimable summary, risk notes screen"),
  A("crypto", "alerts", "WhaleWatch", ["alerts", "prices", "events"], "Crypto alerts app: price alert manager, triggered alerts feed, watchlist with sparklines, alert templates"),
  A("crypto", "learn", "ChainSchool", ["education", "lessons", "quizzes"], "Crypto education app: learning paths (wallets, security), lesson reader with key terms, quizzes with streaks, glossary"),
  A("crypto", "tax-log", "LedgerTally", ["taxes", "trades", "reports"], "Crypto tax logger: trade import list, gain/loss summary by year, holding-period badges, export report screen"),
  A("crypto", "dao", "QuorumApp", ["dao", "proposals", "votes"], "DAO governance UI: active proposals with vote bars, proposal detail with discussion, my voting power, treasury overview"),
  A("crypto", "mining", "HashHut", ["mining", "rigs", "profit"], "Mining monitor UI: rig cards with hashrate and temps, earnings dashboard, pool stats, alert thresholds"),
  A("crypto", "airdrops", "DropRadar", ["airdrops", "tasks", "eligibility"], "Airdrop tracker: opportunity feed with deadlines, task checklists per drop, eligibility tracker, claimed history"),

  // ── Streaming & Entertainment ───────────────────────────────────
  A("entertainment", "watchlist", "QueueScreen", ["movies", "shows", "tracking"], "Movie & TV watchlist: trending grid, title detail with where-to-watch chips, my queue with progress, ratings diary"),
  A("entertainment", "anime", "SenpaiList", ["anime", "seasons", "episodes"], "Anime tracker: seasonal chart, series detail with episode checklist, my list by status, recommendations"),
  A("entertainment", "movie-nights", "CineCircle", ["movienight", "votes", "history"], "Movie night app: group watch proposals with votes, scheduled nights, snack assignments, watched-history wall"),
  A("entertainment", "tv-episodes", "EpisodePulse", ["tv", "calendar", "progress"], "TV episode tracker: upcoming episode calendar, show progress bars, episode detail with notes, stats (hours watched)"),
  A("entertainment", "board-games", "MeepleShelf", ["boardgames", "plays", "collection"], "Board game shelf: collection grid with player counts, play logger with scores, win-rate stats, game night scheduler"),
  A("entertainment", "video-games", "QuestLog", ["games", "backlog", "achievements"], "Game backlog app: backlog by platform with status, game detail with hour estimates, now-playing card, completion stats"),
  A("entertainment", "standup", "LaughTrack", ["comedy", "specials", "ratings"], "Comedy tracker: special and show watchlist, comedian profiles, joke-notes journal, live show calendar"),
  A("entertainment", "escape-rooms", "LockBoxLog", ["escape-rooms", "teams", "times"], "Escape room logbook: completed rooms with times and hints used, team roster, wishlist by city, achievement badges"),
  A("entertainment", "fan-quiz", "LoreMaster", ["fandom", "quizzes", "ranks"], "Fandom quiz app: themed quiz packs, timed quiz screen with combo meter, global leaderboard, daily challenge"),
  A("entertainment", "streaming-budget", "SubScreen", ["streaming", "rotation", "costs"], "Streaming subscription rotator: active services with monthly cost, content wishlist by service, rotate-plan suggestions, annual savings"),

  // ── Maps & Navigation ───────────────────────────────────────────
  A("navigation", "city-transit", "TransitTap", ["transit", "routes", "times"], "Transit companion: nearby stops with arrival times, route detail with stop list, saved commutes, service alerts"),
  A("navigation", "commute", "CommuteCast", ["commute", "eta", "patterns"], "Commute assistant: leave-now card with door-to-door ETA, weekly pattern stats, multi-mode comparison, arrival notifications"),
  A("navigation", "geocaching", "CacheQuest", ["geocache", "finds", "hides"], "Geocaching app: nearby cache list with difficulty, cache detail with hint reveal, find log with photos, stats and souvenirs"),
  A("navigation", "running-routes", "LoopLab", ["routes", "distance", "elevation"], "Running route library: saved loops with distance/elevation, route detail with surface notes, route builder placeholder, neighborhood discover"),
  A("navigation", "ev-roadtrip", "ChargeRoute", ["ev", "roadtrip", "stops"], "EV road trip planner: trip with charging stop timeline, stop detail with amenities, buffer-range settings, trip summary"),
  A("navigation", "accessibility", "AccessPath", ["accessibility", "ramps", "reviews"], "Accessible navigation: place accessibility cards (ramps, restrooms), community reviews, saved accessible routes, report-an-issue"),
  A("navigation", "boating", "HarborHelm", ["boating", "marks", "logbook"], "Boating log: trip logbook with conditions, marina favorites, checklist before departure, maintenance tracker"),
  A("navigation", "snow-routes", "PlowWatch", ["snow", "routes", "status"], "Winter route app: plowed-street status board, school/work closure feed, commute risk meter, neighborhood reports"),
  A("navigation", "campus", "QuadFinder", ["campus", "buildings", "schedule"], "Campus navigator: building directory with hours, class schedule with walking times, study spot finder, campus events"),
  A("navigation", "delivery-zones", "ZoneRunner", ["couriers", "zones", "earnings"], "Courier zone app: hot-zone heat list, shift planner, delivery log with tips, earnings dashboard"),

  // ── Jobs & Career ───────────────────────────────────────────────
  A("career", "job-search", "OfferTrail", ["jobs", "applications", "stages"], "Job application tracker: application pipeline by stage, job detail with contacts and notes, interview scheduler, offer comparison"),
  A("career", "resume", "VitaForge", ["resume", "sections", "versions"], "Resume builder: section editor (experience, skills), template gallery, version manager per job, export screen"),
  A("career", "interview-prep", "AnswerReady", ["interviews", "questions", "practice"], "Interview prep app: question banks by role, practice mode with timed answers, STAR story library, confidence tracker"),
  A("career", "networking", "RolodexPro", ["contacts", "follow-ups", "notes"], "Professional networking CRM: contact cards with last-touch dates, follow-up queue, meeting notes, relationship strength tags"),
  A("career", "freelance-gigs", "GigGrid", ["freelance", "proposals", "clients"], "Freelance gig manager: lead pipeline, proposal tracker with win rates, active project boards, income dashboard"),
  A("career", "salary", "PayScalePal", ["salary", "negotiation", "offers"], "Salary toolkit: offer breakdown calculator, market range cards, negotiation script checklist, total-comp comparison"),
  A("career", "onboarding", "RampUp", ["onboarding", "tasks", "people"], "New-job onboarding: 30/60/90 plan checklists, people-to-meet cards, learning resources, win journal"),
  A("career", "shift-work", "ShiftSwapr", ["shifts", "swaps", "team"], "Shift worker app: my shift calendar, swap marketplace with approvals, overtime tracker, team contacts"),
  A("career", "mentorship", "GuideLight", ["mentors", "sessions", "goals"], "Mentorship app: mentor/mentee matches, session scheduler with agendas, goal tracking, session notes archive"),
  A("career", "side-hustle", "HustleHub", ["sidehustle", "ideas", "income"], "Side hustle tracker: venture cards with monthly income, task lists per venture, expense log, profit milestones"),

  // ── Home & DIY ──────────────────────────────────────────────────
  A("home", "cleaning-schedule", "TidyCycle", ["cleaning", "zones", "rotation"], "Cleaning schedule app: zone rotation calendar, room checklists, deep-clean tracker, streak rewards"),
  A("home", "diy-projects", "BuildBoard", ["diy", "projects", "materials"], "DIY project planner: project cards with progress, cut/materials list with costs, step photos diary, tool inventory"),
  A("home", "smart-home-ui", "HearthHub", ["smarthome", "scenes", "devices"], "Smart home dashboard UI: room device tiles with toggles, scene buttons, automation schedule list, energy usage chart"),
  A("home", "declutter", "ShedIt", ["declutter", "30day", "donations"], "Declutter challenge app: 30-day item counter, room-by-room progress, donation log with values, before/after gallery"),
  A("home", "warranty", "ProofPocket", ["warranties", "receipts", "expiry"], "Warranty vault: product cards with expiry countdowns, receipt photo storage, claim notes, renewal reminders"),
  A("home", "paint-projects", "HueHome", ["paint", "colors", "rooms"], "Paint project app: room color boards, swatch library with finishes, paint-can inventory with formulas, project checklist"),
  A("home", "energy", "WattWise", ["energy", "usage", "savings"], "Home energy tracker: monthly usage chart vs last year, appliance audit list, savings tips checklist, bill log"),
  A("home", "moving-sale", "StoopSale", ["sale", "items", "pricing"], "Garage sale manager: item catalog with prices and photos, sold tracker with running total, price-tag printer screen, leftover donation plan"),
  A("home", "seasonal", "SeasonSwitch", ["seasonal", "maintenance", "checklists"], "Seasonal home checklist: quarterly task lists (gutters, HVAC), task detail with how-to notes, service pro contacts, completion history"),
  A("home", "interior-moodboards", "RoomMuse", ["moodboards", "furniture", "budget"], "Interior design moodboards: room boards with saved items, item cards with prices and links, budget meter per room, style quiz"),

  // ── Volunteering & Nonprofit ────────────────────────────────────
  A("nonprofit", "volunteer-hours", "GiveTime", ["volunteering", "hours", "orgs"], "Volunteer hour tracker: org list with my roles, hour logger with verification states, impact dashboard, milestone certificates"),
  A("nonprofit", "donations", "KindFund", ["donations", "causes", "recurring"], "Personal giving app: cause portfolio with allocations, donation history with receipts, recurring gifts manager, year-end summary"),
  A("nonprofit", "food-bank", "ShelfShare", ["foodbank", "inventory", "shifts"], "Food bank app: inventory needs board, volunteer shift signups, donation drop-off scheduler, impact stats"),
  A("nonprofit", "cleanup", "TrashTally", ["cleanup", "events", "litter"], "Community cleanup app: event map-list, litter tally counter by type, team leaderboards, before/after photos"),
  A("nonprofit", "mutual-aid", "NeighborNet", ["mutualaid", "requests", "offers"], "Mutual aid board: needs and offers feeds, request detail with fulfill flow, my commitments, community guidelines"),
  A("nonprofit", "blood-donor", "VitalDrop", ["blood", "donations", "eligibility"], "Blood donor app: next-eligible countdown, donation history with badges, drive finder, health prep checklist"),
  A("nonprofit", "mentor-youth", "BigSteps", ["mentoring", "sessions", "activities"], "Youth mentoring app: mentee session log, activity idea library, milestone tracker, program announcements"),
  A("nonprofit", "shelter", "PawShelter", ["shelter", "animals", "tasks"], "Animal shelter volunteer app: animal care board with task claims, walk/socialization log, adoption event signups, animal notes"),
  A("nonprofit", "fundraise-team", "PledgePath", ["fundraising", "teams", "goals"], "Team fundraising app: campaign thermometer, team member progress, donor thank-you queue, milestone celebrations"),
  A("nonprofit", "community-garden", "PlotShare", ["garden", "plots", "workdays"], "Community garden app: plot map-list with assignments, workday signups, harvest share log, tool shed checkout"),

  // ── Weather & Environment ───────────────────────────────────────
  A("weather", "minimal-weather", "SkyGlance", ["weather", "forecast", "minimal"], "Minimal weather app: current conditions hero with feels-like, hourly scroller, 7-day list, saved locations"),
  A("weather", "severe-alerts", "StormSense", ["alerts", "radar", "safety"], "Severe weather app: active alerts feed with severity colors, radar placeholder screen, safety checklists by event, alert settings"),
  A("weather", "surf", "SwellScout", ["surf", "tides", "spots"], "Surf report app: spot cards with wave height and wind, spot detail with tide chart, session log, favorite breaks"),
  A("weather", "air-quality", "BreatheCheck", ["aqi", "pollen", "health"], "Air quality app: AQI dial with health guidance, pollen panel, sensitive-mode settings, weekly trends"),
  A("weather", "rain-garden", "DropCount", ["rain", "gauge", "records"], "Rain tracking app: backyard gauge log, monthly rainfall chart vs average, drought indicator, neighbor comparisons"),
  A("weather", "ski-snow", "FlakeForecast", ["snow", "resorts", "powder"], "Snow forecast app: resort snowfall cards (24h/72h), powder alerts, base depth trends, trip day planner"),
  A("weather", "stargazing", "NightSkyNow", ["astronomy", "conditions", "events"], "Stargazing conditions app: tonight's viewing score, celestial events calendar, light-pollution spots list, observation log"),
  A("weather", "uv", "ShadeSmart", ["uv", "sunscreen", "timers"], "UV safety app: live UV index with skin-type guidance, reapply sunscreen timer, daily exposure log, kids profiles"),
  A("weather", "wind", "GustGauge", ["wind", "kiting", "sailing"], "Wind sports app: spot wind dashboards with gust trends, session planner, gear quiver list, session journal"),
  A("weather", "climate-habits", "EcoEcho", ["sustainability", "habits", "impact"], "Climate habit app: eco-habit checklist with CO2 estimates, monthly impact dashboard, challenges with friends, tips library"),
];

/**
 * Build the one-time generation prompt for an archetype. Kept consistent with
 * the product's normal prompt style so DESIGN_BRIEF + CODE_GEN produce
 * high-quality schemas.
 */
export function archetypePrompt(a: ArchetypeSpec): string {
  return `${a.descriptor}. The app is called "${a.name}". Polished, production-quality mobile UI with realistic sample data, bottom tab navigation across the main screens, and a cohesive design system.`;
}

/** Categories present in the taxonomy (for gallery filters/seeding). */
export function taxonomyCategories(): string[] {
  return [...new Set(TEMPLATE_TAXONOMY.map((a) => a.category))];
}
