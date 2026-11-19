// Pure lifetime maximum over active Weight records. Invalid and non-positive values are ignored.
  function highestValidWeightKg(entries) {
    if (!Array.isArray(entries)) return null;
    let highest = -Infinity;
    for (const entry of entries) {
      const kg = Number(entry?.kg);
      if (Number.isFinite(kg) && kg > 0) highest = Math.max(highest, kg);
    }
    return Number.isFinite(highest) ? highest : null;
  }
