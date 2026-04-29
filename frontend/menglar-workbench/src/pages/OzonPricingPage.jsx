import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Panel } from '../components/Panel';
import { compareShippingServices } from '../lib/api';
import categoryRatesData from '../modules/ozon-pricing/data/categoryRates.json';
import exchangeRatesData from '../modules/ozon-pricing/data/exchangeRates.json';
import logisticsData from '../modules/ozon-pricing/data/logistics.json';
import {
  calculatePricing,
  defaultPricingForm,
  getRate,
  normalizeInitialForm,
} from '../modules/ozon-pricing/pricingCalculator';

const categoryRates = categoryRatesData.items || [];
const exchangeRates = exchangeRatesData.items || [];
const logistics = logisticsData.items || [];

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function OzonPricingPage() {
  const [form, setForm] = useState(() => normalizeInitialForm(defaultPricingForm, categoryRates, logistics));
  const [compareOpen, setCompareOpen] = useState(false);

  const shippingPayload = useMemo(() => toShippingPayload(form), [
    form.purchaseCost,
    form.weight,
    form.volumeL,
    form.volumeW,
    form.volumeH,
  ]);

  const shippingMutation = useMutation({ mutationFn: compareShippingServices });

  useEffect(() => {
    shippingMutation.mutate(shippingPayload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingPayload.price, shippingPayload.weightG, shippingPayload.lengthCm, shippingPayload.widthCm, shippingPayload.heightCm]);

  const shippingServices = useMemo(
    () => [...(shippingMutation.data?.items || [])].sort((a, b) => a.result.totalLogisticsCost - b.result.totalLogisticsCost),
    [shippingMutation.data],
  );

  useEffect(() => {
    if (!shippingServices.length) return;
    const hasSelected = shippingServices.some((item) => getShippingServiceKey(item) === form.shippingServiceKey);
    if (!hasSelected) {
      setForm((prev) => ({ ...prev, shippingServiceKey: getShippingServiceKey(shippingServices[0]) }));
    }
  }, [shippingServices, form.shippingServiceKey]);

  const selectedShippingService =
    shippingServices.find((item) => getShippingServiceKey(item) === form.shippingServiceKey) || shippingServices[0] || null;
  const selectedShippingQuote = selectedShippingService ? toShippingQuote(selectedShippingService, exchangeRates) : null;

  const result = useMemo(
    () => calculatePricing({
      form,
      logistics,
      categoryRates,
      exchangeRates,
      shippingQuote: selectedShippingQuote,
    }),
    [form, selectedShippingQuote],
  );

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(normalizeInitialForm(defaultPricingForm, categoryRates, logistics));
  }

  return (
    <div className="wb-page ozon-pricing-page">
      <div className="ozon-pricing-hero">
        <div>
          <p className="wb-kicker">Ozon Local Pricing</p>
          <h2>Ozon 快速定价</h2>
          <p>基于类目佣金、汇率快照和物流计算器结果快速估算折前价、折后价、利润和跨境物流成本。</p>
        </div>
        <div className="ozon-pricing-rate-card">
          <span>数据快照</span>
          <strong>{formatDate(categoryRatesData.generatedAt || logisticsData.generatedAt)}</strong>
          <small>1 CNY = {rateText('USD')} USD / {rateText('RUB')} RUB</small>
        </div>
      </div>

      <div className="ozon-pricing-layout">
        <Panel
          title="定价参数"
          subtitle="把物流参数和费用集中填写；境外物流按当前重量和尺寸调用物流计算器。"
          actions={<button className="wb-button ghost" type="button" onClick={resetForm}>重置</button>}
        >
          <form className="ozon-pricing-form" onSubmit={(event) => event.preventDefault()}>
            <div className="ozon-pricing-category-row span-2">
            <label className="ozon-pricing-field">
              <span>所属行业</span>
              <select value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)}>
                {categoryRates.map((item) => (
                  <option key={item.cId} value={item.cId}>
                    {item.name} - {percent(item.rate)}
                  </option>
                ))}
              </select>
            </label>
              <NumberField label="手动佣金率" unit="%" value={form.manualCategoryRate} placeholder="为空则用类目" onChange={(value) => updateField('manualCategoryRate', value)} />
            </div>

            <NumberField testId="purchase-cost" label="采购成本" unit="¥" value={form.purchaseCost} onChange={(value) => updateField('purchaseCost', value)} />

            <label className="ozon-pricing-field">
              <span>毛利</span>
              <div className="ozon-pricing-split-input">
                <select value={form.profitType} onChange={(event) => updateField('profitType', event.target.value)}>
                  <option value="rate">毛利率</option>
                  <option value="amount">毛利额</option>
                </select>
                <input data-testid="ozon-pricing-profit-value" type="number" min="0" step="0.01" value={form.profitVal} onChange={(event) => updateField('profitVal', event.target.value)} />
                <b>{form.profitType === 'amount' ? '¥' : '%'}</b>
              </div>
            </label>

            <NumberField testId="discount" label="前台折扣" unit="%" value={form.discount} onChange={(value) => updateField('discount', value)} />
            <NumberField label="广告费率" unit="%" value={form.adsRate} onChange={(value) => updateField('adsRate', value)} />
            <NumberField label="提现费率" unit="%" value={form.cashRate} onChange={(value) => updateField('cashRate', value)} />
            <NumberField label="退货货损率" unit="%" value={form.refundRate} onChange={(value) => updateField('refundRate', value)} />
            <NumberField label="其他费用" unit="¥" value={form.otherFee} onChange={(value) => updateField('otherFee', value)} />
            <fieldset className="ozon-pricing-logistics span-2">
              <legend>物流参数与费用</legend>
              <div className="ozon-pricing-logistics-grid">
                <NumberField testId="weight" label="包装重量" unit="g" step="1" value={form.weight} onChange={(value) => updateField('weight', value)} />
                <NumberField testId="volume-l" label="长，厘米" value={form.volumeL} onChange={(value) => updateField('volumeL', value)} />
                <NumberField testId="volume-w" label="宽，厘米" value={form.volumeW} onChange={(value) => updateField('volumeW', value)} />
                <NumberField testId="volume-h" label="高，厘米" value={form.volumeH} onChange={(value) => updateField('volumeH', value)} />

                <label className="ozon-pricing-field ozon-pricing-shipping-field">
                  <span>境外物流方式</span>
                  <select
                    data-testid="ozon-pricing-shipping-service"
                    value={form.shippingServiceKey}
                    onChange={(event) => updateField('shippingServiceKey', event.target.value)}
                    disabled={shippingMutation.isPending || !shippingServices.length}
                  >
                    {shippingMutation.isPending ? <option value="">正在按物流计算器计算...</option> : null}
                    {!shippingMutation.isPending && !shippingServices.length ? <option value="">当前重量和尺寸没有可用物流服务</option> : null}
                    {shippingServices.map((item) => (
                      <option key={getShippingServiceKey(item)} value={getShippingServiceKey(item)}>
                        {formatShippingOption(item)}
                      </option>
                    ))}
                  </select>
                  {shippingMutation.error ? (
                    <small className="ozon-pricing-field-note is-danger">
                      物流计算器暂时不可用，可先填写手动物流费继续估算：{shippingMutation.error.message}
                    </small>
                  ) : (
                    <small className="ozon-pricing-field-note">标准参考以物流计算器页面为准。</small>
                  )}
                </label>

                <div className="ozon-pricing-logistics-action">
                  <button className="wb-button ghost" type="button" onClick={() => setCompareOpen(true)}>
                    查看物流费用对比
                  </button>
                </div>

                <NumberField label="境内段运费" unit="¥" value={form.chinaFee} onChange={(value) => updateField('chinaFee', value)} />
                <NumberField label="手动境外物流费" unit="¥" value={form.manualLogisticsFee} placeholder="为空则使用物流计算器" onChange={(value) => updateField('manualLogisticsFee', value)} />
              </div>
            </fieldset>
          </form>
        </Panel>

        <section className="ozon-pricing-results">
          {result.ok ? <PricingResult result={result} /> : <div className="wb-feedback is-error">{result.error}</div>}
        </section>
      </div>

      {compareOpen ? (
        <div className="ozon-pricing-modal" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCompareOpen(false);
        }}>
          <motion.section
            className="ozon-pricing-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="物流费用对比"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="ozon-pricing-dialog-head">
              <div>
                <p className="wb-kicker">Shipping Calculator</p>
                <h2>物流费用对比</h2>
                <p>重量 {numberValue(form.weight)}g，尺寸 {numberValue(form.volumeL)} x {numberValue(form.volumeW)} x {numberValue(form.volumeH)} cm</p>
              </div>
              <button className="wb-button ghost" type="button" onClick={() => setCompareOpen(false)}>关闭</button>
            </div>
            <div className="ozon-pricing-compare-head">
              <span>物流服务</span>
              <span>物流计算器结果</span>
            </div>
            <div className="ozon-pricing-compare-list">
              {shippingMutation.isPending ? <div className="ozon-pricing-compare-empty">正在计算可用物流服务...</div> : null}
              {!shippingMutation.isPending && !shippingServices.length ? <div className="ozon-pricing-compare-empty">当前参数没有匹配到可用物流服务。</div> : null}
              {shippingServices.map((item, index) => (
                <button
                  type="button"
                  className={`ozon-pricing-compare-row ${getShippingServiceKey(item) === form.shippingServiceKey ? 'is-active' : ''}`}
                  key={getShippingServiceKey(item)}
                  onClick={() => {
                    updateField('shippingServiceKey', getShippingServiceKey(item));
                    setCompareOpen(false);
                  }}
                >
                  <div className="ozon-pricing-carrier">
                    <span>{index + 1}</span>
                    <strong>{item.service.displayName}</strong>
                    <small>{item.service.officialSubtitle || item.service.deliveryMethodCode}</small>
                  </div>
                  <div className="ozon-pricing-fee-lines">
                    <strong>{formatCurrency(item.result.totalLogisticsCost, item.result.currency)}</strong>
                    <span>计费重 {item.result.chargeableWeightG}g，实重 {item.result.physicalWeightG}g，体积重 {item.result.volumetricWeightG}g</span>
                    <span>{formatDeliveryDays(item.service.deliveryDays)} / {formatConfidence(item.service.sourceConfidence)}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.section>
        </div>
      ) : null}
    </div>
  );

  function rateText(code) {
    const item = exchangeRates.find((rate) => rate.currency_code === code);
    return item ? Number(item.rate).toFixed(4) : '-';
  }
}

