export function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : "var(--text)";
  return (
    <div className="card metric">
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}
