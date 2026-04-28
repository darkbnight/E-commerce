import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Panel } from '../components/Panel';
import categoryRatesData from '../modules/ozon-pricing/data/categoryRates.json';
import exchangeRatesData from '../modules/ozon-pricing/data/exchangeRates.json';
import logisticsData from '../modules/ozon-pricing/data/logistics.json';
import {
  buildLogisticsCompare,
  calculatePricing,
  defaultPricingForm,
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

  const result = useMemo(
    () => calculatePricing({ form, logistics, categoryRates, exchangeRates }),
    [form],
  );
  const compareItems = useMemo(
    () => buildLogisticsCompare({ form, logistics, exchangeRates }),
    [form],
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
          <p>基于本地物流、类目佣金和汇率快照快速估算折前价、折后价、利润和跨境物流成本。</p>
        </div>
        <div className="ozon-pricing-rate-card">
          <span>数据快照</span>
          <strong>{formatDate(logisticsData.generatedAt || categoryRatesData.generatedAt)}</strong>
          <small>1 CNY = {rateText('USD')} USD / {rateText('RUB')} RUB</small>
        </div>
      </div>

      <div className="ozon-pricing-layout">
        <Panel
          title="定价参数"
          subtitle="字段修改后会自动重新计算，手动覆盖项为空时使用快照数据。"
          actions={<button className="wb-button ghost" type="button" onClick={resetForm}>重置</button>}
        >
          <form className="ozon-pricing-form" onSubmit={(event) => event.preventDefault()}>
            <label className="ozon-pricing-field span-2">
              <span>所属行业</span>
              <select value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)}>
                {categoryRates.map((item) => (
                  <option key={item.cId} value={item.cId}>
                    {item.name} - {percent(item.rate)}
                  </option>
                ))}
              </select>
            </label>

            <NumberField label="采购成本" unit="¥" value={form.purchaseCost} onChange={(value) => updateField('purchaseCost', value)} />
            <NumberField label="包装重量" unit="g" step="1" value={form.weight} onChange={(value) => updateField('weight', value)} />

            <label className="ozon-pricing-field">
              <span>毛利</span>
              <div className="ozon-pricing-split-input">
                <select value={form.profitType} onChange={(event) => updateField('profitType', event.target.value)}>
                  <option value="rate">毛利率</option>
                  <option value="amount">毛利额</option>
                </select>
                <input type="number" min="0" step="0.01" value={form.profitVal} onChange={(event) => updateField('profitVal', event.target.value)} />
                <b>{form.profitType === 'amount' ? '¥' : '%'}</b>
              </div>
            </label>
            <NumberField label="前台折扣" unit="%" value={form.discount} onChange={(value) => updateField('discount', value)} />

            <label className="ozon-pricing-field span-2">
              <span>境外物流方式</span>
              <select value={form.logisticId} onChange={(event) => updateField('logisticId', event.target.value)}>
                {logistics.map((item) => (
                  <option key={item.logId} value={item.logId}>
                    {formatLogisticOption(item, result)}
                  </option>
                ))}
              </select>
            </label>

            <div className="span-2">
              <button className="wb-button ghost" type="button" onClick={() => setCompareOpen(true)}>
                查看 CEL 物流费用对比
              </button>
            </div>

            <label className="ozon-pricing-field">
              <span>交货类型</span>
              <select value={form.deliveryType} onChange={(event) => updateField('deliveryType', event.target.value)}>
                <option value="1">到取货点</option>
                <option value="2">快递上门</option>
              </select>
            </label>
            <NumberField label="境内段运费" unit="¥" value={form.chinaFee} onChange={(value) => updateField('chinaFee', value)} />
            <NumberField label="广告费率" unit="%" value={form.adsRate} onChange={(value) => updateField('adsRate', value)} />
            <NumberField label="提现费率" unit="%" value={form.cashRate} onChange={(value) => updateField('cashRate', value)} />
            <NumberField label="退货货损率" unit="%" value={form.refundRate} onChange={(value) => updateField('refundRate', value)} />
            <NumberField label="其他费用" unit="¥" value={form.otherFee} onChange={(value) => updateField('otherFee', value)} />

            <fieldset className="ozon-pricing-volume span-2">
              <legend>产品外箱体积，厘米</legend>
              <NumberField label="长" value={form.volumeL} onChange={(value) => updateField('volumeL', value)} />
              <NumberField label="宽" value={form.volumeW} onChange={(value) => updateField('volumeW', value)} />
              <NumberField label="高" value={form.volumeH} onChange={(value) => updateField('volumeH', value)} />
            </fieldset>

            <NumberField label="手动物流费" unit="¥" value={form.manualLogisticsFee} placeholder="为空则自动估算" onChange={(value) => updateField('manualLogisticsFee', value)} />
            <NumberField label="手动佣金率" unit="%" value={form.manualCategoryRate} placeholder="为空则用类目" onChange={(value) => updateField('manualCategoryRate', value)} />
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
            aria-label="CEL 物流费用对比"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="ozon-pricing-dialog-head">
              <div>
                <p className="wb-kicker">CEL Logistics</p>
                <h2>物流费用对比</h2>
              </div>
              <button className="wb-button ghost" type="button" onClick={() => setCompareOpen(false)}>关闭</button>
            </div>
            <div className="ozon-pricing-compare-head">
              <span>物流商</span>
              <span>跨境物流费用</span>
            </div>
            <div className="ozon-pricing-compare-list">
              {compareItems.map((item) => (
                <div className="ozon-pricing-compare-row" key={item.id}>
                  <div className="ozon-pricing-carrier">
                    {item.logo ? <img src={item.logo} alt="" /> : <span />}
                    <strong>{item.name}</strong>
                  </div>
                  <div className="ozon-pricing-fee-lines">
                    <span>到取货点：$ {money(item.pickupUsd)} / ¥ {money(item.pickup.feeRmb)}</span>
                    {item.hasDoor ? <span>快递上门：$ {money(item.doorUsd)} / ¥ {money(item.door.feeRmb)}</span> : null}
                  </div>
                </div>
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
  const costRows = [
    ['采购成本', result.input.purchaseCost],
    ['境内段运费', result.input.chinaFee],
    ['跨境物流费', result.logisticsFee, result.input.manualLogisticsFee != null ? '手动覆盖' : `${result.logistic.name}，${result.logistics.unit}g 进位${volumeNote(result)}`],
    ['平台佣金', result.commission, `${result.input.manualCategoryRate != null ? '手动覆盖' : result.category.name}，${percent(result.categoryRate)}`],
    ['广告费用', result.adsFee],
    ['提现手续费', result.cashFee],
    ['退货货损', result.refundFee],
    ['其他费用', result.input.otherFee],
  ];

  return (
    <>
      <Panel title="计算结果" subtitle={`快照更新时间：${formatDate(logisticsData.generatedAt)}`}>
        <div className="ozon-pricing-price-grid">
          <MetricCard label="商品原价（折前）" value={`$ ${money(result.originalPriceUsd)}`} sub={`₽ ${money(result.originalPriceRub)}`} highlight />
          <MetricCard label="商品售价（折后）" value={`$ ${money(result.salePriceUsd)}`} sub={`₽ ${money(result.salePriceRub)}`} highlight />
        </div>

        <div className="ozon-pricing-summary-grid">
          <MetricCard label="预计利润" value={`¥ ${money(result.profit)}`} />
          <MetricCard label="毛利率" value={percent(result.actualProfitRate)} />
          <MetricCard label="计费重量" value={`${result.logistics.charged.toFixed(0)}g`} />
          <MetricCard label="物流占比" value={percent(result.logisticsShare)} />
        </div>

        {result.warnings.length ? (
          <div className="ozon-pricing-warning" data-testid="ozon-pricing-warning">
            {result.warnings.join(' ')}
          </div>
        ) : null}
      </Panel>

      <Panel title="收入">
        <ResultTable rows={[
          ['商品原价（折前）', `¥ ${money(result.originalPriceRmb)} / ₽ ${money(result.originalPriceRub)}`],
          ['商品售价（折后）', `¥ ${money(result.salePriceRmb)} / ₽ ${money(result.salePriceRub)}`],
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

function NumberField({ label, unit, value, step = '0.01', placeholder, onChange }) {
  return (
    <label className="ozon-pricing-field">
      <span>{label}</span>
      <div className={unit ? 'ozon-pricing-unit-input' : ''}>
        <input
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

function MetricCard({ label, value, sub, highlight = false }) {
  return (
    <div className={`ozon-pricing-metric ${highlight ? 'is-highlight' : ''}`}>
      <span>{label}</span>
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

function formatLogisticOption(item, result) {
  const carrier = item.logName ? `${item.logName} / ` : '';
  if (!result.ok || String(result.logistic.logId) !== String(item.logId)) {
    return `${carrier}${item.name}`;
  }
  return `${carrier}${item.name}（估 ¥${money(result.logistics.feeRmb)}）`;
}

function volumeNote(result) {
  if (result.logistics.volumetricWeight <= result.logistics.actualWeight) return '';
  return `，体积重 ${result.logistics.volumetricWeight.toFixed(0)}g`;
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
