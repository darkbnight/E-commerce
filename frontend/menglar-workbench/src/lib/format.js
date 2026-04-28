export function formatNumber(value, digits = 0) {
  if (value == null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const fixed = number.toFixed(digits);
  const [integerPart, fractionPart] = fixed.split('.');
  const sign = integerPart.startsWith('-') ? '-' : '';
  const unsignedInteger = sign ? integerPart.slice(1) : integerPart;
  const groupedInteger = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fractionPart == null ? `${sign}${groupedInteger}` : `${sign}${groupedInteger}.${fractionPart}`;
}

export function formatMoney(value) {
  if (value == null || value === '') return '-';
  return `¥ ${formatNumber(value, 2)}`;
}

export function formatCurrency(value, currency = 'CNY', digits = 2) {
  if (value == null || value === '') return '-';
  const symbolMap = {
    CNY: '¥',
    RUB: '₽',
    USD: '$',
  };
  const symbol = symbolMap[currency] || currency;
  return `${symbol} ${formatNumber(value, digits)}`;
}

export function formatPercent(value, digits = 2) {
  if (value == null || value === '') return '-';
  return `${formatNumber(value, digits)}%`;
}

export function formatText(value) {
  if (value == null || value === '') return '-';
  const text = String(value);
  return text.toLowerCase() === 'null' ? '-' : text;
}
