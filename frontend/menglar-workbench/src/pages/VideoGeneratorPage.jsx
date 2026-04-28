import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Panel } from '../components/Panel';
import { generateProductVideos } from '../lib/api';

const defaultForm = {
  sourceDirs: 'G:\\work\\其他\\商品数据\\商品A\nG:\\work\\其他\\商品数据\\商品B',
  duration: 12,
  resolution: '1080p',
  outputVideoName: '商品视频',
};

const supportedFormats = ['JPG', 'JPEG', 'PNG', 'WEBP', 'BMP'];

export function VideoGeneratorPage() {
  const [form, setForm] = useState(defaultForm);

  const generateMutation = useMutation({
    mutationFn: generateProductVideos,
  });

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const dirs = form.sourceDirs
      .split('\n')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    generateMutation.mutate({
      directories: dirs,
      duration: Number(form.duration || 12),
      resolution: form.resolution || '1080p',
      outputVideoName: form.outputVideoName.trim() || '商品视频',
    });
  };

  const result = generateMutation.data;

  return (
    <div className="wb-page video-generator-page">
      <div className="wb-page-hero video-generator-hero">
        <div>
          <p className="wb-kicker">Local Video Tool</p>
          <h2>商品视频生成</h2>
          <p>输入商品图片目录，系统会把每目录下的图片拼成幻灯片视频，每张图均分时长，自动统一尺寸。</p>
        </div>
      </div>

      <div className="video-generator-layout">
        <Panel title="视频参数" subtitle="每行一个图片目录，每个目录生成一个 MP4 视频到该目录下。">
          <form className="video-generator-form" onSubmit={handleSubmit}>
            <label className="video-generator-field">
              <span>图片目录（每行一个）</span>
              <textarea
                value={form.sourceDirs}
                rows={6}
                placeholder={'例如：\nG:\\work\\其他\\商品数据\\商品A\nG:\\work\\其他\\商品数据\\商品B'}
                onChange={(event) => handleChange('sourceDirs', event.target.value)}
              />
            </label>

            <div className="video-generator-grid">
              <label className="video-generator-field">
                <span>视频时长（秒）</span>
                <input
                  type="number"
                  min="5"
                  max="300"
                  step="1"
                  value={form.duration}
                  onChange={(event) => handleChange('duration', event.target.value)}
                />
              </label>

              <label className="video-generator-field">
                <span>输出分辨率</span>
                <select
                  value={form.resolution}
                  onChange={(event) => handleChange('resolution', event.target.value)}
                >
                  <option value="1080p">1080p (1920×1080)</option>
                  <option value="720p">720p (1280×720)</option>
                </select>
              </label>
            </div>

            <label className="video-generator-field">
              <span>输出视频名</span>
              <input
                value={form.outputVideoName}
                placeholder="商品视频"
                onChange={(event) => handleChange('outputVideoName', event.target.value)}
              />
            </label>

            <div className="video-generator-help">
              <strong>时长：5-300 秒</strong>
              <span>图片均分时长，比如 5 张图 × 12 秒 = 每张显示约 2.4 秒。图片会按比例缩放并填充黑边至目标分辨率。</span>
            </div>

            <div className="video-generator-help">
              <strong>支持格式</strong>
              <span>{supportedFormats.join(' / ')}。非 JPG 格式会先转为 JPG 再合成视频。</span>
            </div>

            <div className="video-generator-actions">
              <button className="wb-button wb-button-primary" type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? '生成中...' : '开始生成'}
              </button>
              <button className="wb-button ghost" type="button" onClick={() => setForm(defaultForm)}>
                重置
              </button>
            </div>

            {generateMutation.error ? (
              <div className="wb-feedback is-error">{generateMutation.error.message}</div>
            ) : null}

            {generateMutation.isPending ? (
              <div className="wb-feedback is-busy">正在调用 ffmpeg 合成视频，图片较多时需要等待一段时间。</div>
            ) : null}
          </form>
        </Panel>

        <Panel title="生成结果" subtitle="这里显示本次生成的视频数量、图片数量和文件大小。">
          {!result ? (
            <div className="video-generator-empty">尚未生成视频。</div>
          ) : (
            <div className="video-generator-result">
              <div className="video-generator-summary">
                <Metric label="生成视频" value={`${result.totalVideos} 个`} />
                <Metric label="处理图片" value={`${result.totalImages} 张`} />
                <Metric label="视频时长" value={`${result.duration} 秒`} />
                <Metric label="输出分辨率" value={`${result.resolution?.width ?? 1920}×${result.resolution?.height ?? 1080}`} />
              </div>

              <div className="video-generator-directory-list">
                {result.directories.map((directory) => (
                  <details className="video-generator-directory" key={directory.sourceDir} open>
                    <summary>
                      <span>{directory.sourceDir}</span>
                      <strong>{directory.error ? '无图片' : `${directory.imageCount} 张 / ${formatBytes(directory.fileSize)}`}</strong>
                    </summary>
                    {directory.error ? (
                      <div className="video-generator-output">
                        <span>{directory.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className="video-generator-output">
                          <span>输出视频</span>
                          <strong>{directory.videoPath}</strong>
                        </div>
                        <div className="video-generator-output">
                          <span>图片数量</span>
                          <strong>{directory.imageCount} 张</strong>
                        </div>
                        <div className="video-generator-output">
                          <span>文件大小</span>
                          <strong>{formatBytes(directory.fileSize)}</strong>
                        </div>
                      </>
                    )}
                  </details>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="video-generator-metric">
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
