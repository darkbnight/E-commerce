import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/tasks', label: '采集任务' },
  { to: '/results', label: '结果展示' },
  { to: '/shipping-calculator', label: '物流计算器' },
  { to: '/ozon-upload', label: 'Ozon上货工具' },
];

export function AppShell() {
  return (
    <div className="wb-shell">
      <aside className="wb-sidebar">
        <div className="wb-brand">
          <p className="wb-kicker">Menglar Workbench</p>
          <h1>萌拉数据工作台</h1>
          <p className="wb-copy">
            把采集任务、结果分析、物流试算和 Ozon 上货工具拆开，避免单页承担过多链路。
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
