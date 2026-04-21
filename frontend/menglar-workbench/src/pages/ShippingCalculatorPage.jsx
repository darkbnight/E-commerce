import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { compareShippingServices, fetchShippingRuleInfo } from '../lib/api';
import { formatCurrency, formatNumber, formatText } from '../lib/format';

const defaultForm = {
  originCountry: 'CN',
  warehouseType: 'seller_warehouse',
  salesScheme: 'realFBS',
  price: '1',
  lengthCm: '1',
  widthCm: '1',
  heightCm: '1',
  weightG: '50',
  orderDate: '2026-04-21',
};

export function ShippingCalculatorPage() {
  const [form, setForm] = useState(defaultForm);
  const [sortOrder, setSortOrder] = useState('asc');

  const ruleInfoQuery = useQuery({
    queryKey: ['shipping-rule-info'],
    queryFn: fetchShippingRuleInfo,
  });

  const compareMutation = useMutation({
    mutationFn: compareShippingServices,
  });

  useEffect(() => {
    compareMutation.mutate(toPayload(defaultForm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    compareMutation.mutate(toPayload(form));
  };

  const handleReset = () => {
    setForm(defaultForm);
    compareMutation.mutate(toPayload(defaultForm));
  };

  const services = [...(compareMutation.data?.items || [])].sort((a, b) => {
    const left = a.result.totalLogisticsCost;
    const right = b.result.totalLogisticsCost;
    return sortOrder === 'asc' ? left - right : right - left;
  });

  return (
    <div className="wb-page shipping-page">
      <div className="shipping-workbench">
        <section className="shipping-options-panel">
          <div className="shipping-options-head">
            <p className="wb-kicker">商品含包装尺寸及重量</p>
            <h2>物流服务比价</h2>
            <p>输入商品参数，右侧列出当前规则中可用的 Ozon Global 官方服务。</p>
            <p className="shipping-accuracy-note">
              当前规则是官方样例校准库。改尺寸/重量会重新计算，但未完整采样的重量段不承诺与官方计算器完全一致。
              <Link to="/shipping-calculator/rules">查看规则说明</Link>
            </p>
          </div>

          <form className="shipping-form" onSubmit={handleSubmit}>
            <div className="shipping-dimension-grid">
              <label className="shipping-field">
                <span>长度，厘米</span>
                <input type="number" step="0.01" value={form.lengthCm} onChange={(e) => handleChange('lengthCm', e.target.value)} />
              </label>
              <label className="shipping-field">
                <span>宽度，厘米</span>
                <input type="number" step="0.01" value={form.widthCm} onChange={(e) => handleChange('widthCm', e.target.value)} />
              </label>
              <label className="shipping-field">
                <span>高度，厘米</span>
                <input type="number" step="0.01" value={form.heightCm} onChange={(e) => handleChange('heightCm', e.target.value)} />
              </label>
            </div>

            <label className="shipping-field">
              <span>包装重量，克</span>
              <input type="number" step="0.01" value={form.weightG} onChange={(e) => handleChange('weightG', e.target.value)} />
            </label>

            <div className="shipping-section-title">地理范围</div>
            <label className="shipping-field">
              <span>发货国家</span>
              <input value="China" readOnly />
            </label>
            <label className="shipping-field">
              <span>发货城市</span>
              <input value="Shenzhen" readOnly />
            </label>
            <label className="shipping-field">
              <span>目的地国家</span>
              <input value="Russia" readOnly />
            </label>

            <div className="shipping-section-title">货币与价格</div>
            <div className="shipping-price-grid">
              <label className="shipping-field">
                <span>货币</span>
                <input value="CNY" readOnly />
              </label>
              <label className="shipping-field">
                <span>商品价格</span>
                <input type="number" step="0.01" value={form.price} onChange={(e) => handleChange('price', e.target.value)} />
              </label>
            </div>

            <input type="hidden" value={form.orderDate} readOnly />

            <div className="shipping-actions">
              <button className="shipping-primary-button" type="submit" disabled={compareMutation.isPending}>
                {compareMutation.isPending ? '计算中' : '计算'}
              </button>
              <button className="shipping-secondary-button" type="button" onClick={handleReset}>
                重置
              </button>
            </div>

            {compareMutation.error ? (
              <div className="wb-feedback is-error" data-testid="shipping-error">
                {compareMutation.error.message}
              </div>
            ) : null}
          </form>
        </section>

        <section className="shipping-services-panel">
          <div className="shipping-services-toolbar">
            <div>
              找到的服务：<strong>{compareMutation.data?.total ?? ruleInfoQuery.data?.methodCount ?? 0}</strong>
            </div>
            <div className="shipping-sort-actions" aria-label="服务价格排序">
              <button
                type="button"
                className={sortOrder === 'asc' ? 'is-active' : ''}
                onClick={() => setSortOrder('asc')}
              >
                价格从低到高
              </button>
              <button
                type="button"
                className={sortOrder === 'desc' ? 'is-active' : ''}
                onClick={() => setSortOrder('desc')}
              >
                价格从高到低
              </button>
            </div>
          </div>

          {compareMutation.isPending ? (
            <div className="shipping-service-card" data-testid="shipping-loading">正在计算可用物流服务...</div>
          ) : null}

          <div className="shipping-services-list" data-testid="shipping-result">
            {services.map((item, index) => (
              <ShippingServiceCard key={item.service.deliveryMethodCode} item={item} index={index} />
            ))}

            {!services.length && !compareMutation.isPending ? (
              <div className="shipping-service-card">当前输入没有匹配到可用服务。</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function ShippingServiceCard({ item, index }) {
  const deliveryDays = item.service.deliveryDays
    ? `${item.service.deliveryDays.min}-${item.service.deliveryDays.max} 天`
    : '-';
  const isCheapest = index === 0 || item.service.tags?.includes('cheapest');
  const isFast = item.service.tags?.includes('fast');
  const batteryText = item.service.batteryPolicy === 'allowed' ? '可运输电池' : '不可运输电池';

  return (
    <motion.article
      className="shipping-service-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="shipping-service-main">
        <div>
          <div className="shipping-service-title-row">
            <h3>{item.service.displayName}</h3>
            {isCheapest ? <span className="shipping-tag">最便宜的</span> : null}
            {isFast ? <span className="shipping-tag muted">最快</span> : null}
          </div>
          <p>{item.service.officialSubtitle}</p>
        </div>

        <div className="shipping-service-price">
          <strong>{formatCurrency(item.result.totalLogisticsCost, item.result.currency)}</strong>
          <span>{formatNumber(item.result.totalLogisticsCost * 100, 0)}% 成本</span>
        </div>
      </div>

      <div className="shipping-service-meta">
        <span>⏱ 从 {deliveryDays}</span>
      </div>
    </motion.article>
  );
}

function toPayload(form) {
  return {
    originCountry: form.originCountry,
    warehouseType: form.warehouseType,
    salesScheme: form.salesScheme,
    price: Number(form.price),
    lengthCm: Number(form.lengthCm),
    widthCm: Number(form.widthCm),
    heightCm: Number(form.heightCm),
    weightG: Number(form.weightG),
    orderDate: form.orderDate,
  };
}
