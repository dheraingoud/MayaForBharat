import { memo, useEffect, useState } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import { classNames } from '@/lib/workbench/utils/classNames';
import { createScopedLogger } from '@/lib/workbench/utils/logger';

import styles from './CodeBlock.module.scss';

const logger = createScopedLogger('CodeBlock');

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme = 'dark-plus', disableCopy = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
      if (copied) {
        return;
      }

      navigator.clipboard.writeText(code);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    };

    useEffect(() => {
      let effectiveLanguage = language;

      if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
        logger.warn(`Unsupported language '${language}', falling back to plaintext`);
        effectiveLanguage = 'plaintext';
      }

      logger.trace(`Language = ${effectiveLanguage}`);

      const processCode = async () => {
        setHTML(await codeToHtml(code, { lang: effectiveLanguage, theme }));
      };

      processCode();
    }, [code, language, theme]);

    return (
      <div className={classNames('relative group text-left rounded-lg overflow-hidden border border-white/[0.06]', className)}>
        {/* Language label + copy button header */}
        {language && language !== 'plaintext' && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#1A1917] border-b border-white/[0.06]">
            <span className="text-[10px] font-medium text-[#6B6560] uppercase tracking-wider">{language}</span>
            {!disableCopy && (
              <button
                className="text-[10px] text-[#6B6560] hover:text-[#E8601A] transition-colors font-medium"
                title="Copy Code"
                onClick={() => copyToClipboard()}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
        )}
        {/* Fallback copy button when no language header */}
        {(!language || language === 'plaintext') && !disableCopy && (
          <div
            className={classNames(
              styles.CopyButtonContainer,
              'bg-transparant absolute top-[10px] right-[10px] rounded-md z-10 text-lg flex items-center justify-center opacity-0 group-hover:opacity-100',
              { 'rounded-l-0 opacity-100': copied },
            )}
          >
            <button
              className={classNames(
                'flex items-center bg-[#E8601A] p-[6px] justify-center before:bg-white before:rounded-l-md before:text-gray-500 before:border-r before:border-gray-300 rounded-md transition-theme',
                { 'before:opacity-0': !copied, 'before:opacity-100': copied },
              )}
              title="Copy Code"
              onClick={() => copyToClipboard()}
            >
              <div className="i-ph:clipboard-text-duotone"></div>
            </button>
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html ?? '' }}></div>
      </div>
    );
  },
);
