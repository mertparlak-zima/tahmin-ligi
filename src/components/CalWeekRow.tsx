import CalDayCell from './CalDayCell'

export default function CalWeekRow({ days }: { days: any[] }) {
  return (
    <div class="cal-week">
      {days.map(cell => <CalDayCell key={cell.cellId} cell={cell} />)}
    </div>
  )
}
