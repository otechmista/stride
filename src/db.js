import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const raw = new Database(filePath, { create: true });
  raw.exec('pragma journal_mode = WAL');
  raw.exec(`
    create table if not exists settings (
      key text primary key,
      value text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists jira_issues (
      id text primary key,
      issue_key text not null,
      summary text,
      issue_type text,
      status text,
      created_at text,
      resolved_at text,
      updated_at text,
      labels text,
      raw_json text not null
    );

    create table if not exists github_pull_requests (
      id integer primary key,
      number integer not null,
      title text,
      state text,
      base_ref text,
      created_at text,
      merged_at text,
      closed_at text,
      html_url text,
      raw_json text not null
    );

    create table if not exists github_deployments (
      id integer primary key,
      environment text,
      state text,
      created_at text,
      updated_at text,
      raw_json text not null
    );

    create table if not exists sync_runs (
      id integer primary key autoincrement,
      source text not null,
      status text not null,
      message text,
      created_at text not null default current_timestamp
    );
  `);

  const prColumns = raw.query('pragma table_info(github_pull_requests)').all().map((column) => column.name);
  if (!prColumns.includes('base_ref')) {
    raw.exec('alter table github_pull_requests add column base_ref text');
  }

  return {
    exec(sql) {
      return raw.exec(sql);
    },
    prepare(sql) {
      return raw.query(sql);
    },
    transaction(fn) {
      return (...args) => {
        raw.exec('begin');
        try {
          const result = fn(...args);
          raw.exec('commit');
          return result;
        } catch (error) {
          raw.exec('rollback');
          throw error;
        }
      };
    }
  };
}
