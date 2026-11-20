// Pure local-calendar week-anchor policy for Statistics weekly summaries.
// Noon avoids midnight ambiguity on daylight-saving transition dates.
function startOfStatsWeekMonday(date){
  const d=new Date(date);
  d.setHours(12,0,0,0);
  const shift=(d.getDay()+6)%7;
  d.setDate(d.getDate()-shift);
  return d;
}
