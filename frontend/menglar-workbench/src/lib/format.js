export function formatNumber(value, digits = 0) {
  if (value == null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(value) {
  if (value == null || value === '') return '-';
  return `¥ ${formatNumber(value, 2)}`;
}

export function formatCurrency(value, currency = 'CNY') {
  if (value == null || value === '') return '-';
  const symbolMap = {
    CNY: '¥',
    RUB: '₽',
    USD: '$',
  };
  const symbol = symbolMap[currency] || currency;
  return `${symbol} ${formatNumber(value, 2)}`;
}

export function formatPercent(value) {
  if (value == null || value === '') return '-';
  return `${formatNumber(value, 2)}%`;
}

export function formatText(value) {
  if (value == null || value === '') return '-';
  const text = String(value);
  return text.toLowerCase() === 'null' ? '-' : text;
}