function PricingResult({ result }) {
  const logisticsNote = result.input.manualLogisticsFee != null
    ? '手动覆盖'
    : result.shippingQuote
      ? `${result.shippingQuote.name}，物流计算器，计费重 ${result.logistics.charged.toFixed(0)}g`
      : `${result.logistic.name}，本地快照估算，${result.logistics.unit}g 进位${volumeNote(result)}`;

  const costRows = [
    ['总成本', result.totalCost, '不含利润，含固定成本和按售价计算的费率成本'],
    ['采购成本', result.input.purchaseCost],
    ['境内段运费', result.input.chinaFee],
    ['跨境物流费', result.logisticsFee, logisticsNote],
    ['平台佣金', result.commission, `${result.input.manualCategoryRate != null ? '手动覆盖' : result.category.name}，${percent(result.categoryRate)}`],
    ['广告费用', result.adsFee],
    ['提现手续费', result.cashFee],
    ['退货货损', result.refundFee],
    ['其他费用', result.input.otherFee],
  ];

  return (
    <>
      <Panel title="计算结果" subtitle={`类目/汇率快照更新时间：${formatDate(categoryRatesData.generatedAt)}`}>
        <div className="ozon-pricing-price-grid">
          <MetricCard label="商品原价（折前）" value={`₽ ${money(result.originalPriceRub)}`} sub={`¥ ${money(result.originalPriceRmb)}`} highlight />
          <MetricCard label="商品售价（折后）" value={`₽ ${money(result.salePriceRub)}`} sub={`¥ ${money(result.salePriceRmb)}`} highlight />
        </div>

        <div className="ozon-pricing-summary-grid">
          <MetricCard label="预计利润" value={`¥ ${money(result.profit)}`} />
          <MetricCard label="毛利率" value={percent(result.actualProfitRate)} />
          <MetricCard label="计费重量" value={`${result.logistics.charged.toFixed(0)}g`} />
          <MetricCard
            label="总物流占比"
            value={percent(result.totalLogisticsShare)}
            info={`境内物流占比：${percent(result.domesticLogisticsShare)}\n跨境物流占比：${percent(result.crossBorderLogisticsShare)}\n总物流占比：${percent(result.totalLogisticsShare)}`}
          />
        </div>

        {result.warnings.length ? (
          <div className="ozon-pricing-warning" data-testid="ozon-pricing-warning">
            {result.warnings.join(' ')}
          </div>
        ) : null}
      </Panel>

      <Panel title="收入">
        <ResultTable rows={[
          ['商品原价（折前）', `₽ ${money(result.originalPriceRub)} / ¥ ${money(result.originalPriceRmb)}`],
          ['商品售价（折后）', `₽ ${money(result.salePriceRub)} / ¥ ${money(result.salePriceRmb)}`],
          ['利润', `¥ ${money(result.profit)}`],
          ['利润率', percent(result.actualProfitRate)],
        ]} />
      </Panel>

      <Panel title="成本">
        <ResultTable rows={costRows.map(([label, value, note]) => [label, `¥ ${money(value)}`, note])} />
      </Panel>
    </>
  );
}

