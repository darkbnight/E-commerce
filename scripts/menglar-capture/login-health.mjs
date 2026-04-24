import { pathToFileURL } from 'node:url';
import { checkMenglarLoginHealth } from './lib/login-health.mjs';

function parseArgs(argv) {
  const args = {
    target: 'hot_products',
    json: false,
    refresh: process.env.MENGLAR_REFRESH_PROFILE === '1',
    headless: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    if (item === '--headless') args.headless = true;
    if (item === '--refresh') args.refresh = true;
    if (item === '--target' && argv[index + 1]) {
      args.target = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function printHumanResult(result) {
  console.log(result.ok ? '萌拉登录态可用' : '萌拉登录态不可用');
  console.log(`目标：${result.target}`);
  console.log(`页面：${result.page?.title || '-'} ${result.page?.url || ''}`.trim());
  console.log(`接口请求：${result.api.requestCount}，授权请求：${result.api.authorizedRequestCount}，401/403：${result.api.unauthorizedResponseCount}`);
  if (result.errorType) console.log(`问题：${result.errorType}`);
  if (result.message) console.log(`详情：${result.message}`);
  if (result.nextAction) console.log(`处理：${result.nextAction}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const result = await checkMenglarLoginHealth({
    target: args.target,
    refresh: args.refresh,
    headless: args.headless,
    writeResult: true,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }

  if (!result.ok) process.exitCode = 1;
}
