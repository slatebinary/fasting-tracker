// Pure Weight chart hit-testing and pointer activation policies.
function nearestWeightChartPoint(points,x,y,maxDistance=28){
  if(!Array.isArray(points)||!points.length)return null;
  let best=null,bestDistance=Infinity;
  for(const point of points){
    const distance=Math.hypot(x-point.x,y-point.y);
    if(distance<bestDistance){best=point;bestDistance=distance;}
  }
  return bestDistance<=maxDistance?best:null;
}
function nearestWeightChartPointAtX(points,x,maxDistance){
  if(!Array.isArray(points)||!points.length)return null;
  let best=null,bestDistance=Infinity;
  for(const point of points){
    const distance=Math.abs(x-point.x);
    if(distance<bestDistance){best=point;bestDistance=distance;}
  }
  return best&&bestDistance<=maxDistance?best:null;
}
function isWeightChartPointerTap(startX,startY,endX,endY,startScrollLeft,endScrollLeft){
  return Math.hypot(endX-startX,endY-startY)<=10&&Math.abs(endScrollLeft-startScrollLeft)<=8;
}
