export const productPrepWorkflowSteps = [
  {
    title: '导入候选商品',
    description: '承接结果筛选页的候选商品，但候选状态以独立接口或草稿域为准，不直接依赖结果页内存状态。',
  },
  {
    title: '整理发布字段',
    description: '补齐 offer_id、标题、description_category_id、type_id、属性、图片、价格、币种、VAT、包装尺寸和库存所需字段。',
  },
  {
    title: '发布前校验',
    description: '按 Ozon 建品、价格和库存接口要求校验必填项、枚举项、图片、包装信息和仓库信息。',
  },
  {
    title: '导出下游载荷',
    description: '把 ready 草稿导出成 Ozon import/prices/stocks 可直接消费的结构，避免改动现有执行页主流程。',
  },
];

export const productPrepSafetyRules = [
  '前端主工作区都放进 src/modules/product-data-prep，ProductDataPrepPage 只保留薄页面挂载。',
  '后端商品整理逻辑统一收进 backend/menglar-workbench-api/modules/product-data-prep，不继续把业务堆进 server.mjs。',
  '接口命名空间固定为 /api/product-data-prep，不复用 /api/products 写入语义，也不把整理逻辑塞进 /api/ozon。',
  '草稿数据只写独立草稿域，不覆盖 products_normalized，候选商品和发布草稿分层存储。',
  '图片、属性、标题、导出载荷按文件拆开，减少多人同时编辑同一个大组件或大接口。',
];

export const productPrepFieldGroups = [
  {
    title: '草稿身份与追踪',
    description: '先把候选商品和发布草稿之间的追踪主键钉住，后续合并分支时最不容易乱。',
    items: [
      {
        key: 'source_job_id',
        label: '来源任务 ID',
        required: '必填',
        source: 'products_normalized 可继承',
        status: 'existing',
        note: '用于回溯候选来源批次，支持重新拉取上下游数据。',
      },
      {
        key: 'product_normalized_id',
        label: '标准化商品 ID',
        required: '必填',
        source: 'products_normalized 可继承',
        status: 'existing',
        note: '草稿与上游候选的稳定关联键，不应复用 Ozon 线上 product_id。',
      },
      {
        key: 'offer_id',
        label: '商家货号',
        required: '必填',
        source: '草稿域新增',
        status: 'manual',
        note: '下游建品和库存链路都需要稳定的商家唯一货号。',
      },
      {
        key: 'draft_status',
        label: '草稿状态',
        required: '必填',
        source: '草稿域新增',
        status: 'derived',
        note: '建议至少区分 draft / validating / ready / exported。',
      },
    ],
  },
  {
    title: '建品最小字段',
    description: '这些字段直接决定 `/v3/product/import` 是否有机会通过。',
    items: [
      {
        key: 'name',
        label: '商品标题',
        required: '必填',
        source: '规则生成 + 人工确认',
        status: 'manual',
        note: '不能直接复用竞品标题，必须经过命名规则整理。',
      },
      {
        key: 'description_category_id / type_id',
        label: 'Ozon 描述类目与商品类型',
        required: '必填',
        source: '草稿域新增',
        status: 'missing',
        note: '官方当前建品 API 需要同时传 description_category_id 和 type_id，现有上游类目文本不足以直接建品。',
      },
      {
        key: 'attributes[]',
        label: '类目属性',
        required: '必填',
        source: '类目属性接口 + 草稿域新增',
        status: 'missing',
        note: '至少要支持 attribute_id、complex_id、值对象、dictionary_value_id 和排序信息。',
      },
      {
        key: 'images[]',
        label: '商品图片',
        required: '必填',
        source: '图片工作台新增',
        status: 'missing',
        note: '至少要保存主图、图片顺序和可供 Ozon 访问的 URL。',
      },
      {
        key: 'description',
        label: '商品描述',
        required: '强烈建议',
        source: '规则生成 + 人工确认',
        status: 'manual',
        note: '本地 importer 当前只做 warning，但真实审核和转化都依赖它。',
      },
    ],
  },
  {
    title: '价格与税务',
    description: '建品和价格更新链路共用的一组商业字段。',
    items: [
      {
        key: 'price',
        label: '售价',
        required: '必填',
        source: '草稿域新增',
        status: 'manual',
        note: '不是上游销量分析里的 revenue，需要单独产出商品售价。',
      },
      {
        key: 'currency_code',
        label: '币种',
        required: '必填',
        source: '草稿域新增',
        status: 'missing',
        note: '当前本地 importer 只提示 warning，但跨境场景建议升级为正式必填。',
      },
      {
        key: 'vat',
        label: 'VAT 税率',
        required: '必填',
        source: '草稿域新增',
        status: 'missing',
        note: '当前上游没有税率字段，必须从业务配置或人工确认补齐。',
      },
      {
        key: 'old_price / premium_price / min_price',
        label: '价格扩展字段',
        required: '可选增强',
        source: '草稿域新增',
        status: 'manual',
        note: '价格策略稳定后再接，不建议在建品最初阶段硬编码到多个页面。',
      },
    ],
  },
  {
    title: '包装与仓储',
    description: '这些字段既影响审核，也影响运费测算和库存更新。',
    items: [
      {
        key: 'package_depth_mm / package_width_mm / package_height_mm',
        label: '包装尺寸(mm)',
        required: '必填',
        source: '上游尺寸 + 规则换算 + 人工复核',
        status: 'derived',
        note: '现有上游是 cm，且未必代表包装后尺寸，必须换算并复核。',
      },
      {
        key: 'package_weight_g',
        label: '包装重量(g)',
        required: '必填',
        source: '上游重量 + 人工复核',
        status: 'derived',
        note: '现有 weight_g 更像商品重量，不能默认等于包装后重量。',
      },
      {
        key: 'stock',
        label: '库存',
        required: '库存链路必填',
        source: '草稿域新增',
        status: 'missing',
        note: '更新库存时必须提供，和结果页分析数据无关。',
      },
      {
        key: 'warehouse_id',
        label: '仓库 ID',
        required: '库存链路必填',
        source: '店铺配置或仓库接口',
        status: 'missing',
        note: '当前项目里还没有稳定仓库配置来源。',
      },
    ],
  },
  {
    title: '识别与合规补充',
    description: '这些字段不是所有类目都同等强制，但最好在草稿层提前预留。',
    items: [
      {
        key: 'barcode',
        label: '条码',
        required: '类目相关',
        source: '供应链 / 业务确认',
        status: 'manual',
        note: '应单独留空值策略，避免直接瞎填竞品条码。',
      },
      {
        key: 'vendor',
        label: '品牌 / 厂牌',
        required: '强烈建议',
        source: '上游 brand + 人工复核',
        status: 'manual',
        note: '上游 brand 可作为参考，但不能默认直接用于发布。',
      },
      {
        key: 'model_name',
        label: '型号',
        required: '类目相关',
        source: '草稿域新增',
        status: 'missing',
        note: '很多类目会依赖型号、件数、材质等真实商品属性。',
      },
    ],
  },
];

export const productPrepReadinessChecklist = [
  '前端真实编辑器只在模块目录里新增，不继续放大 ProductDataPrepPage.jsx。',
  '候选商品接口和草稿接口分开，先固定字段契约，再接数据库。',
  '草稿表至少补齐 offer_id、currency_code、vat、包装尺寸、包装重量、warehouse_id。',
  '属性表支持 attribute_id、complex_id、dictionary_value_id、value、sort_order，不只存一个 value。',
  '图片表支持主图标记和排序，导出时能稳定映射到 Ozon images 数组。',
];

export const productPrepUpstreamGapSections = [
  {
    title: '上游可直接继承',
    description: '这些字段已经在标准化商品结果里出现，可以先当候选草稿默认值。',
    items: [
      'source_job_id / product_normalized_id',
      'ozon_product_id（只作研究参考，不等于 offer_id）',
      'brand、类目文本、长度宽度高度、重量',
      '销量、营收、毛利等分析字段',
    ],
  },
  {
    title: '必须新增或人工整理',
    description: '这些字段目前没有稳定来源，不补齐就无法安全下发到 Ozon。',
    items: [
      'offer_id、name、description',
      'description_category_id、type_id、attributes[]',
      'images[] 直链、排序、主图标记',
      'price、currency_code、vat',
      'warehouse_id、stock、barcode、model_name',
    ],
  },
];
