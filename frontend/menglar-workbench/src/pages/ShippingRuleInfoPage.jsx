import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '../components/Panel';
import { fetchShippingRuleInfo } from '../lib/api';
import { formatNumber, formatText } from '../lib/format';

export function ShippingRuleInfoPage() {
  const ruleInfoQuery = useQuery({
    queryKey: ['shipping-rule-info'],
    queryFn: fetchShippingRuleInfo,
  });

  const info = ruleInfoQuery.data;

  return (
    <div className="wb-page">
      <div className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Shipping Rules</p>
          <h2>物流规则说明</h2>
          <p>
            这里只说明本地 JSON 规则的来源、覆盖范围和准确性边界。物流计算器主页面不再承载这些说明。
          </p>
        </div>
        <div className="wb-hero-card">
          <span>当前方法数</span>
          <strong>{formatNumber(info?.methodCount || 0)}</strong>
          <small>{formatText(info?.meta?.updatedAt)}</small>
        </div>
      </div>

      <Panel
        title="规则来源"
        subtitle="当前规则只允许录入 Ozon 官方文档或 Ozon Global 官方计算器中出现过的服务"
        actions={<Link className="wb-button ghost" to="/shipping-calculator">返回计算器</Link>}
      >
        <div className="wb-rule-info-grid">
          <div className="wb-rule-info-card">
            <span>来源</span>
            <strong>{formatText(info?.meta?.source)}</strong>
            <small>当前规则文件：config/shipping/rules.json</small>
          </div>
          <div className="wb-rule-info-card">
            <span>汇率</span>
            <strong>{formatText(info?.fx?.latestDate)}</strong>
            <small>{formatText(info?.fx?.baseCurrency)} / {formatText(info?.fx?.quoteCurrency)}</small>
          </div>
          <div className="wb-rule-info-card">
            <span>校准样本</span>
            <strong>1x1x1 / 50g</strong>
            <small>China / Shenzhen / Russia / CNY</small>
          </div>
        </div>
      </Panel>

      <Panel title="准确性边界" subtitle="这部分很关键，避免把样例校准误当成完整官方费率库">
        <ul className="wb-notes">
          <li>当前已录入服务是按官方计算器截图样例校准，不是 114 个服务全量覆盖。</li>
          <li>修改价格、尺寸、重量后，系统会按本地 JSON 中已有规则重新计算。</li>
          <li>如果某个服务在规则中是固定样例价，改重量后不保证与 Ozon 官方计算器完全一致。</li>
          <li>如果某个服务在规则中有明确线性公式，改重量会按公式计算，但仍需要更多官方样本校验。</li>
          <li>要用于大规模选品，下一步必须继续补齐官方费率表或更多官方计算器采样点。</li>
        </ul>
      </Panel>
    </div>
  );
}
