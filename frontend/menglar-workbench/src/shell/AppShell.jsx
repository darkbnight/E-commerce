import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/tasks', label: '数据采集' },
  { to: '/results', label: '商品筛选' },
  { to: '/product-data-prep', label: '商品数据整理' },
  { to: '/product-content', label: '商品内容资产' },
  { to: '/shipping-calculator', label: '物流计算器' },
  { to: '/ozon-pricing', label: 'Ozon 快速定价' },
  { to: '/ozon-upload', label: 'Ozon 上货工具' },
  { to: '/image-compression', label: '图片压缩' },
  { to: '/video-generator', label: '商品视频生成' },
];

export function AppShell() {
  return (
    <div className="wb-shell">
      <aside className="wb-sidebar">
        <div className="wb-brand">
          <p className="wb-kicker">Menglar Workbench</p>
          <h1>萌拉数据工作台</h1>
          <p className="wb-copy">
            把采集任务、结果分析、内容资产核对、物流试算、Ozon 定价和上货工具拆开，避免单页面承担过多链路。
          </p>
        </div>

        <nav className="wb-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `wb-nav-item ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="wb-content">
        <Outlet />
      </section>
    </div>
  );
}
