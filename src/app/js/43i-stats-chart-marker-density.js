// Pure marker-density policy for Statistics line charts.
function statsChartMarkerStep(count,width,range='30d'){
  count=Math.max(0,Number(count)||0);width=Math.max(1,Number(width)||1);
  if(count<=31)return 1;
  const minSpacing=range==='all'?28:range==='1y'?22:range==='6m'?18:15;
  return Math.max(1,Math.ceil(count/Math.max(2,Math.floor(width/minSpacing))));
}
