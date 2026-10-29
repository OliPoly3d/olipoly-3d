// One categorized spending representation for purchases, split charges and refunds.
export function spendingParts(transaction) {
  if (!['expense', 'refund'].includes(transaction.kind)) return [];
  const sign = transaction.kind === 'refund' ? -1 : 1;
  return (
    transaction.allocations || [
      { category: transaction.category, amount: Math.abs(transaction.entries[0].amount) },
    ]
  ).map((p) => ({ category: p.category, amount: sign * p.amount }));
}
export const transactionOwner = (model, t) =>
  t.expenseEntity || model.accounts.find((a) => a.id === t.entries[0].account)?.entity;
export function scaleAllocations(parts, total) {
  const sum = parts.reduce((n, p) => n + p.amount, 0);
  let remaining = total;
  return parts
    .map((p, i) => {
      const amount = i === parts.length - 1 ? remaining : Math.floor((total * p.amount) / sum);
      remaining -= amount;
      return { ...p, amount };
    })
    .filter((p) => p.amount > 0);
}
export function validateAllocations(t) {
  if (t.allocations === undefined) return;
  if (
    !['expense', 'refund'].includes(t.kind) ||
    !Array.isArray(t.allocations) ||
    !t.allocations.length
  )
    throw Error('Split categories belong to a purchase or refund.');
  if (
    t.allocations.some(
      (p) => !p.category?.trim() || !Number.isSafeInteger(p.amount) || p.amount <= 0,
    ) ||
    t.allocations.reduce((n, p) => n + p.amount, 0) !== Math.abs(t.entries[0].amount)
  )
    throw Error('Split category amounts must be positive and add up to the transaction total.');
}
export function validateRefunds(model) {
  for (const source of model.refundContext || []) {
    if (
      source.kind !== 'expense' ||
      source.date > model.start ||
      !model.accounts.some((a) => a.id === source.entries?.[0]?.account)
    )
      throw Error('Invalid snapshot refund context.');
    validateAllocations(source);
  }
  const sources = new Map(
      [
        ...(model.refundContext || []),
        ...model.transactions.filter((t) => t.kind === 'expense'),
      ].map((t) => [t.id, t]),
    ),
    used = new Map();
  for (const t of model.transactions.filter((t) => t.kind === 'refund')) {
    const original = sources.get(t.refundOf);
    if (original && t.date < original.date)
      throw Error('A linked refund cannot precede its original purchase.');
    if (!original || transactionOwner(model, t) !== transactionOwner(model, original))
      throw Error('Link the refund to an existing purchase belonging to the same owner.');
    const available = new Map();
    for (const p of spendingParts(original))
      available.set(p.category, (available.get(p.category) || 0) + p.amount);
    const refunds = used.get(original.id) || new Map();
    for (const p of spendingParts(t)) {
      const amount = -p.amount;
      if (
        !available.has(p.category) ||
        (refunds.get(p.category) || 0) + amount > available.get(p.category)
      )
        throw Error('Linked refunds cannot exceed the original purchase amount in a category.');
      refunds.set(p.category, (refunds.get(p.category) || 0) + amount);
    }
    used.set(original.id, refunds);
  }
  return model;
}
export function refundableParts(model, id, exceptId) {
  const original = model.transactions.find((t) => t.id === id && t.kind === 'expense');
  if (!original) return [];
  const remaining = new Map();
  for (const p of spendingParts(original))
    remaining.set(p.category, (remaining.get(p.category) || 0) + p.amount);
  for (const t of model.transactions.filter(
    (t) => t.kind === 'refund' && t.refundOf === id && t.id !== exceptId,
  ))
    for (const p of spendingParts(t))
      remaining.set(p.category, (remaining.get(p.category) || 0) + p.amount);
  return [...remaining]
    .map(([category, amount]) => ({ category, amount }))
    .filter((p) => p.amount > 0);
}
