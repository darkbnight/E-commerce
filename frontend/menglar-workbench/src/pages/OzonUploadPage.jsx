import { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Panel } from '../components/Panel';
import {
  executeOzonAction,
  fetchOzonAttributeValues,
  fetchOzonCategoryAttributes,
  fetchOzonImportInfo,
  fetchOzonTemplate,
  validateOzonPayload,
} from '../lib/api';
import { formatNumber, formatText } from '../lib/format';

const STORAGE_KEY = 'ozon-upload-connection-v1';

const modeOptions = [
  {
    key: 'products',
    title: '商品上货',
    description: '创建或更新 Ozon 商品，自动按 100 条分片。',
    action: 'upload',
  },
  {
    key: 'prices',
    title: '更新价格',
    description: '批量更新 offer_id 或 product_id 对应价格。',
    action: 'prices',
  },
  {
    key: 'stocks',
    title: '更新库存',
    description: '按仓库更新库存，必须确认 warehouse_id。',
    action: 'stocks',
  },
];

const initialCredentials = {
  clientId: '',
  apiKey: '',
  baseUrl: '',
};

function loadStoredCredentials() {
  if (typeof window === 'undefined') return initialCredentials;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialCredentials;
    const parsed = JSON.parse(raw);
    return {
      clientId: parsed.clientId || '',
      apiKey: parsed.apiKey || '',
      baseUrl: parsed.baseUrl || '',
    };
  } catch {
    return initialCredentials;
  }
}

