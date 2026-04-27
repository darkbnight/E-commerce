import path from 'node:path';

export const ROOT = process.cwd();
export const MENGLAR_ORIGIN = 'https://ozon.menglar.com';
export const TARGETS = {
  industry_general: {
    pageName: '萌拉行业数据',
    pageType: 'industry_general',
    paginationMode: 'api_capture',
    targetUrl: 'https://ozon.menglar.com/workbench/industry/general',
    probe: {
      apiPath: '/api/ozon-report-service/v1/bigDisc/industryViewV2',
      body: {
        catId: 17028718,
        currentCatId: '17028718',
        catLevel: 2,
        typeId: 0,
      },
    },
  },
  hot_products: {
    pageName: '萌拉热销商品',
    pageType: 'hot_products',
    paginationMode: 'paged',
    targetUrl: 'https://ozon.menglar.com/workbench/selection/hot?catId=17027489',
    probe: {
      apiPath: '/api/ozon-report-service/v1/itemRanking/hotPage',
      body: {
        catId: 17027489,
        currentCatId: '17027489',
        catLevel: 3,
        pageNum: 1,
        pageSize: 10,
        dateType: 'TWENTY_EIGHT_DAY',
      },
    },
  },
};

export const SOURCE_PROFILE =
  process.env.ZINIAO_PROFILE_DIR ||
  'C:\\Users\\Administrator\\AppData\\Roaming\\ziniaobrowser\\userdata\\chrome_27468535116866';

export const USER_DATA_DEFAULT_DIR = path.join(SOURCE_PROFILE, 'Default');
export const PROFILE_COPY = path.join(ROOT, '.cache', 'ziniao-profile-copy-stable');
export const RUNTIME_PROFILE_ROOT = path.join(ROOT, '.cache', 'menglar-runtime-profiles');
export const PREFLIGHT_DIR = path.join(ROOT, '.cache', 'menglar-capture');
export const PREFLIGHT_LAST_PATH = path.join(PREFLIGHT_DIR, 'preflight-last.json');
export const LOGIN_HEALTH_LAST_PATH = path.join(PREFLIGHT_DIR, 'login-health-last.json');

export const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export const ZINIAO_EXECUTABLE_PATH =
  process.env.ZINIAO_EXECUTABLE_PATH ||
  'C:\\Users\\Administrator\\AppData\\Roaming\\ziniaobrowser\\env-kit\\Core\\chrome_64_142.1.2.74\\ziniaobrowser.exe';

export const DB_PATH = path.join(ROOT, 'db', 'ecommerce-workbench.sqlite');

export const ERROR_ACTIONS = {
  login_required: '重新登录萌拉后再执行采集',
  guest_blocked: '确认账号权限，避免游客态访问',
  profile_locked: '关闭占用 profile 的浏览器，或设置 MENGLAR_REFRESH_PROFILE=1 刷新副本',
  browser_blocked: '检查 Chrome 或紫鸟路径和启动权限',
  api_auth_missing: '先打开目标页并确认业务接口请求正常出现',
  api_unauthorized: '萌拉业务接口返回 401/403；重新登录并关闭紫鸟窗口让登录态落盘后，再刷新 profile 检查',
  db_error: '检查 db/ecommerce-workbench.sqlite 路径和写权限',
  unknown: '查看完整错误详情',
};

export function getTargetConfig(target = 'industry_general') {
  return TARGETS[target] || TARGETS.industry_general;
}
