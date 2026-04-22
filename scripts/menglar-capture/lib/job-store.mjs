import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, ROOT } from './constants.mjs';

export function nowIso() {
  return new Date().toISOString();
}

export function ensureSourceJobsSchema(db) {
  const columns = db.prepare('PRAGMA table_info(source_jobs)').all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ['request_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['success_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['record_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['error_type', 'TEXT'],
  ];

  for (const [name, definition] of additions) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE source_jobs ADD COLUMN ${name} ${definition}`);
    }
  }
}

export async function openMenglarDb() {
  await mkdir(path.join(ROOT, 'db'), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_name TEXT NOT NULL,
      page_url TEXT NOT NULL,
      page_type TEXT NOT NULL,
      pagination_mode TEXT NOT NULL,
      job_status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      raw_count INTEGER NOT NULL DEFAULT 0,
      normalized_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  ensureSourceJobsSchema(db);
  return db;
}

export function insertSourceJob(db, pageMeta) {
  ensureSourceJobsSchema(db);
  const ts = nowIso();
  const result = db.prepare(`
    INSERT INTO source_jobs (
      page_name, page_url, page_type, pagination_mode,
      job_status, started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pageMeta.pageName,
    pageMeta.targetUrl,
    pageMeta.pageType,
    pageMeta.paginationMode,
    'running',
    ts,
    ts,
    ts,
  );
  return Number(result.lastInsertRowid);
}

export function updateSourceJob(db, jobId, fields) {
  ensureSourceJobsSchema(db);
  const merged = {
    job_status: fields.job_status ?? 'running',
    finished_at: fields.finished_at ?? null,
    raw_count: fields.raw_count ?? 0,
    normalized_count: fields.normalized_count ?? 0,
    warning_count: fields.warning_count ?? 0,
    error_message: fields.error_message ?? null,
    request_count: fields.request_count ?? 0,
    success_count: fields.success_count ?? 0,
    record_count: fields.record_count ?? 0,
    error_type: fields.error_type ?? null,
    updated_at: nowIso(),
  };

  db.prepare(`
    UPDATE source_jobs
    SET job_status = ?,
        finished_at = ?,
        raw_count = ?,
        normalized_count = ?,
        warning_count = ?,
        error_message = ?,
        request_count = ?,
        success_count = ?,
        record_count = ?,
        error_type = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    merged.job_status,
    merged.finished_at,
    merged.raw_count,
    merged.normalized_count,
    merged.warning_count,
    merged.error_message,
    merged.request_count,
    merged.success_count,
    merged.record_count,
    merged.error_type,
    merged.updated_at,
    jobId,
  );
}
