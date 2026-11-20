// Pure calendar clock-change formatting and selection policy.
function formatClockChangeDuration(minutes) {
  const total=Math.abs(Math.round(Number(minutes)||0)),hours=Math.floor(total/60),mins=total%60;
  return [hours?hours+'h':'',mins?mins+'m':''].filter(Boolean).join(' ')||'0m';
}
function calendarClockChangeMetrics(dayDeltaMinutes,startOffsetMs,endOffsetMs) {
  const offsetDeltaMinutes=Math.round((endOffsetMs-startOffsetMs)/60000);
  const isDayLengthChange=Math.abs(dayDeltaMinutes)>=1;
  const deltaMinutes=isDayLengthChange?dayDeltaMinutes:offsetDeltaMinutes;
  const sign=deltaMinutes>0?'+':'−',duration=formatClockChangeDuration(deltaMinutes);
  return {offsetDeltaMinutes,isDayLengthChange,deltaMinutes,sign,duration,change:sign+duration};
}
