// Pure selection policy for Statistics month-over-month and year-over-year comparisons.
function selectStatsMonthComparisonPeriods(items,selectedKey){
  if(!Array.isArray(items)||items.length===0)return null;
  const selectedIndex=selectedKey?items.findIndex(item=>item.key===selectedKey):-1;
  const index=selectedIndex>=0?selectedIndex:items.length-1;
  return {
    current:items[index],
    previous:items[index-1],
    yearAgo:items[index-12],
    index
  };
}
