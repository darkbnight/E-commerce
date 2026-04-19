import { motion } from 'motion/react';

export function Panel({ title, subtitle, actions = null, children }) {
  return (
    <motion.section
      className="wb-panel"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <header className="wb-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </motion.section>
  );
}
