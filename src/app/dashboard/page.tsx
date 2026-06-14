export const metadata = { title: "Dashboard — Inteloop" };

export default function DashboardHomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="rounded-md border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">
          Your first report is on its way. Check back Monday morning.
        </p>
      </div>
    </div>
  );
}
