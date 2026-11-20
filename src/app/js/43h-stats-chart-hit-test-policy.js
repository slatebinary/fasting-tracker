// Pure nearest-day hit-testing shared by Statistics line charts.
function nearestStatsChartDayHit(x,y,bounds,hits){
  if(!bounds||!Array.isArray(hits)||!hits.length)return null;
  if(x<bounds.left-12||x>bounds.right+12||y<bounds.top-24||y>bounds.bottom+24)return null;
  let best=null,bestDistance=Infinity;
  for(const hit of hits){
    const distance=Math.abs(x-hit.x);
    if(distance<bestDistance){bestDistance=distance;best=hit;}
  }
  return best;
}
