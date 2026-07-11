import { atom } from 'nanostores';

export const streamingState = atom<boolean>(false);

// Cross-component "a dev server is booting in the WebContainer" flag.
// Two independent boot paths can fire on the same reopen — BuilderPage's
// AutoStart effect (chat-restored reopen) AND BuilderPageWithJob's Effect#2
// (detached `live` job hydrating a fresh WC). Without a shared signal both
// run `npm install && npm run dev` → two concurrent installs + two vite
// servers fighting for the same port, the second clobbering the first.
// Each path sets this true before `wc.spawn(startCmd)` and gates on it at
// entry; previews.ts clears it the moment a `server-ready`/`port` open
// event lands (the authoritative "vite is up" signal). Bug 2026-07-08.
export const devServerBooting = atom<boolean>(false);
