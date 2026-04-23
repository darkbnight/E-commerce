import {
  findDescriptionCategoryNode,
  getDescriptionCategoryRoots,
} from './descriptionCategoryTree';

function fallbackValue(value, pendingText = '待补充') {
  if (value == null || value === '') {
    return pendingText;
  }
  return String(value);
}

function joinArray(values, emptyText = '待补充') {
  if (!Array.isArray(values) || values.length === 0) {
    return emptyText;
  }
  return values;
}

function formatAttributes(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) {
    return ['待补充属性'];
  }

  return attributes.map((attribute) => {
    const values = Array.isArray(attribute.values)
      ? attribute.values.map((value) => {
        if (value && typeof value === 'object') {
          const displayValue = value.value || '';
          const dictionaryValueId = value.dictionaryValueId ? `#${value.dictionaryValueId}` : '';
          return [displayValue, dictionaryValueId].filter(Boolean).join(' ');
        }
        return value;
      }).filter(Boolean).join(' / ')
      : '';
    const name = attribute.name || `属性 ${attribute.attributeId}`;
    const requiredMark = attribute.isRequired ? ' *' : '';
    return `${name}${requiredMark}: ${values || '待补充'}`;
  });
}

function formatImageUrls(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return ['待补充图片'];
  }

  return images.map((image, index) => {
    const prefix = image.isMain ? '主图' : `图 ${index + 1}`;
    return `${prefix}: ${image.url}`;
  });
}

function formatDescriptionCategoryValue(draft, treeState = {}) {
  const values = [
    `description_category_id: ${fallbackValue(draft.descriptionCategoryId, '待确认')}`,
    `type_id: ${fallbackValue(draft.typeId, '待确认')}`,
  ];

  if (!draft.descriptionCategoryId || !draft.typeId) {
    values.push('DescriptionCategoryAPI_GetTree: 等待先补齐 ID');
    return values;
  }

  if (!treeState.hasCredentials) {
    values.push('DescriptionCategoryAPI_GetTree: 未配置 Ozon 连接');
    return values;
  }

  if (treeState.isLoading) {
    values.push('DescriptionCategoryAPI_GetTree: 正在获取类目树');
    return values;
  }

  if (treeState.error) {
    values.push(`DescriptionCategoryAPI_GetTree: 获取失败 - ${treeState.error.message}`);
    return values;
  }

  const match = findDescriptionCategoryNode(
    getDescriptionCategoryRoots(treeState.data),
    draft.descriptionCategoryId,
    draft.typeId
  );

  if (!match) {
    values.push('DescriptionCategoryAPI_GetTree: 未匹配到当前描述类目与类型');
    return values;
  }

  values.push(`DescriptionCategoryAPI_GetTree: ${match.exact ? '已匹配' : '仅匹配到描述类目'}`);
  values.push(`类目路径: ${match.path.join(' > ') || '未返回名称'}`);

  const typeName = match.node?.type_name;
  if (typeName) values.push(`type_name: ${typeName}`);

  return values;
}

