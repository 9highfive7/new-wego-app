import { ListManager } from '../components/lists/ListManager'

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl p-4 space-y-6">
      <section>
        <h2 className="mb-3 text-xl font-semibold">私のリスト</h2>
        <ListManager />
      </section>
    </div>
  )
}

