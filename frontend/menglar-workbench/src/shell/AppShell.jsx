import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/tasks', label: '采集任务' },
  { to: '/results', label: '结果展示' },
];

export function AppShell() {
  return (
    <div className="wb-shell">
      <aside className="wb-sidebar">
        <div className="wb-brand">
          <p className="wb-kicker">Menglar Workbench</p>
          <h1>萌拉数据工作台</h1>
          <p className="wb-copy">把采集任务和结果展示拆开，后续再向一体化工作台扩展。</p>
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