function NumberField({ label, unit, value, step = '0.01', placeholder, testId, onChange }) {
  return (
    <label className="ozon-pricing-field">
      <span>{label}</span>
      <div className={unit ? 'ozon-pricing-unit-input' : ''}>
        <input
          data-testid={testId ? `ozon-pricing-${testId}` : undefined}
          type="number"
          min="0"
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit ? <b>{unit}</b> : null}
      </div>
    </label>
  );
}

function MetricCard({ label, value, sub, highlight = false, info = '' }) {
  return (
    <div className={`ozon-pricing-metric ${highlight ? 'is-highlight' : ''}`}>
      <span className="ozon-pricing-metric-label">
        {label}
        {info ? (
          <button className="ozon-pricing-info" type="button" aria-label={info}>
            !
            <span role="tooltip">{info}</span>
          </button>
        ) : null}
      </span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function ResultTable({ rows }) {
  return (
    <div className="ozon-pricing-table">
      {rows.map(([label, value, note]) => (
        <div className="ozon-pricing-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {note ? <small>{note}</small> : null}
        </div>
      ))}
    </div>
  );
}

function toShippingPayload(form) {
  return {
    originCountry: 'CN',
    warehouseType: 'seller_warehouse',
    salesScheme: 'realFBS',
    price: Math.max(numberValue(form.purchaseCost), 1),
    lengthCm: Math.max(numberValue(form.volumeL), 0.01),
    widthCm: Math.max(numberValue(form.volumeW), 0.01),
    heightCm: Math.max(numberValue(form.volumeH), 0.01),
    weightG: Math.max(numberValue(form.weight), 1),
    orderDate: '2026-04-21',
    includeXlsxCandidates: false,
  };
}

function toShippingQuote(item, rates) {
  const currency = item.result.currency || 'CNY';
  const rawFee = Number(item.result.totalLogisticsCost || 0);
  let feeRmb = rawFee;
  if (currency === 'USD') {
    const usdRate = getRate(rates, 'USD');
    feeRmb = usdRate > 0 ? rawFee / usdRate : rawFee * 7.2;
  }
  if (currency === 'RUB') {
    const rubRate = getRate(rates, 'RUB');
    feeRmb = rubRate > 0 ? rawFee / rubRate : rawFee;
  }
  return {
    key: getShippingServiceKey(item),
    name: item.service.displayName,
    feeRmb,
    feeOriginal: rawFee,
    currency,
    chargeableWeightG: item.result.chargeableWeightG,
    physicalWeightG: item.result.physicalWeightG,
    volumetricWeightG: item.result.volumetricWeightG,
    incrementUnitG: item.result.ruleMeta?.incrementUnitG,
  };
}

function getShippingServiceKey(item) {
  return `${item.service.carrierCode}:${item.service.deliveryMethodCode}`;
}

function formatShippingOption(item) {
  return `${item.service.displayName}（${formatCurrency(item.result.totalLogisticsCost, item.result.currency)}，计费重 ${item.result.chargeableWeightG}g）`;
}

function formatCurrency(value, currency = 'CNY') {
  const symbolMap = {
    CNY: '¥',
    USD: '$',
    RUB: '₽',
  };
  return `${symbolMap[currency] || currency} ${money(value)}`;
}

function formatDeliveryDays(deliveryDays) {
  if (!deliveryDays) return '时效未知';
  return `时效 ${deliveryDays.min}-${deliveryDays.max} 天`;
}

function formatConfidence(value) {
  if (value === 'official_calculator_verified') return '官方计算器已校准';
  return 'XLSX 费率候选';
}

function volumeNote(result) {
  if (result.logistics.volumetricWeight <= result.logistics.actualWeight) return '';
  return `，体积重 ${result.logistics.volumetricWeight.toFixed(0)}g`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}
