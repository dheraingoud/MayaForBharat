export default function Loading() {
  return (
    <div className="min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-[#E4E1DA] dark:border-white/10" />
          <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-[#E8601A] animate-spin" />
        </div>
        <p
          className="text-sm text-[#6B6560] dark:text-[#9E9890] font-medium"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          Loading...
        </p>
      </div>
    </div>
  )
}
