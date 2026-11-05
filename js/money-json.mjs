// Database JSON storage can reorder object fields, while array order is meaningful.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export const comparable = value => JSON.stringify(canonical(value));

export function sameJsonContent(left, right) {
  if (left === right) return true;
  try {
    return comparable(JSON.parse(left)) === comparable(JSON.parse(right));
  } catch {
    return false;
  }
}
