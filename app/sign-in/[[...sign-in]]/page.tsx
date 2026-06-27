import { SignIn } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const hasClerkKey = clerkKey && clerkKey.trim().length > 0 && !clerkKey.startsWith('pk_test_disable')

  if (!hasClerkKey) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-5 bg-[#F5F4F0] dark:bg-[#1A1917]">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-8 shadow-sm">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold mb-3">Authentication Required</h2>
            <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-6">
              Clerk is not configured. Add your Clerk publishable key to .env.local to enable OAuth sign-in.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // If user is already signed in, redirect smartly
  const user = await currentUser().catch(() => null)
  if (user) {
    // Check metadata for whether they've created an app before
    const hasApps = user.publicMetadata?.hasApps === true
    redirect(hasApps ? '/dashboard' : '/record')
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-5 bg-[#F5F4F0] dark:bg-[#1A1917]">
      <div className="w-full max-w-md">
        <SignIn
          fallbackRedirectUrl="/record"
          appearance={{
            variables: {
              colorPrimary: '#E8601A',
              borderRadius: '1rem',
            },
          }}
        />
      </div>
    </div>
  )
}
