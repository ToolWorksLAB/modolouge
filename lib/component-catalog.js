import catalog from "./component-catalog-data.json" with { type: "json" };

// One bounded discovery call for a construction plan; helpers are returned once.
export function searchComponentSet(queries) {
  const unique = [...new Map(queries.map(q => [q.trim().toLowerCase(), q.trim()])).values()];
  const results = unique.map(query => {
    const result = searchComponents(query);
    return { query, matches: result.matches.slice(0, 3), totalMatches: result.totalMatches };
  });
  const { supportComponents, instructions } = searchComponents("");
  return { results, supportComponents, instructions };
}

// Only return typed, bounded reference metadata, never the underlying archive.
export function searchComponents(query) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const ranked = catalog.map(({ xml, ...component }) => {
    const name = component.name.toLowerCase();
    const text = `${name} ${component.category} ${component.subcategory} ${component.description}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (name === term ? 10 : name.includes(term) ? 5 : text.includes(term) ? 1 : 0), 0);
    return { component, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.component.name.localeCompare(b.component.name));
  return {
    matches: ranked.slice(0, 6).map(x => x.component),
    totalMatches: ranked.length,
    supportComponents: catalog.filter(x => ['Number Slider', 'Custom Preview', 'Construct Point'].includes(x.name)).map(({xml,...c})=>c),
    instructions: "Use add with text=the returned component id and nodeId=a fresh UUID. New components retain native defaults but have no wires. Connect required inputs and connect geometry to a visible Custom Preview. Add Number Sliders for requested numeric controls, then set bounds/value and rename. Port indices are zero based. Test the complete candidate. A catalog match does not guarantee the requested model is correct.",
  };
}
