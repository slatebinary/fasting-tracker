// Pure randomized selection policy for the optional stop-dialog riddle bank.
function resolveStopRiddleSelectionPolicy(riddleIds, seenIds, lastId, randomValue) {
  const ids = Array.isArray(riddleIds)
    ? [...new Set(riddleIds.filter(id => Number.isInteger(id)))]
    : [];
  if (!ids.length) return {id:null,seen:[],lastId:null};

  const validIds = new Set(ids);
  const seen = Array.isArray(seenIds)
    ? [...new Set(seenIds.filter(id => Number.isInteger(id) && validIds.has(id)))]
    : [];
  let available = ids.filter(id => !seen.includes(id));
  let nextSeen = seen;

  if (!available.length) {
    available = ids.filter(id => id !== lastId);
    if (!available.length) available = ids;
    nextSeen = [];
  }

  const random = Number.isFinite(randomValue)
    ? Math.min(1 - Number.EPSILON, Math.max(0, randomValue))
    : 0;
  const selectedIndex = Math.floor(random * available.length);
  const id = available[selectedIndex];
  nextSeen = [...nextSeen, id];
  return {id,seen:nextSeen,lastId:id};
}
