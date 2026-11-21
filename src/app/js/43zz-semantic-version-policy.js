  function compareVersions(a, b) {
    const pa = String(a).split('.').map(x => Number.parseInt(x, 10) || 0);
    const pb = String(b).split('.').map(x => Number.parseInt(x, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const av = pa[i] || 0, bv = pb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }
