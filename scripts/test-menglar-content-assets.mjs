import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ensureProductContentTables,
  extractTags,
  normalizeContentAsset,
  upsertContentAsset,
} from './menglar-capture/lib/content-assets-store.mjs';

function testExtractTags() {
  assert.deepEqual(extractTags('#清洁,#家居 #抹布'), ['#清洁', '#家居', '#抹布']);
  assert.deepEqual(extractTags(['#clean_home', '#clean_home', 'kitchen']), ['#clean_home', 'kitchen']);
}

function testNormalizeAndUpsert() {
  const detail = {
    sourceFormId: '2755299450',
    offerName: '智能抹布',
    currencyCode: 'RUB',
    attrValueMap: {
      4191: { values: '俄文描述' },
      23171: { values: '#clean_home,#kitchen' },
    },
    skus: [
      {
        sku: 'sku-1',
        name: '默认款',
        price: '145',
        currency: 'RUB',
        skuImages: ['https://img/1.jpg', 'https://img/2.jpg'],
      },
      {
        sku: 'sku-2',
        name: '灰色',
        price: '149',
        currency: 'RUB',
        skuImages: ['https://img/3.jpg'],
      },
    ],
  };
  const libraryItem = {
    id: 2091125402,
    sourceDataId: '2755299450',
    sourceDataExpandData: {
      url: 'https://www.ozon.ru/product/2755299450',
    },
  };

  const asset = normalizeContentAsset(detail, libraryItem, { productId: '2755299450' });
  assert.equal(asset.platform_product_id, '2755299450');
  assert.equal(asset.title, '智能抹布');
  assert.equal(asset.description, '俄文描述');
  assert.deepEqual(asset.tags, ['#clean_home', '#kitchen']);
  assert.equal(asset.main_image_url, 'https://img/1.jpg');
  assert.equal(asset.skus.length, 2);
  assert.equal(asset.skus[0].platform_sku_id, 'sku-1');

  const db = new DatabaseSync(':memory:');
  ensureProductContentTables(db);

  const first = upsertContentAsset(db, 101, asset, '2026-04-25T00:00:00.000Z');
  assert.equal(first.insertedAsset, true);
  assert.equal(first.insertedSkuCount, 2);

  const second = upsertContentAsset(db, 102, asset, '2026-04-25T00:05:00.000Z');
  assert.equal(second.insertedAsset, false);
  assert.equal(second.insertedSkuCount, 0);
  assert.equal(second.contentAssetId, first.contentAssetId);

  const assetCount = db.prepare('SELECT COUNT(*) AS total FROM product_content_assets').get().total;
  const skuCount = db.prepare('SELECT COUNT(*) AS total FROM product_content_skus').get().total;
  assert.equal(assetCount, 1);
  assert.equal(skuCount, 2);

  const storedAsset = db.prepare(`
    SELECT platform_product_id, title, description, tags_json, image_urls_json
    FROM product_content_assets
    WHERE id = ?
  `).get(first.contentAssetId);
  assert.equal(storedAsset.platform_product_id, '2755299450');
  assert.equal(storedAsset.title, '智能抹布');
  assert.equal(storedAsset.description, '俄文描述');
  assert.deepEqual(JSON.parse(storedAsset.tags_json), ['#clean_home', '#kitchen']);
  assert.deepEqual(JSON.parse(storedAsset.image_urls_json), ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg']);

  db.close();
}

testExtractTags();
testNormalizeAndUpsert();
console.log('test-menglar-content-assets: ok');
