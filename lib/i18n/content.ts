/**
 * MAYA — Bilingual Content System
 * NOT a translation — each language has independently crafted content.
 */

export type Lang = 'en' | 'hi'

export const content = {
  /* ----- Nav ----- */
  nav: {
    links: {
      en: ['How it works', 'Features', 'Examples', 'Contact'],
      hi: ['Kaise kaam karta hai', 'Features', 'Examples', 'Contact'],
    },
    alreadyBuilding: { en: 'Already building?', hi: 'Pehle se bana rahein?' },
    signIn: { en: 'Sign in', hi: 'Login karein' },
    cta: { en: 'Build your app — free', hi: 'App banao — free mein' },
    ctaHover: { en: 'Start now', hi: 'Abhi shuru karein' },
    dashboard: { en: 'Dashboard', hi: 'Dashboard' },
  },

  /* ----- Hero ----- */
  hero: {
    label: {
      en: 'Voice-first app builder for Bharat',
      hi: 'Aapki dukaan, aapki app',
    },
    h1: {
      en: ['Speak.', 'MAYA builds.', 'It evolves overnight.'],
      hi: ['Boliye.', 'MAYA bana degi.', 'Raat mein khud sudharegi.'],
    },
    sub: {
      en: 'Speak in your language. App goes live in 3 minutes. Improves itself every night.',
      hi: 'Apni bhasha mein bolein. App 3 minute mein live. Har raat khud behtar hota hai.',
    },
    ctaPrimary: { en: 'Start building your app', hi: 'App banana shuru karein' },
    ctaSecondary: { en: 'Watch demo', hi: 'Demo dekhein' },
    trust: {
      free: { en: '100% free', hi: '100% free' },
      msmes: { en: '63M+ MSMEs in India', hi: '63M+ MSMEs in India' },
      languages: { en: 'Hindi, Telugu, Tamil...', hi: 'Hindi, Telugu, Tamil...' },
    },
  },

  /* ----- How It Works ----- */
  howItWorks: {
    badge: { en: 'Three easy steps', hi: 'Teen aasan kadam' },
    h2: { en: 'Speak. Build. Sleep.', hi: 'Bolo. Banao. So jao.' },
    steps: [
      {
        num: '01',
        title: {
          en: 'Tell us what your shop needs',
          hi: 'Apni dukaan ki zaroorat batayein',
        },
        body: {
          en: 'Speak in Hindi — need a stock tracker, order form, or alerts? Just say it.',
          hi: 'Hindi mein bolein — stock tracker chahiye, order form chahiye, alert chahiye.',
        },
      },
      {
        num: '02',
        title: {
          en: 'MAYA builds your app in 3 minutes',
          hi: 'MAYA 3 minute mein app banati hai',
        },
        body: {
          en: 'From your words to a full app — with a live URL. No coding. No English needed.',
          hi: 'Aapki baat se poori app — live URL ke saath. Coding nahi. English nahi.',
        },
      },
      {
        num: '03',
        title: {
          en: 'Your app improves itself overnight',
          hi: 'Raat ko app khud sudharta hai',
        },
        body: {
          en: 'MAYA analyzes what can be better overnight — and updates itself automatically.',
          hi: 'MAYA raat ko dekhti hai kya behtar ho sakta hai — aur khud update kar deti hai.',
        },
      },
    ],
  },

  /* ----- Showcase ----- */
  showcase: {
    badge: { en: 'Real apps, real shops', hi: 'Asli apps, asli dukaan' },
    h2: {
      en: 'These shops built their app with MAYA',
      hi: 'In dukaanon ne MAYA se app banayi',
    },
    cards: [
      {
        name: 'Ram Kirana',
        type: { en: 'Stock Tracker', hi: 'Stock Tracker' },
        updates: { en: '7 updates in 7 nights', hi: '7 raat mein 7 updates' },
      },
      {
        name: 'Seema Tailor',
        type: { en: 'Booking System', hi: 'Booking System' },
        updates: { en: '5 updates in 3 nights', hi: '3 raat mein 5 updates' },
      },
      {
        name: 'Gopal Bhojan',
        type: { en: 'Menu + Orders', hi: 'Menu + Orders' },
        updates: { en: '4 updates in 5 nights', hi: '5 raat mein 4 updates' },
      },
    ],
  },

  /* ----- Footer CTA ----- */
  footer: {
    h2: { en: 'Start building today', hi: 'Aaj hi shuru karein' },
    sub: { en: 'Your first app in 3 minutes', hi: '3 minute mein aapki pehli app' },
    cta: { en: 'Build your app — free', hi: 'Free mein app banayein' },
    credit: { en: 'MAYA', hi: 'MAYA' },
    langs: { en: 'Hindi · Telugu · Tamil · Kannada · Bengali', hi: 'Hindi · Telugu · Tamil · Kannada · Bengali' },
  },

  /* ----- Auth ----- */
  auth: {
    signInHeading: { en: 'Welcome back to MAYA', hi: 'MAYA mein aapka swagat hai' },
    signUpHeading: { en: 'Create your MAYA account', hi: 'MAYA mein account banayein' },
    quote: {
      en: '"Those who could not code — can now build."',
      hi: '"Jo code nahi kar paate they — ab banate hain."',
    },
    tagline: { en: '63M Indian MSMEs, zero coding needed', hi: '63M Indian MSMEs, zero coding needed' },
  },

  /* ----- Onboarding ----- */
  onboarding: {
    steps: [
      { label: { en: 'Name', hi: 'Naam' } },
      { label: { en: 'Phone', hi: 'Phone' } },
      { label: { en: 'Language', hi: 'Bhasha' } },
    ],
    nameTitle: { en: 'What is your name?', hi: 'Aapka naam kya hai?' },
    phoneTitle: { en: 'Phone number?', hi: 'Phone number?' },
    phoneSub: {
      en: 'We will let you know when your app gets overnight updates',
      hi: 'Raat ko app update hone par batayenge',
    },
    phoneNote: {
      en: 'Only for app updates — no spam',
      hi: 'Sirf app updates ke liye — koi spam nahi',
    },
    langTitle: {
      en: 'Which language do you prefer?',
      hi: 'Aap kis bhasha mein baat karna chahenge?',
    },
    langNote: {
      en: 'Only Hindi is supported right now — more coming soon',
      hi: 'Abhi sirf Hindi supported hai — baaki aa raha hai',
    },
    next: { en: 'Continue', hi: 'Aage badhein' },
    skip: { en: 'Later', hi: 'Baad mein' },
  },

  /* ----- Dashboard ----- */
  dashboard: {
    title: { en: 'Dashboard', hi: 'Dashboard' },
    emptyTitle: { en: 'Build your first app', hi: 'Apni pehli app banao' },
    emptyBody: {
      en: 'Speak in your language — MAYA will build your app in 3 minutes',
      hi: 'Apni bhasha mein bolo — MAYA 3 minute mein app bana degi',
    },
    emptyCta: { en: 'Start building', hi: 'Shuru karein' },
    yourApps: { en: 'Your apps', hi: 'Aapki apps' },
    newApp: { en: '+ New app', hi: '+ Nayi app' },
    evolutionAlert: {
      en: 'apps have overnight updates',
      hi: 'apps mein raat ke updates hain',
    },
    viewAll: { en: 'View all', hi: 'Dekhein' },
    open: { en: 'Open', hi: 'Kholein' },
    updates: { en: 'updates', hi: 'updates' },
    live: { en: 'Live', hi: 'Live' },
    building: { en: 'Building...', hi: 'Ban raha hai...' },
    pending: { en: 'Update pending', hi: 'Update pending' },
    approvalNeeded: {
      en: 'apps need your approval',
      hi: 'apps ko aapki approval chahiye',
    },
  },

  /* ----- Build Page ----- */
  build: {
    tapToRecord: { en: 'Tap to speak', hi: 'Baat karo' },
    listening: { en: 'MAYA is listening...', hi: 'MAYA sun rahi hai...' },
    stopCta: { en: 'Done, build my app', hi: 'Ho gaya, app banao' },
    retry: { en: 'Speak again', hi: 'Phir se bolein' },
    youSaid: { en: 'You said:', hi: 'Aapne bola:' },
    buildingTitle: { en: 'Building your app...', hi: 'App ban rahi hai...' },
    stages: [
      { en: 'Understanding your request', hi: 'Aapki baat samajh li' },
      { en: 'Designing the app', hi: 'App design taiyaar' },
      { en: 'Writing the code...', hi: 'Code likh raha hai...' },
      { en: 'Deploying to Vercel', hi: 'Vercel pe deploy ho rahi hai' },
      { en: 'App is live!', hi: 'App live ho gayi!' },
    ],
    doneTitle: { en: 'Your app is live!', hi: 'App live hai!' },
    viewApp: { en: 'View app', hi: 'App dekhein' },
    editApp: { en: 'Edit app', hi: 'Edit karo' },
    overnightNote: {
      en: 'MAYA will improve it overnight — we will notify you.',
      hi: 'MAYA raat ko khud sudharegi — hum batayenge.',
    },
  },

  /* ----- Editor ----- */
  editor: {
    publishCta: { en: 'Publish changes', hi: 'Publish karo' },
    emptyChat: { en: 'Tell the app something', hi: 'App ko kuch bolein' },
    emptyChatSub: {
      en: 'Tap the mic below and say what you want to change',
      hi: 'Neeche mic tap karein aur batayein kya badalna hai',
    },
    inputPlaceholder: { en: 'Say something...', hi: 'Kuch bolein...' },
    inputNote: { en: 'Speak in Hindi', hi: 'Hindi mein baat karein' },
    quickChips: {
      en: ['Add payment', 'Add search', 'Set alert', 'New page'],
      hi: ['Payment jodein', 'Search jodein', 'Alert set karein', 'New page'],
    },
    updatingPreview: { en: 'Updating...', hi: 'Update ho rahi hai...' },
    previewUpdated: { en: 'Preview updated', hi: 'Preview update ho gayi' },
    tabs: {
      en: ['Chat', 'Preview', 'Both'],
      hi: ['Chat', 'Preview', 'Both'],
    },
  },

  /* ----- Evolution ----- */
  evolution: {
    title: { en: 'Evolution Log', hi: 'Evolution Log' },
    total: { en: 'Total', hi: 'Total' },
    merged: { en: 'Merged', hi: 'Merged' },
    discarded: { en: 'Discarded', hi: 'Discarded' },
    improved: { en: 'improvements merged', hi: 'improvements merge hui' },
    merged_badge: { en: 'Merged', hi: 'Merge' },
    discarded_badge: { en: 'Discarded', hi: 'Discard' },
    pending_badge: { en: 'Pending', hi: 'Pending' },
    gateFailed: { en: 'Gate failed', hi: 'Gate failed' },
    before: { en: 'Before', hi: 'Pehle' },
    after: { en: 'After', hi: 'Baad mein' },
    approveCta: { en: 'Approve', hi: 'Approve karo' },
    dreamNote: {
      en: 'MAYA improved its memory overnight',
      hi: 'Raat ko MAYA ne apni yaadast sudhaari',
    },
  },

  /* ----- Approve ----- */
  approve: {
    topLabel: { en: 'Overnight update', hi: 'Raat ka update' },
    countdown: { en: 'Auto-applies in', hi: 'mein khud lag jayega' },
    currentLabel: { en: 'Before (current)', hi: 'Pehle (abhi)' },
    newLabel: { en: 'New version', hi: 'Nayi version' },
    whatChanged: { en: 'What changed:', hi: 'Kya badla:' },
    reject: { en: 'Do not apply', hi: 'Nahi chahiye' },
    approveCta: { en: 'Yes, apply', hi: 'Haan, lagao' },
    autoNote: {
      en: 'If no response, it will apply automatically',
      hi: 'Koi jawab nahi diya toh khud lag jayega',
    },
  },

  /* ----- Settings ----- */
  settings: {
    title: { en: 'Settings', hi: 'Settings' },
    profile: { en: 'Profile', hi: 'Profile' },
    whatsapp: { en: 'Notifications', hi: 'Notifications' },
    whatsappToggle: {
      en: 'Overnight update notifications',
      hi: 'Raat ke updates ki notification',
    },
    whatsappNote: {
      en: 'Only for app updates — no spam',
      hi: 'Sirf app updates ke liye — koi spam nahi',
    },
    language: { en: 'Preferred language', hi: 'Pehli pasand ki bhasha' },
    dangerZone: { en: 'Danger Zone', hi: 'Danger Zone' },
    deleteAccount: { en: 'Delete account', hi: 'Account band karo' },
  },

  /* ----- Language Gate ----- */
  langGate: {
    title: { en: 'Choose your language', hi: 'Bhasha chunein' },
    hindiBtn: 'Hindi mein chalayein',
    englishBtn: 'Continue in English',
  },

  /* ----- Common ----- */
  common: {
    back: { en: 'Back', hi: 'Wapas' },
    save: { en: 'Save', hi: 'Save karein' },
    cancel: { en: 'Cancel', hi: 'Cancel' },
    loading: { en: 'Loading...', hi: 'Loading...' },
    error: { en: 'Something went wrong', hi: 'Kuch galat hua' },
    micPermission: { en: 'Microphone permission required', hi: 'Microphone ki anumati chahiye' },
    comingSoon: { en: 'Coming soon', hi: 'Jaldi aa raha hai' },
  },
} as const

/** Typed accessor function */
export function t(obj: { en: string; hi: string }, lang: Lang): string {
  return obj[lang]
}

export function tArr(obj: { en: string[]; hi: string[] }, lang: Lang): string[] {
  return obj[lang]
}
