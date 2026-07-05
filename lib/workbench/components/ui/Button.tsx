import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { classNames } from '@/lib/workbench/utils/classNames';

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-[#E8601A] text-[#F5F4F0] hover:bg-[#E8601A]/85',
        destructive: 'bg-[#F87171]/10 text-[#F87171] hover:bg-[#F87171]/20',
        outline:
          'border border-white/[0.06] bg-[#1A1917]/50 hover:bg-white/[0.04] hover:text-[#F5F4F0] text-[#D4D0CA]',
        secondary:
          'bg-[#222120] text-[#F5F4F0] hover:bg-[#222120]/80',
        ghost: 'hover:bg-white/[0.04] hover:text-[#F5F4F0] text-[#D4D0CA]',
        link: 'text-[#E8601A] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 gap-1.5 px-3',
        xs: 'h-6 gap-1 px-2.5 text-xs [&_svg:not([class*=size-])]:size-3',
        sm: 'h-8 gap-1 px-3',
        lg: 'h-10 gap-1.5 px-4',
        icon: 'size-9',
        'icon-xs': 'size-6 [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  _asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, _asChild = false, ...props }, ref) => {
    return <button className={classNames(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
