# MAYA — बोलिए। MAYA बना देगी।

A complete Next.js implementation of MAYA, an AI-powered app builder for Hindi-speaking small business owners. Built with Framer Motion, GSAP, and Tailwind CSS for stunning animations and interactions.

## 🎯 Project Overview

MAYA is a full-stack web application that demonstrates:
- **Responsive Design** with warm, thoughtful UI/UX for the Indian market
- **Complex Animations** using Framer Motion and GSAP
- **Multi-Page Application** with smooth transitions and page flows
- **Tailwind CSS** with custom color palette and animations
- **Next.js 16** with TypeScript for production-ready code

## 🏗️ Architecture

### Pages Implemented

1. **Landing Page** (`/`)
   - Hero section with animated headline
   - "How It Works" section with 3-step process
   - Live examples showcase
   - Footer CTA with dark background
   - Sticky navigation with logo and CTAs

2. **Onboarding** (`/onboarding`)
   - Multi-step form (Name → Phone → Language)
   - Animated step indicators
   - Smooth slide transitions between steps
   - Mobile-optimized form inputs

3. **Voice Builder** (`/build`)
   - 3-state experience: Record → Building → Done
   - Animated mic button with ripple rings
   - Real-time waveform visualization
   - Progress stages with staggered animations
   - Success screen with app deployment details

4. **Dashboard** (`/dashboard`)
   - Grid of user apps with live status indicators
   - Evolution alert notification badge
   - Empty state for new users
   - Staggered card animations

5. **Evolution Timeline** (`/app/evolution`)
   - Timeline view of app improvements
   - Three status types: Pending (with pulse), Merged (with tests), Discarded
   - Before/after comparison for features
   - Approval workflow UI

## 🎨 Design System

### Color Palette
```
Background:     #F5F4F0   (warm off-white)
Surface:        #FFFFFF   (cards, panels)
Surface Alt:    #EFEDE8   (subtle variant)
Border:         #E4E1DA   (warm beige)
Text Primary:   #1A1917   (near-black)
Text Secondary: #6B6560   (warm mid-gray)
Text Muted:     #9E9890   (light gray)
Accent:         #E8601A   (primary orange)
Accent Hover:   #C94E12   (darker orange)
Dark:           #1A1917   (buttons, surfaces)
Success:        #2D7A4F   (green)
```

### Typography
- **Display**: Sora (headlines)
- **Body**: DM Sans (text)
- **Mono**: JetBrains Mono (code)

### Spacing System
Built on 4px unit:
- `stack-sm`: 8px
- `stack-md`: 16px
- `stack-lg`: 32px
- `margin-mobile`: 20px
- `margin-desktop`: 40px

## ⚡ Key Features

### Animations
- **Framer Motion**: Page transitions, scroll animations, hover states
- **GSAP**: Complex timeline animations, ripple effects
- **CSS Animations**: Pulse, audio bars, and custom keyframes
- **Smooth Transitions**: Cubic-bezier easing for natural motion

### Interactive Elements
- Animated navigation with scroll detection
- Hover effects on cards (scale, shadow, translate)
- Step indicators with progress visualization
- Pulsing dots and animated counters
- Real-time waveform visualization

### Mobile-First Design
- Fully responsive from mobile to desktop
- Touch-optimized buttons and interactions
- Optimized navigation for small screens
- Image lazy loading support

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
pnpm build
pnpm start
```

## 📁 Project Structure

```
app/
├── layout.tsx              # Root layout with fonts and providers
├── globals.css             # Theme colors and animations
├── page.tsx                # Landing page
├── onboarding/
│   └── page.tsx            # Onboarding flow
├── build/
│   └── page.tsx            # Voice builder experience
├── dashboard/
│   └── page.tsx            # App dashboard
└── app/
    └── evolution/
        └── page.tsx        # Evolution timeline
```

## 🎭 Animation Patterns

### Page Transitions
```typescript
const slideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({
    x: direction < 0 ? 1000 : -1000,
    opacity: 0
  })
}
```

### Stagger Container
```typescript
const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
}
```

### Ripple Effect (GSAP)
```typescript
@keyframes ripple {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}
```

## 🔧 Technologies Used

### Core
- **Next.js 16**: React framework with App Router
- **React 19**: UI library
- **TypeScript**: Type safety

### Animations & Motion
- **Framer Motion 12**: Declarative animations
- **GSAP 3**: Timeline-based animations
- **Tailwind CSS 4**: Utility-first styling

### Styling
- **Tailwind CSS**: Responsive design
- **CSS Variables**: Theme customization
- **CSS Animations**: Keyframe animations

## 📱 Responsive Breakpoints

- Mobile: < 640px
- Tablet: 640px - 1024px (sm:)
- Desktop: 1024px+ (lg:, md:)

## 🌐 i18n Considerations

- Built for Hindi language first
- Bidirectional text support through HTML lang="hi"
- Character support for Devanagari script
- Easy to extend for Telugu, Tamil, Kannada, Bengali

## 🚨 Performance Optimizations

- Server-side rendering for initial page load
- Image lazy loading
- Font subsetting with Google Fonts
- CSS-in-JS avoided (pure CSS/Tailwind)
- Motion preferences respected with `prefers-reduced-motion`

## 🔐 Security & Best Practices

- No hardcoded sensitive data
- Proper error boundaries
- Input validation ready
- Accessible color contrasts (WCAG AA)
- Semantic HTML structure

## 📊 Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Android)

## 🤝 Contributing

The codebase follows:
- Component-based architecture
- One page per route
- Consistent naming conventions
- Motion-first design approach

## 📝 License

Built for demonstration purposes following the MAYA visual design language.

## 🎓 Learning Resources

This project demonstrates:
- Next.js App Router with dynamic routing
- Framer Motion patterns and best practices
- GSAP timeline animations
- Tailwind CSS customization
- TypeScript in React
- Responsive mobile-first design
- Accessibility fundamentals

---

**Made with ❤️ for भारत (India)**
