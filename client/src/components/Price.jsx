export function Price({ cents, amount, value, className = '' }) {
  let num = 0;
  if (value !== undefined && value !== null) num = Number(value);
  else if (amount !== undefined && amount !== null) num = Number(amount);
  else if (cents !== undefined && cents !== null) {
    num = Number(cents);
    if (num > 1000 && Number.isInteger(num)) {
      num = num / 100;
    }
  }

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num || 0);

  return <span className={className}>{formatted}</span>;
}
