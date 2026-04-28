# 图片压缩工具

把指定目录图片批量压缩为 JPG，并输出到对应目录下的子目录，默认子目录名为 `压缩图`。

## 使用方式

```powershell
node scripts/图片压缩工具/compress-images-to-jpg.mjs "G:\work\其他\商品数据\商品4-卷纸1"
```

批量处理父目录下所有商品子目录：

```powershell
node scripts/图片压缩工具/compress-images-to-jpg.mjs "G:\work\其他\商品数据" --batch-children
```

可选参数：

```powershell
node scripts/图片压缩工具/compress-images-to-jpg.mjs "G:\work\其他\商品数据\商品4-卷纸1" --quality=4 --output=压缩图
```

## 参数说明

- `sourceDir`：必填，待处理图片目录。
- `--batch-children`：可选，按 `sourceDir` 下的每个一级子目录分别压缩，适合商品父目录。
- `--quality`：可选，JPG 质量，范围 `2-31`，默认 `4`。`4` 是推荐高质量档；数值越小越清晰、体积越大，数值越大越模糊、体积越小。
- `--output`：可选，输出子目录名，默认 `压缩图`。
- `--no-overwrite`：可选，目标 JPG 已存在时跳过。

## 处理规则

- 单目录模式只处理输入目录第一层图片，不递归子目录。
- 批量模式只处理输入目录下的一级子目录，不递归更深层目录。
- 支持 `.png`、`.jpg`、`.jpeg`、`.webp`、`.bmp`。
- 原图不覆盖，压缩结果保存到 `被处理目录/压缩图/`。
- JPG 不支持透明通道，透明图片会被转换为非透明图片。
- 依赖本机 `ffmpeg`，若不在 PATH 中，可配置环境变量 `FFMPEG_PATH`。