export function buildProductPrepFieldViewModel({
  candidate,
  draft,
  descriptionCategoryTreeState,
  descriptionCategoryAttributeState,
}) {
  const upstreamGroups = [
    {
      title: '来源批次',
      description: '这部分展示当前候选商品从上游采集链路继承来的追踪信息。',
      items: [
        {
          key: 'source_job_id',
          label: '来源任务 ID',
          description: '用于标记这条候选商品来自哪个采集批次，后续查库和回溯都依赖它。',
          value: fallbackValue(candidate.sourceJobId),
        },
        {
          key: 'page_name',
          label: '来源页面名称',
          description: '帮助运营快速判断当前候选商品来自哪个业务批次。',
          value: fallbackValue(candidate.pageName),
        },
        {
          key: 'page_type',
          label: '来源任务类型',
          description: '区分热销商品、行业分析等不同任务类型，方便后续分流处理。',
          value: fallbackValue(candidate.pageType),
        },
        {
          key: 'finished_at',
          label: '采集完成时间',
          description: '显示这批候选数据何时生成，便于判断时效性。',
          value: fallbackValue(candidate.finishedAt),
        },
      ],
    },
    {
      title: '商品基础信息',
      description: '这部分是当前上游最容易直接继承的商品身份和类目文本信息。',
      items: [
        {
          key: 'product_normalized_id',
          label: '标准化商品 ID',
          description: '商品数据整理草稿应通过这个字段稳定关联到上游标准化商品。',
          value: fallbackValue(candidate.productNormalizedId),
        },
        {
          key: 'ozon_product_id',
          label: 'Ozon 商品 ID',
          description: '当前仅作为竞品研究参考，不能直接当作商家货号使用。',
          value: fallbackValue(candidate.ozonProductId),
        },
        {
          key: 'brand',
          label: '品牌参考值',
          description: '可作为品牌属性候选值，但发布前仍建议人工复核。',
          value: fallbackValue(candidate.brand),
        },
        {
          key: 'category_levels',
          label: '类目文本路径',
          description: '上游能提供类目文本，但还不能直接代替下游需要的 Ozon 数字类目 ID。',
          value: joinArray(candidate.categoryLevels, '待补充类目'),
        },
      ],
    },
    {
      title: '选品分析参考',
      description: '这部分是上游选品链路已经整理出来的分析数据，更多用于判断优先级。',
      items: [
        {
          key: 'sales',
          label: '销量',
          description: '用于判断该候选商品是否值得进一步整理，不直接下发给 Ozon。',
          value: fallbackValue(candidate.sales),
        },
        {
          key: 'revenue',
          label: '销售额',
          description: '只用于选品判断，不能直接当作发布售价。',
          value: fallbackValue(candidate.revenue),
        },
        {
          key: 'estimated_gross_margin',
          label: '预估毛利率',
          description: '帮助运营决定是否继续推进当前候选商品。',
          value: fallbackValue(candidate.estimatedGrossMargin),
        },
        {
          key: 'traffic_summary',
          label: '曝光与点击',
          description: '体现候选商品的流量表现，便于前期判断潜力。',
          value: [`曝光: ${fallbackValue(candidate.impressions)}`, `点击: ${fallbackValue(candidate.clicks)}`],
        },
      ],
    },
    {
      title: '体积重量与物流参考',
      description: '这部分适合拿来做包装尺寸和物流字段的候选初值，但仍需要人工复核。',
      items: [
        {
          key: 'shipping_mode',
          label: '发货模式',
          description: '当前更多是物流参考信息，不是直接下游建品字段。',
          value: fallbackValue(candidate.shippingMode),
        },
        {
          key: 'delivery_time',
          label: '配送时效',
          description: '帮助判断物流方案，暂不直接透传到下游建品载荷。',
          value: fallbackValue(candidate.deliveryTime),
        },
        {
          key: 'size_cm',
          label: '上游尺寸(cm)',
          description: '用于生成包装尺寸候选值，但下游通常要求以 mm 作为单位。',
          value: [
            `长: ${fallbackValue(candidate.lengthCm)}`,
            `宽: ${fallbackValue(candidate.widthCm)}`,
            `高: ${fallbackValue(candidate.heightCm)}`,
          ],
        },
        {
          key: 'weight_g',
          label: '上游重量(g)',
          description: '可作为包装重量初值，但需要确认是否为包装后重量。',
          value: fallbackValue(candidate.weightG),
        },
      ],
    },
  ];

  const downstreamGroups = [
    {
      title: '草稿身份与状态',
      description: '这部分是整理模块输出给下游前必须稳定的草稿标识信息。',
      items: [
        {
          key: 'offer_id',
          label: '商家货号',
          description: '下游建品和库存链路都依赖这个唯一标识。',
          value: fallbackValue(draft.offerId, '待生成货号'),
          isPending: !draft.offerId,
        },
        {
          key: 'draft_status',
          label: '草稿状态',
          description: '表示当前草稿是否仍在整理、是否已经达到 ready 状态。',
          value: fallbackValue(draft.draftStatus),
        },
        {
          key: 'vendor',
          label: '品牌 / 厂牌',
          description: '建议在草稿域单独维护，避免未经确认直接使用上游品牌文本。',
          value: fallbackValue(draft.vendor, '待确认品牌'),
          isPending: !draft.vendor,
        },
        {
          key: 'model_name',
          label: '型号',
          description: '很多类目会依赖型号或规格名称，建议在草稿层预留。',
          value: fallbackValue(draft.modelName, '待补充型号'),
          isPending: !draft.modelName,
        },
      ],
    },
    {
      title: '下游建品主字段',
      description: '这部分是后续导出到 Ozon 商品导入载荷时最核心的一组字段。',
      items: [
        {
          key: 'name',
          label: '商品标题',
          description: '标题建议由 AI 生成初稿，再由人工做最终确认。',
          value: fallbackValue(draft.name, '待生成标题'),
          isPending: !draft.name,
        },
        {
          key: 'description',
          label: '商品描述',
          description: '用于发布展示和审核，本地前期可以先展示草稿文本。',
          value: fallbackValue(draft.description, '待生成描述'),
          isPending: !draft.description,
        },
        {
          key: 'description_category_id / type_id',
          label: 'Ozon 描述类目与类型',
          description: '先通过 DescriptionCategoryAPI_GetTree 拉取描述类目树，再确认 description_category_id 和 type_id 是否能匹配到真实类目。',
          value: formatDescriptionCategoryValue(draft, descriptionCategoryTreeState),
          control: descriptionCategoryTreeState?.control,
          isPending:
            !draft.descriptionCategoryId ||
            !draft.typeId ||
            !descriptionCategoryTreeState?.hasCredentials ||
            descriptionCategoryTreeState?.isLoading ||
            Boolean(descriptionCategoryTreeState?.error),
        },
        {
          key: 'attributes[]',
          label: '类目属性',
          description: '最终导出时要能映射成 Ozon 需要的 attributes 数组结构。',
          value: formatAttributes(draft.attributes),
          control: descriptionCategoryAttributeState?.control,
          isPending:
            !draft.attributes?.length ||
            !descriptionCategoryAttributeState?.hasCredentials ||
            descriptionCategoryAttributeState?.isLoading ||
            Boolean(descriptionCategoryAttributeState?.error),
        },
      ],
    },
    {
      title: '价格与税务',
      description: '这部分直接影响建品和价格更新接口的可用性。',
      items: [
        {
          key: 'price',
          label: '售价',
          description: '这里展示的是下游真正需要的售价，不是上游分析里的销售额。',
          value: fallbackValue(draft.price, '待填写售价'),
          isPending: !draft.price,
        },
        {
          key: 'price_extensions',
          label: '价格扩展字段',
          description: '包括划线价、高级价格等，当前可以先作为预留展示位。',
          value: [
            `old_price: ${fallbackValue(draft.oldPrice, '-')}`,
            `premium_price: ${fallbackValue(draft.premiumPrice, '-')}`,
            `min_price: ${fallbackValue(draft.minPrice, '-')}`,
          ],
        },
        {
          key: 'currency_code',
          label: '币种',
          description: '跨境场景下建议作为正式必填字段固定下来。',
          value: fallbackValue(draft.currencyCode, '待配置币种'),
          isPending: !draft.currencyCode,
        },
        {
          key: 'vat / barcode',
          label: '税率与条码',
          description: '税率建议来自配置后人工确认，条码不能直接抄竞品。',
          value: [
            `VAT: ${fallbackValue(draft.vat, '待确认')}`,
            `Barcode: ${fallbackValue(draft.barcode, '待填写')}`,
          ],
          isPending: !draft.vat || !draft.barcode,
        },
      ],
    },
    {
      title: '图片、包装与库存',
      description: '这部分用于打通图片工作台、包装换算和库存链路。',
      items: [
        {
          key: 'images[]',
          label: '商品图片',
          description: '建议在模块内保留主图、排序和 URL，导出时再映射成下游数组。',
          value: formatImageUrls(draft.images),
          isPending: !draft.images?.length,
        },
        {
          key: 'package_size_mm',
          label: '包装尺寸(mm)',
          description: '下游导出通常需要 mm 单位，这里可以先展示规则换算后的目标值。',
          value: [
            `深: ${fallbackValue(draft.packageDepthMm, '待补充')}`,
            `宽: ${fallbackValue(draft.packageWidthMm, '待补充')}`,
            `高: ${fallbackValue(draft.packageHeightMm, '待补充')}`,
          ],
          isPending: !draft.packageDepthMm || !draft.packageWidthMm || !draft.packageHeightMm,
        },
        {
          key: 'package_weight_g',
          label: '包装重量(g)',
          description: '建议展示经过人工复核后的包装重量，而不是直接沿用上游重量。',
          value: fallbackValue(draft.packageWeightG, '待确认包装重量'),
          isPending: !draft.packageWeightG,
        },
        {
          key: 'warehouse_id / stock',
          label: '仓库与库存',
          description: '库存链路真正执行前必须补齐仓库 ID 和库存数量。',
          value: [
            `warehouse_id: ${fallbackValue(draft.warehouseId, '待配置')}`,
            `stock: ${fallbackValue(draft.stock, '待确认')}`,
          ],
          isPending: !draft.warehouseId,
        },
      ],
    },
  ];

  return {
    upstreamGroups,
    downstreamGroups,
  };
}
