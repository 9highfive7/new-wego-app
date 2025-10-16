import { signOutApp } from '../lib/firebase'
import { Button } from './ui/button'

export function NavBar({ userName }: { userName?: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/vite.svg" className="h-6 w-6" alt="logo" />
          <span className="font-semibold">Wego</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{userName}</span>
          <Button variant="outline" onClick={() => signOutApp()}>ログアウト</Button>
        </div>
      </div>
    </header>
  )
}

