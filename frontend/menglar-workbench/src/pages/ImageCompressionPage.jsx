import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Panel } from '../components/Panel';
import { compressImagesToJpg, generateProductVideos } from '../lib/api';

const defaultForm = {
  sourceDirs: 'G:\\work\\其他\\商品数据\\商品A\nG:\\work\\其他\\商品数据\\商品B',
  outputDirName: '压缩图',
  quality: '4',
  overwrite: true,
  generateVideo: false,
  videoDuration: 12,
  videoResolution: '1080p',
  videoOutputName: '商品视频',
};

const supportedFormats = ['PNG', 'JPG', 'JPEG', 'WEBP', 'BMP'];

export function ImageCompressionPage() {
  const [form, setForm] = useState(defaultForm);

  const compressMutation = useMutation({
    mutationFn: compressImagesToJpg,
  });

  const generateVideoMutation = useMutation({
    mutationFn: generateProductVideos,
  });

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const dirs = form.sourceDirs
      .split('\n')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    try {
      const result = await compressMutation.mutateAsync({
        directories: dirs,
        outputDirName: form.outputDirName.trim() || '压缩图',
        quality: Number(form.quality || 4),
        overwrite: form.overwrite,
      });
      if (form.generateVideo) {
        const videoDirs = (result.directories || [result]).map((d) => d.outputDir);
        generateVideoMutation.mutate({
          directories: videoDirs,
          duration: Number(form.videoDuration || 12),
          resolution: form.videoResolution || '1080p',
          outputVideoName: form.videoOutputName.trim() || '商品视频',
        });
      }
    } catch {
      // 错误通过 compressMutation.error 展示
    }
  };

  const result = compressMutation.data;
  const videoResult = generateVideoMutation.data;

  return (
    <div className="wb-page image-compression-page">
      <div className="wb-page-hero image-compression-hero">
        <div>
          <p className="wb-kicker">Local Image Tool</p>
          <h2>图片压缩成 JPG</h2>
          <p>输入本机商品图片目录，系统会把图片统一压缩为 JPG，并保存到每个商品目录下的输出子目录。</p>
        </div>
      </div>

      <div className="image-compression-layout">
        <Panel title="压缩参数" subtitle="每行输入一个图片目录，系统依次处理每个目录下的图片，原图不覆盖。">
          <form className="image-compression-form" onSubmit={handleSubmit}>
            <label className="image-compression-field">
              <span>图片目录（每行一个）</span>
              <textarea
                value={form.sourceDirs}
                rows={6}
                placeholder={'例如：\nG:\\work\\其他\\商品数据\\商品A\nG:\\work\\其他\\商品数据\\商品B'}
                onChange={(event) => handleChange('sourceDirs', event.target.value)}
              />
            </label>

            <div className="image-compression-grid">
              <label className="image-compression-field">
                <span>输出子目录</span>
                <input value={form.outputDirName} onChange={(event) => handleChange('outputDirName', event.target.value)} />
              </label>

              <label className="image-compression-field">
                <span>JPG 质量</span>
                <input
                  type="number"
                  min="2"
                  max="31"
                  step="1"
                  value={form.quality}
                  onChange={(event) => handleChange('quality', event.target.value)}
                />
              </label>
            </div>

            <div className="image-compression-help">
              <strong>默认质量：4</strong>
              <span>推荐高质量档。数值范围 2-31，数值越小越清晰、体积越大；数值越大越模糊、体积越小。</span>
            </div>

            <div className="image-compression-help">
              <strong>支持格式</strong>
              <span>{supportedFormats.join(' / ')}。透明图片转成 JPG 后会变成非透明图片。</span>
            </div>

            <label className="image-compression-check">
              <input
                type="checkbox"
                checked={form.overwrite}
                onChange={(event) => handleChange('overwrite', event.target.checked)}
              />
              <span>目标 JPG 已存在时覆盖</span>
            </label>

            <label className="image-compression-check">
              <input
                type="checkbox"
                checked={form.generateVideo}
                onChange={(event) => handleChange('generateVideo', event.target.checked)}
              />
              <span>自动生成商品视频（在压缩输出目录下生成商品视频）</span>
            </label>

            {form.generateVideo ? (
              <>
                <div className="image-compression-grid">
                  <label className="image-compression-field">
                    <span>视频时长（秒）</span>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      step="1"
                      value={form.videoDuration}
                      onChange={(event) => handleChange('videoDuration', event.target.value)}
                    />
                  </label>
                  <label className="image-compression-field">
                    <span>输出分辨率</span>
                    <select
                      value={form.videoResolution}
                      onChange={(event) => handleChange('videoResolution', event.target.value)}
                    >
                      <option value="1080p">1080p (1920×1080)</option>
                      <option value="720p">720p (1280×720)</option>
                    </select>
                  </label>
                </div>
                <label className="image-compression-field">
                  <span>输出视频名</span>
                  <input
                    value={form.videoOutputName}
                    placeholder="商品视频"
                    onChange={(event) => handleChange('videoOutputName', event.target.value)}
                  />
                </label>
              </>
            ) : null}

            <div className="image-compression-actions">
              <button className="wb-button wb-button-primary" type="submit" disabled={compressMutation.isPending || generateVideoMutation.isPending}>
                {compressMutation.isPending ? '压缩中...' : generateVideoMutation.isPending ? '生成视频中...' : '开始压缩'}
              </button>
              <button className="wb-button ghost" type="button" onClick={() => setForm(defaultForm)}>
                重置
              </button>
            </div>

            {compressMutation.error ? (
              <div className="wb-feedback is-error">{compressMutation.error.message}</div>
            ) : null}

            {generateVideoMutation.error ? (
              <div className="wb-feedback is-error">{generateVideoMutation.error.message}</div>
            ) : null}

            {compressMutation.isPending ? (
              <div className="wb-feedback is-busy">正在调用 ffmpeg 处理图片，图片较多时需要等待一段时间。</div>
            ) : null}

            {generateVideoMutation.isPending ? (
              <div className="wb-feedback is-busy">正在调用 ffmpeg 合成商品视频，图片较多时需要等待一段时间。</div>
            ) : null}
          </form>
        </Panel>

        <Panel title="执行结果" subtitle="这里显示本次压缩后的目录数量、文件数量和体积变化。">
          {!result ? (
            <div className="image-compression-empty">尚未执行压缩。</div>
          ) : (
            <div className="image-compression-result">
              <div className="image-compression-summary">
                <Metric label="目录数量" value={`${result.directoryCount ?? 1} 个`} />
                <Metric label="图片数量" value={`${result.total} 张`} />
                <Metric label="已转换" value={`${result.converted} 张`} />
                <Metric label="压缩率" value={formatPercent(result.compressionRatio)} />
                <Metric label="原图体积" value={formatBytes(result.sourceBytes)} />
                <Metric label="输出体积" value={formatBytes(result.outputBytes)} />
              </div>

              <div className="image-compression-output">
                <span>处理模式</span>
                <strong>批量处理 {result.directoryCount ?? 1} 个目录</strong>
              </div>

              <div className="image-compression-directory-list">
                {(result.directories || [result]).map((directory) => (
                  <details className="image-compression-directory" key={directory.sourceDir} open>
                    <summary>
                      <span>{directory.sourceDir}</span>
                      <strong>{directory.converted}/{directory.total} 张</strong>
                    </summary>
                    <div className="image-compression-output">
                      <span>输出目录</span>
                      <strong>{directory.outputDir}</strong>
                    </div>
                    <div className="image-compression-table">
                      <div className="image-compression-table-head">
                        <span>文件</span>
                        <span>原图</span>
                        <span>JPG</span>
                        <span>压缩率</span>
                      </div>
                      {directory.items.map((item) => (
                        <div className="image-compression-row" key={item.outputPath}>
                          <span>{item.name}</span>
                          <span>{formatBytes(item.sourceSize)}</span>
                          <span>{formatBytes(item.outputSize)}</span>
                          <span>{item.skipped ? '已跳过' : formatPercent(item.compressionRatio)}</span>
                        </div>
                      ))}
                      {!directory.items.length ? (
                        <div className="image-compression-row">
                          <span>该目录没有可处理图片</span>
                          <span>-</span>
                          <span>-</span>
                          <span>-</span>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>

              {videoResult ? (
                <div className="image-compression-video-result">
                  <div className="image-compression-output">
                    <span>视频生成</span>
                    <strong>已自动生成商品视频</strong>
                  </div>
                  <div className="image-compression-summary">
                    <Metric label="生成视频" value={`${videoResult.totalVideos} 个`} />
                    <Metric label="处理图片" value={`${videoResult.totalImages} 张`} />
                    <Metric label="视频时长" value={`${videoResult.duration} 秒`} />
                    <Metric label="分辨率" value={`${videoResult.resolution?.width ?? 1920}×${videoResult.resolution?.height ?? 1080}`} />
                  </div>
                  <div className="image-compression-directory-list">
                    {videoResult.directories.map((dir) => (
                      <details className="image-compression-directory" key={dir.sourceDir} open>
                        <summary>
                          <span>{dir.sourceDir}</span>
                          <strong>{dir.error ? '失败' : `${dir.imageCount} 张 / ${formatBytes(dir.fileSize)}`}</strong>
                        </summary>
                        {dir.error ? (
                          <div className="image-compression-output">
                            <span>{dir.error}</span>
                          </div>
                        ) : (
                          <div className="image-compression-output">
                            <span>输出视频</span>
                            <strong>{dir.videoPath}</strong>
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="image-compression-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}