function getMaskedKey(value) {
  if (!value) return '未保存';
  if (value.length <= 8) return '已保存';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function getResultSummary(result, parsedState) {
  if (!result?.payload) {
    return [
      { label: '当前状态', value: '等待操作' },
      { label: '数据条数', value: formatNumber(parsedState.itemCount) },
      { label: '预计分片', value: parsedState.itemCount ? formatNumber(Math.ceil(parsedState.itemCount / 100)) : '-' },
    ];
  }

  const payload = result.payload;
  const warnings = payload.warnings || [];
  const errors = payload.errors || payload.details?.errors || [];
  const taskId =
    payload.result?.results?.[0]?.response?.result?.task_id ||
    payload.result?.task_id ||
    payload.result?.result?.task_id ||
    '-';

  return [
    { label: '当前状态', value: result.ok ? '成功' : '失败' },
    { label: '数据条数', value: formatNumber(payload.itemCount ?? parsedState.itemCount) },
    { label: '预计/实际分片', value: formatNumber(payload.result?.batchCount || Math.ceil((payload.itemCount || parsedState.itemCount || 0) / 100) || 0) },
    { label: 'task_id', value: formatText(taskId) },
    { label: '警告数', value: formatNumber(warnings.length) },
    { label: '错误数', value: formatNumber(errors.length) },
  ];
}

function collectValidationIssues(result) {
  if (!result?.payload) return [];
  return [
    ...(result.payload.errors || []),
    ...(result.payload.details?.errors || []),
    ...(result.payload.warnings || []),
  ];
}

function inferCategoryId(payload) {
  const firstItem = payload?.items?.[0];
  return firstItem?.category_id ? String(firstItem.category_id) : '';
}

export function OzonUploadPage() {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('products');
  const [credentials, setCredentials] = useState(loadStoredCredentials);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [result, setResult] = useState(null);
  const [taskId, setTaskId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [attributeId, setAttributeId] = useState('');
  const [confirmLiveRun, setConfirmLiveRun] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const currentMode = modeOptions.find((item) => item.key === mode) || modeOptions[0];

  const parsedState = useMemo(() => {
    try {
      if (!jsonText.trim()) {
        return { ok: false, payload: null, itemCount: 0, error: '请先载入模板、上传文件或粘贴 JSON' };
      }
      const payload = JSON.parse(jsonText);
      const itemCount = Array.isArray(payload?.items) ? payload.items.length : 0;
      return { ok: true, payload, itemCount, error: '' };
    } catch (error) {
      return { ok: false, payload: null, itemCount: 0, error: error.message };
    }
  }, [jsonText]);

  const environmentLabel = credentials.baseUrl.trim() ? '自定义环境' : 'Ozon 正式环境';
  const effectiveBaseUrl = credentials.baseUrl.trim() || 'https://api-seller.ozon.ru';
  const hasCredentials = Boolean(credentials.clientId.trim() && credentials.apiKey.trim());
  const liveRunDisabled = !parsedState.ok || !hasCredentials || !confirmLiveRun;
  const issues = collectValidationIssues(result);
  const summary = getResultSummary(result, parsedState);

  const templateMutation = useMutation({
    mutationFn: (kind) => fetchOzonTemplate(kind),
    onSuccess: (payload, kind) => {
      setMode(kind);
      setJsonText(`${JSON.stringify(payload, null, 2)}\n`);
      const inferredCategoryId = inferCategoryId(payload);
      if (inferredCategoryId) setCategoryId(inferredCategoryId);
      setResult({ kind: 'template', ok: true, title: `已载入 ${kind} 模板`, payload });
    },
    onError: (error) => setResult({ kind: 'template', ok: false, title: error.message, payload: null }),
  });

  const validateMutation = useMutation({
    mutationFn: (payload) => validateOzonPayload({ mode, payload }),
    onSuccess: (payload) => {
      setResult({
        kind: 'validate',
        ok: payload.ok,
        title: payload.ok ? '本地校验通过，可以继续 dry-run' : '本地校验失败，请先修正数据',
        payload,
      });
    },
    onError: (error) => setResult({ kind: 'validate', ok: false, title: error.message, payload: null }),
  });

  const executeMutation = useMutation({
    mutationFn: ({ dryRun }) =>
      executeOzonAction({
        action: currentMode.action,
        payload: parsedState.payload,
        dryRun,
        ...credentials,
      }),
    onSuccess: (payload, variables) => {
      setResult({
        kind: variables.dryRun ? 'dry-run' : 'execute',
        ok: true,
        title: variables.dryRun ? '模拟执行完成，未请求 Ozon' : '真实请求已提交',
        payload,
      });
      if (!variables.dryRun) setConfirmLiveRun(false);
    },
    onError: (error) => setResult({ kind: 'execute', ok: false, title: error.message, payload: null }),
  });

  const taskMutation = useMutation({
    mutationFn: () => fetchOzonImportInfo({ taskId: Number(taskId), ...credentials }),
    onSuccess: (payload) => setResult({ kind: 'task', ok: true, title: '任务状态已更新', payload }),
    onError: (error) => setResult({ kind: 'task', ok: false, title: error.message, payload: null }),
  });

  const categoryMutation = useMutation({
    mutationFn: () => fetchOzonCategoryAttributes({ categoryId: Number(categoryId), ...credentials }),
    onSuccess: (payload) => {
      setResult({
        kind: 'category',
        ok: true,
        title: '类目属性已返回，优先关注必填属性和字典属性',
        payload,
      });
    },
    onError: (error) => setResult({ kind: 'category', ok: false, title: error.message, payload: null }),
  });

  const attributeMutation = useMutation({
    mutationFn: () => fetchOzonAttributeValues({ categoryId: Number(categoryId), attributeId: Number(attributeId), ...credentials }),
    onSuccess: (payload) => setResult({ kind: 'attribute', ok: true, title: '属性值已返回', payload }),
    onError: (error) => setResult({ kind: 'attribute', ok: false, title: error.message, payload: null }),
  });

  const isBusy =
    templateMutation.isPending ||
    validateMutation.isPending ||
    executeMutation.isPending ||
    taskMutation.isPending ||
    categoryMutation.isPending ||
    attributeMutation.isPending;

  function setCredentialField(key, value) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }

  function saveCredentials() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    setSettingsOpen(false);
    setResult({
      kind: 'settings',
      ok: true,
      title: '连接配置已保存到本机浏览器',
      payload: { environment: environmentLabel, clientId: credentials.clientId, baseUrl: effectiveBaseUrl },
    });
  }

  function clearCredentials() {
    window.localStorage.removeItem(STORAGE_KEY);
    setCredentials(initialCredentials);
    setConfirmLiveRun(false);
    setResult({ kind: 'settings', ok: true, title: '本机连接配置已清除', payload: null });
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setConfirmLiveRun(false);
    templateMutation.mutate(nextMode);
  }

  function guardParsed(action, kind) {
    if (!parsedState.ok) {
      setResult({ kind, ok: false, title: parsedState.error, payload: null });
      return;
    }
    action();
  }

  async function importJsonFile(file) {
    if (!file) return;
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      setJsonText(`${JSON.stringify(payload, null, 2)}\n`);
      const inferredCategoryId = inferCategoryId(payload);
      if (inferredCategoryId) setCategoryId(inferredCategoryId);
      setResult({ kind: 'file', ok: true, title: `已导入文件：${file.name}`, payload: { itemCount: payload.items?.length || 0 } });
    } catch (error) {
      setResult({ kind: 'file', ok: false, title: `文件不是合法 JSON：${error.message}`, payload: null });
    }
  }

  function formatJson() {
    guardParsed(() => {
      setJsonText(`${JSON.stringify(parsedState.payload, null, 2)}\n`);
      setResult({ kind: 'format', ok: true, title: 'JSON 已格式化', payload: { itemCount: parsedState.itemCount } });
    }, 'format');
  }

  return (
    <div className="wb-page">
      <div className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Ozon Upload Studio</p>
          <h2>Ozon 批量上货工具</h2>
          <p>按“选择动作 → 导入数据 → 校验数据 → 确认执行”的顺序完成批量上货。连接配置已抽到二级面板，主流程只保留上货动作本身。</p>
        </div>
        <motion.div
          className="wb-hero-card wb-hero-card-stack"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
        >
          <span>连接配置</span>
          <strong>{hasCredentials ? '已就绪' : '未配置'}</strong>
          <small>{environmentLabel} · {getMaskedKey(credentials.apiKey)}</small>
          <button className="wb-button ghost" onClick={() => setSettingsOpen(true)}>打开连接配置</button>
        </motion.div>
      </div>

      <div className="ozon-stepper">
        {['选择动作', '导入数据', '校验数据', '确认执行'].map((step, index) => (
          <div key={step} className={`ozon-step ${index === 0 || (index === 1 && jsonText) || (index === 2 && parsedState.ok) || (index === 3 && result?.ok) ? 'is-ready' : ''}`}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>

      <div className="wb-results-layout wb-ozon-layout">
        <div className="wb-page">
          <Panel title="1. 选择操作" subtitle="切换操作会自动载入对应模板，降低模式和 JSON 不一致的概率。">
            <div className="ozon-mode-grid">
              {modeOptions.map((item) => (
                <button key={item.key} className={`ozon-mode-card ${mode === item.key ? 'is-active' : ''}`} onClick={() => switchMode(item.key)} disabled={isBusy}>
                  <span>{item.key}</span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2. 导入与编辑数据" subtitle="批量操作优先上传 JSON 文件；文本域用于少量调整或开发排错。">
            <div className="wb-inline-actions wb-wrap-actions">
              <button className="wb-button wb-button-primary" onClick={() => templateMutation.mutate(mode)} disabled={isBusy}>载入当前模板</button>
              <button className="wb-button ghost" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>上传 JSON 文件</button>
              <button className="wb-button ghost" onClick={formatJson} disabled={isBusy}>格式化 JSON</button>
              <button className="wb-button ghost" onClick={() => setJsonText('')} disabled={isBusy}>清空编辑区</button>
              <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => importJsonFile(event.target.files?.[0])} />
            </div>
            <div className="wb-json-meta">
              <span>当前模式：{mode}</span>
              <span>字符数：{formatNumber(jsonText.length)}</span>
              <span>条目数：{formatNumber(parsedState.itemCount)}</span>
              <span>预计分片：{parsedState.itemCount ? formatNumber(Math.ceil(parsedState.itemCount / 100)) : '-'}</span>
              <span className={parsedState.ok ? 'good' : 'danger'}>{parsedState.ok ? 'JSON 可解析' : formatText(parsedState.error)}</span>
            </div>
            <textarea
              className="wb-json-editor"
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                setConfirmLiveRun(false);
              }}
              spellCheck="false"
              placeholder='{"items":[]}'
            />
          </Panel>

          <Panel title="3. 校验与执行" subtitle="真实执行会调用 Ozon API。必须先勾选确认项，避免误创建或误更新。" actions={<span className={`wb-pill ${isBusy ? 'is-busy' : ''}`}>{isBusy ? '处理中' : '待执行'}</span>}>
            <div className="ozon-connection-inline">
              <div>
                <strong>{hasCredentials ? '连接配置已就绪' : '连接配置未完成'}</strong>
                <span>{environmentLabel} · {effectiveBaseUrl}</span>
              </div>
              <button className="wb-button ghost" onClick={() => setSettingsOpen(true)}>修改连接配置</button>
            </div>

            <div className="ozon-execute-bar">
              <button className="wb-button wb-button-primary" onClick={() => guardParsed(() => validateMutation.mutate(parsedState.payload), 'validate')} disabled={isBusy}>本地校验</button>
              <button className="wb-button ghost" onClick={() => guardParsed(() => executeMutation.mutate({ dryRun: true }), 'dry-run')} disabled={isBusy || !parsedState.ok}>仅模拟分片</button>
              <button className="wb-button danger" onClick={() => guardParsed(() => executeMutation.mutate({ dryRun: false }), 'execute')} disabled={isBusy || liveRunDisabled}>真实执行</button>
            </div>
            <label className="ozon-confirm">
              <input type="checkbox" checked={confirmLiveRun} onChange={(event) => setConfirmLiveRun(event.target.checked)} />
              <span>我确认将对 {environmentLabel} 发起真实请求，影响 {formatNumber(parsedState.itemCount)} 条 {currentMode.title} 数据。</span>
            </label>

            <div className="ozon-summary-grid">
              {summary.map((item) => (
                <div key={item.label} className="ozon-summary-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            {issues.length ? (
              <div className="ozon-issues">
                <h3>校验问题与预警</h3>
                {issues.slice(0, 12).map((issue, index) => <p key={`${issue}-${index}`}>{issue}</p>)}
              </div>
            ) : null}

            <div className="wb-result-card">
              <div className="wb-result-head">
                <div>
                  <p className="wb-kicker">Latest Result</p>
                  <h3>{result?.title || '暂无结果'}</h3>
                </div>
                <span className={`wb-pill ${result ? (result.ok ? 'is-good' : 'is-danger') : ''}`}>{result ? (result.ok ? '成功' : '失败') : '等待中'}</span>
              </div>
              <button className="wb-button ghost" onClick={() => setShowRaw((value) => !value)}>{showRaw ? '隐藏原始返回' : '展开原始返回'}</button>
              {showRaw ? <pre className="wb-pre">{result?.payload ? JSON.stringify(result.payload, null, 2) : '执行结果会显示在这里'}</pre> : null}
            </div>
          </Panel>
        </div>

        <div className="wb-page">
          <Panel title="连接状态" subtitle="配置保存在当前浏览器，本机下次打开自动带出。">
            <div className="ozon-settings-summary">
              <span>{hasCredentials ? '已保存凭证' : '未保存凭证'}</span>
              <strong>{environmentLabel}</strong>
              <small>{effectiveBaseUrl}</small>
            </div>
            <button className="wb-button ghost" onClick={() => setSettingsOpen(true)}>打开连接配置</button>
          </Panel>

          <Panel title="任务查询" subtitle="真实上货返回 task_id 后，用这里跟进 Ozon 导入状态。">
            <label className="wb-field">
              <span>task_id</span>
              <input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="例如 123456789" />
            </label>
            <button className="wb-button ghost" onClick={() => taskMutation.mutate()} disabled={isBusy || !taskId.trim()}>查询任务</button>
          </Panel>

          <Panel title="类目属性助手" subtitle="商品 JSON 中如果已有 category_id，会自动带到这里。">
            <label className="wb-field">
              <span>category_id</span>
              <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="例如 17031663" />
            </label>
            <button className="wb-button ghost" onClick={() => categoryMutation.mutate()} disabled={isBusy || !categoryId.trim()}>查询类目属性</button>
          </Panel>

          <Panel title="属性值查询" subtitle="当属性有 dictionary_id 时，再查该属性的可选值。">
            <div className="wb-filter-grid">
              <label className="wb-field">
                <span>category_id</span>
                <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="沿用上面的类目 ID" />
              </label>
              <label className="wb-field">
                <span>attribute_id</span>
                <input value={attributeId} onChange={(event) => setAttributeId(event.target.value)} placeholder="例如 85" />
              </label>
            </div>
            <button className="wb-button ghost" onClick={() => attributeMutation.mutate()} disabled={isBusy || !categoryId.trim() || !attributeId.trim()}>查询属性值</button>
          </Panel>
        </div>
      </div>

      {settingsOpen ? (
        <div className="ozon-settings-backdrop" role="presentation">
          <aside className="ozon-settings-drawer" aria-label="Ozon 连接配置">
            <div className="ozon-settings-head">
              <div>
                <p className="wb-kicker">Connection Settings</p>
                <h2>Ozon 连接配置</h2>
                <p>配置会保存到当前浏览器的 localStorage，不写入后端数据库。共享电脑不建议保存真实 Api Key。</p>
              </div>
              <button className="wb-button ghost" onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>

            <div className="wb-filter-grid">
              <label className="wb-field">
                <span>Client ID</span>
                <input value={credentials.clientId} onChange={(event) => setCredentialField('clientId', event.target.value)} placeholder="例如 123456" />
              </label>
              <label className="wb-field">
                <span>Api Key</span>
                <input type="password" value={credentials.apiKey} onChange={(event) => setCredentialField('apiKey', event.target.value)} placeholder="输入 Ozon Api Key" />
              </label>
              <label className="wb-field">
                <span>Base URL</span>
                <input value={credentials.baseUrl} onChange={(event) => setCredentialField('baseUrl', event.target.value)} placeholder="留空则使用 https://api-seller.ozon.ru" />
              </label>
            </div>

            <div className="ozon-env-card">
              <strong>{environmentLabel}</strong>
              <span>{effectiveBaseUrl}</span>
            </div>

            <div className="ozon-settings-actions">
              <button className="wb-button wb-button-primary" onClick={saveCredentials}>保存到本机</button>
              <button className="wb-button ghost" onClick={clearCredentials}>清除本机配置</button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
