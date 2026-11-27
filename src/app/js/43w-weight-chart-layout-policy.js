// Pure Weight chart layout policies shared by rendering and navigation.
function weightChartPointSpacingPolicy(bucketCount, viewportWidth) {
  const count=Math.max(0,Math.floor(Number(bucketCount)||0));
  const width=Math.max(220,Number(viewportWidth)||614);
  const plotWidth=Math.max(1,width-30);
  return count<=30
    ? Math.max(1,plotWidth/Math.max(1,count-1))
    : Math.max(10,Math.min(22,plotWidth/29));
}

function weightChartVisibleRangePolicy(bucketCount, viewportWidth, scrollLeft, pointSpacing) {
  const count=Math.max(0,Math.floor(Number(bucketCount)||0));
  if(!count)return {first:0,last:-1};
  const width=Math.max(220,Number(viewportWidth)||614);
  const scroll=Math.max(0,Number(scrollLeft)||0);
  const spacing=Math.max(1,Number(pointSpacing)||1);
  return {
    first:Math.max(0,Math.floor((scroll-16)/spacing)-2),
    last:Math.min(count-1,Math.ceil((scroll+width-16)/spacing)+2)
  };
}

// Calendar-time positioning for the Weight chart. Daily points retain their
// individual records, but their horizontal coordinates follow elapsed local
// calendar days rather than the ordinal position of a measurement.
function weightChartTimelineLayoutPolicy(buckets, mode, viewportWidth) {
  const count = Array.isArray(buckets) ? buckets.length : 0;
  const width = Math.max(220, Number(viewportWidth) || 614);
  const plotWidth = Math.max(1, width - 30);
  if (!count) return {positions:[],spacing:1,spanSlots:0,spanDays:0,calendarBased:mode === 'daily'};
  if (mode === 'daily') {
    const ordinals = buckets.map(bucket => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(bucket?.calendarDay || ''));
      if (!match) return null;
      const value = Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3]));
      return Number.isFinite(value) ? Math.floor(value / 86400000) : null;
    });
    if (ordinals.every(Number.isFinite)) {
      let firstDay=Infinity,lastDay=-Infinity;
      for(const day of ordinals){if(day<firstDay)firstDay=day;if(day>lastDay)lastDay=day;}
      const spanDays = Math.max(1, lastDay - firstDay + 1);
      const spacing = weightChartPointSpacingPolicy(spanDays, width);
      const positions = ordinals.map(day => spanDays === 1 ? plotWidth / 2 : (day - firstDay) * spacing);
      return {positions,spacing,spanSlots:spanDays,spanDays,firstDay,lastDay,calendarBased:true};
    }
  }
  const spacing = weightChartPointSpacingPolicy(count, width);
  const positions = Array.from({length:count}, (_, index) => count === 1 ? plotWidth / 2 : index * spacing);
  return {positions,spacing,spanSlots:count,spanDays:count,calendarBased:false};
}

function weightChartVisibleRangeFromPositionsPolicy(positions, viewportWidth, scrollLeft, left = 16, overscanPx = 36) {
  if (!Array.isArray(positions) || !positions.length) return {first:0,last:-1};
  const low = (Number(scrollLeft) || 0) - Math.max(0, Number(left) || 0) - Math.max(0, Number(overscanPx) || 0);
  const high = (Number(scrollLeft) || 0) + Math.max(1, Number(viewportWidth) || 1) - Math.max(0, Number(left) || 0) + Math.max(0, Number(overscanPx) || 0);
  let lo=0,hi=positions.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(positions[mid]<low)lo=mid+1;else hi=mid;}
  const first=Math.max(0,lo-1);
  lo=0;hi=positions.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(positions[mid]<=high)lo=mid+1;else hi=mid;}
  return {first,last:Math.min(positions.length-1,lo)};
}

function weightChartNearestPositionIndexPolicy(positions, targetPosition) {
  if (!Array.isArray(positions) || !positions.length) return -1;
  const target=Number(targetPosition);
  if(!Number.isFinite(target))return -1;
  let lo=0,hi=positions.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(positions[mid]<target)lo=mid+1;else hi=mid;}
  if(lo<=0)return 0;
  if(lo>=positions.length)return positions.length-1;
  return Math.abs(positions[lo]-target)<Math.abs(positions[lo-1]-target)?lo:lo-1;
}
