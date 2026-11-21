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
