export default function SeasonOption({ value, label }: { value: number; label: string }) {
  return <option value={String(value)}>{label}</option>
}
