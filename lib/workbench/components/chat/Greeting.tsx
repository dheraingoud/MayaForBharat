// MAYA empty-state greeting. Ported from vercel-chatbot greeting.tsx,
// painted with MAYA orange tokens, bilingual hi/en via language prop.
// Staggered fade-up, premium ease. Mounts as an absolute overlay when the
// chat column is empty (matches vercel `messages.tsx` empty-state pattern).
import { motion } from 'framer-motion';

interface GreetingProps {
  language?: 'hi' | 'en';
}

export function Greeting({ language = 'en' }: GreetingProps) {
  const heading = language === 'hi' ? 'MAYA से क्या मदद चाहिए?' : 'What can I help with?';
  const sub =
    language === 'hi'
      ? 'सवाल पूछें, कोड लिखवाएं, या आइडिया खोजें।'
      : 'Ask a question, write code, or explore ideas.';

  return (
    <div className="flex flex-col items-center px-4 text-center" key="overview">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-2xl md:text-3xl font-semibold tracking-tight text-[#F5F4F0]"
      >
        {heading}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-3 text-sm text-[#6B6560]"
      >
        {sub}
      </motion.div>
    </div>
  );
}
