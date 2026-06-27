import { AnimatePresence, cubicBezier, motion } from 'framer-motion';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ show, isStreaming, disabled, onClick }: SendButtonProps) => {
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          className="absolute flex justify-center items-center top-[18px] right-[22px] rounded-lg w-[34px] h-[34px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isStreaming
              ? 'rgba(248, 113, 113, 0.15)'
              : 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
            border: isStreaming
              ? '1px solid rgba(248, 113, 113, 0.3)'
              : '1px solid rgba(232, 96, 26, 0.4)',
            boxShadow: isStreaming
              ? 'none'
              : '0 2px 8px rgba(232, 96, 26, 0.25)',
            color: isStreaming ? '#F87171' : '#ffffff',
          }}
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();

            if (!disabled) {
              onClick?.(event);
            }
          }}
        >
          <div className="text-lg">
            {!isStreaming ? <div className="i-ph:arrow-up-bold"></div> : <div className="i-ph:stop-circle-bold"></div>}
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
