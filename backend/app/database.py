"""SQLite connection helpers and one-time schema migration/seed."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from . import config
from .credentials import environment_credentials_enabled, environment_provider_credentials
from .storage import init_storage_schema

SCHEMA_VERSION = 2


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def db():
    config.DATA.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(config.DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=30000")
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def sync_environment_accounts(connection: sqlite3.Connection) -> None:
    """Expose explicitly configured Docker credentials as read-only account metadata."""
    if not environment_credentials_enabled():
        return
    provider_names = {"dashscope": "通义千问", "volcengine": "火山引擎", "minimax": "MiniMax", "mimo": "小米 MiMo"}
    for provider, display_name in provider_names.items():
        credentials = environment_provider_credentials(provider)
        if not credentials.get("api_key"):
            continue
        account_id = "env_" + provider
        timestamp = now()
        project_name = os.getenv("VOICE_STUDIO_VOLCENGINE_PROJECT_NAME", "").strip() if provider == "volcengine" else None
        connection.execute(
            """INSERT INTO provider_accounts
               (id, provider, display_name, account_ref, region, endpoint, status, secret_hint,
                verification_scope, verification_message, created_at, updated_at, last_verified_at)
               VALUES (?, ?, ?, ?, NULL, ?, 'configured', ?, 'environment', ?, ?, ?, NULL)
               ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,
                 account_ref=excluded.account_ref, endpoint=excluded.endpoint,
                 status='configured', secret_hint=excluded.secret_hint,
                 verification_scope='environment', verification_message=excluded.verification_message,
                 updated_at=excluded.updated_at, last_verified_at=NULL""",
            (
                account_id,
                provider,
                f"{display_name} · Docker 环境变量",
                project_name,
                config.PROVIDER_SPECS[provider]["default_endpoint"],
                "••••" + credentials["api_key"][-4:],
                "由 Docker 环境变量提供，不能在页面中修改。",
                timestamp,
                timestamp,
            ),
        )


def init_db() -> None:
    with db() as connection:
        current_version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        if current_version > SCHEMA_VERSION:
            raise RuntimeError(
                f"数据库版本 {current_version} 高于当前程序支持的版本 {SCHEMA_VERSION}"
            )
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS voices (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model_id TEXT NOT NULL,
              provider_voice_id TEXT, display_name TEXT NOT NULL, public_name TEXT NOT NULL, voice_type TEXT NOT NULL,
              status TEXT NOT NULL, languages TEXT NOT NULL, created_at TEXT NOT NULL, preview_asset TEXT,
              design_prompt TEXT NOT NULL DEFAULT '', provider_account_id TEXT, provider_project_name TEXT);
            CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, model TEXT NOT NULL, voice TEXT NOT NULL,
              input_chars INTEGER NOT NULL, status TEXT NOT NULL, duration_ms INTEGER, audio_path TEXT, created_at TEXT NOT NULL,
              source TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 1, input_text TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS gateway_clients (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, key_hash TEXT NOT NULL,
              key_prefix TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT);
            CREATE TABLE IF NOT EXISTS gateway_requests (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, provider TEXT,
              model TEXT, voice TEXT, status TEXT NOT NULL, status_code INTEGER NOT NULL, error_code TEXT,
              first_chunk_latency_ms INTEGER, total_latency_ms INTEGER, chunk_count INTEGER NOT NULL DEFAULT 0,
              audio_bytes INTEGER NOT NULL DEFAULT 0, input_chars INTEGER NOT NULL DEFAULT 0,
              response_format TEXT, native_streaming INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS gateway_model_aliases (
              alias TEXT PRIMARY KEY, model_id TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_gateway_requests_created_at ON gateway_requests(created_at);
            CREATE INDEX IF NOT EXISTS idx_gateway_requests_provider_model ON gateway_requests(provider, model);
            CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
            CREATE INDEX IF NOT EXISTS idx_voices_status_created_at ON voices(status, created_at);
            CREATE TABLE IF NOT EXISTS provider_accounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, display_name TEXT NOT NULL,
              account_ref TEXT, region TEXT, endpoint TEXT, status TEXT NOT NULL, secret_hint TEXT NOT NULL,
              verification_scope TEXT NOT NULL, verification_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              last_verified_at TEXT);
            CREATE TABLE IF NOT EXISTS provider_projects (id TEXT PRIMARY KEY, provider_account_id TEXT NOT NULL,
              project_name TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
              has_permission INTEGER, source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL, last_synced_at TEXT, has_api_key INTEGER,
              api_key_name TEXT, api_key_hint TEXT, api_key_remote_id TEXT,
              api_key_count INTEGER NOT NULL DEFAULT 0, api_key_last_synced_at TEXT,
              api_key_sync_error TEXT,
              UNIQUE(provider_account_id, project_name));
            CREATE INDEX IF NOT EXISTS idx_provider_projects_account ON provider_projects(provider_account_id);
            """
        )
        voice_columns = {row[1] for row in connection.execute("PRAGMA table_info(voices)").fetchall()}
        if "design_prompt" not in voice_columns:
            connection.execute("ALTER TABLE voices ADD COLUMN design_prompt TEXT NOT NULL DEFAULT ''")
        if "provider_account_id" not in voice_columns:
            connection.execute("ALTER TABLE voices ADD COLUMN provider_account_id TEXT")
        if "provider_project_name" not in voice_columns:
            connection.execute("ALTER TABLE voices ADD COLUMN provider_project_name TEXT")
        project_columns = {row[1] for row in connection.execute("PRAGMA table_info(provider_projects)").fetchall()}
        for column, definition in {
            "has_api_key": "INTEGER",
            "api_key_name": "TEXT",
            "api_key_hint": "TEXT",
            "api_key_remote_id": "TEXT",
            "api_key_count": "INTEGER NOT NULL DEFAULT 0",
            "api_key_last_synced_at": "TEXT",
            "api_key_sync_error": "TEXT",
        }.items():
            if column not in project_columns:
                connection.execute(f"ALTER TABLE provider_projects ADD COLUMN {column} {definition}")
        # Versions before project discovery stored one project on the account row.
        # Preserve it as a project record without changing existing account IDs.
        account_rows = connection.execute(
            "SELECT id, provider, account_ref, created_at, updated_at FROM provider_accounts WHERE provider='volcengine' AND account_ref IS NOT NULL AND TRIM(account_ref) != ''"
        ).fetchall()
        for account in account_rows:
            connection.execute(
                """INSERT OR IGNORE INTO provider_projects
                   (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    "pp_" + account["id"],
                    account["id"],
                    account["account_ref"],
                    account["account_ref"],
                    "active",
                    1,
                    "legacy",
                    account["created_at"],
                    account["updated_at"],
                    account["updated_at"],
                ),
            )
        connection.execute(
            """UPDATE voices SET model_id='minimax-voice-design'
               WHERE provider='minimax' AND voice_type='design' AND model_id='speech-2.8-turbo'"""
        )
        job_columns = {row[1] for row in connection.execute("PRAGMA table_info(jobs)").fetchall()}
        if "input_text" not in job_columns:
            connection.execute("ALTER TABLE jobs ADD COLUMN input_text TEXT NOT NULL DEFAULT ''")
        if "audio_cleaned_at" not in job_columns:
            connection.execute("ALTER TABLE jobs ADD COLUMN audio_cleaned_at TEXT")
        if "audio_cleanup_reason" not in job_columns:
            connection.execute("ALTER TABLE jobs ADD COLUMN audio_cleanup_reason TEXT")
        init_storage_schema(connection)
        if connection.execute("SELECT COUNT(*) FROM voices").fetchone()[0] == 0:
            seed = [
                ("voice_narrator", "minimax", "speech-2.8-turbo", "narrator", "旁白 · 沉稳", "narrator", "preset", "active", ["zh-CN", "en-US"]),
                ("voice_coral", "dashscope", "qwen3-tts-flash", "coral", "Coral · 清亮", "coral", "preset", "active", ["zh-CN"]),
                ("voice_nova", "volcengine", "seed-tts-2.0", "zh_female_vv_uranus_bigtts", "Vivi 2.0 · 通用女声", "volc-vivi", "preset", "active", ["zh-CN", "en-US"]),
            ]
            connection.executemany(
                "INSERT INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                [(a,b,c,d,e,f,g,h,json.dumps(i, ensure_ascii=False),now()) for a,b,c,d,e,f,g,h,i in seed],
            )
        connection.execute(
            "INSERT OR IGNORE INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            ("voice_local_demo", "demo", "local-demo", "local-demo", "本地演示音色", "local-demo", "preset", "active", json.dumps(["zh-CN", "en-US"], ensure_ascii=False), now()),
        )
        mimo_voices = [
            ("voice_mimo_default", "mimo_default", "MiMo 默认", "mimo-default", ["zh-CN", "en-US"]),
            ("voice_mimo_bingtang", "冰糖", "冰糖 · 清甜女声", "bingtang", ["zh-CN"]),
            ("voice_mimo_moli", "茉莉", "茉莉 · 自然女声", "moli", ["zh-CN"]),
            ("voice_mimo_suda", "苏打", "苏打 · 清朗男声", "suda", ["zh-CN"]),
            ("voice_mimo_baihua", "白桦", "白桦 · 沉稳男声", "baihua", ["zh-CN"]),
            ("voice_mimo_mia", "Mia", "Mia · English", "mia", ["en-US"]),
            ("voice_mimo_chloe", "Chloe", "Chloe · English", "chloe", ["en-US"]),
            ("voice_mimo_milo", "Milo", "Milo · English", "milo", ["en-US"]),
            ("voice_mimo_dean", "Dean", "Dean · English", "dean", ["en-US"]),
        ]
        connection.executemany(
            "INSERT OR IGNORE INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(voice_id, "mimo", "mimo-v2.5-tts", remote_id, name, alias, "preset", "active", json.dumps(languages, ensure_ascii=False), now()) for voice_id,remote_id,name,alias,languages in mimo_voices],
        )
        qwen_voices = [
            ("Cherry", "Cherry · 明快女声", "cherry", ["zh-CN", "en-US"]),
            ("Serena", "Serena · 温柔女声", "serena", ["zh-CN", "en-US"]),
            ("Ethan", "Ethan · 温暖男声", "ethan", ["zh-CN", "en-US"]),
            ("Chelsie", "Chelsie · 灵动女声", "chelsie", ["zh-CN", "en-US"]),
        ]
        for model_id, prefix in (("qwen3-tts-flash", "qwen_flash"), ("qwen3-tts-instruct-flash", "qwen_instruct")):
            connection.executemany(
                "INSERT OR IGNORE INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                [
                    (
                        f"voice_{prefix}_{remote_id.lower()}",
                        "dashscope",
                        model_id,
                        remote_id,
                        display_name,
                        f"{prefix.replace('_', '-')}-{alias}",
                        "preset",
                        "active",
                        json.dumps(languages, ensure_ascii=False),
                        now(),
                    )
                    for remote_id, display_name, alias, languages in qwen_voices
                    if not (model_id == "qwen3-tts-flash" and remote_id == "Cherry")
                ],
            )
        cosy_voices = [
            ("longanyang", "龙安阳 · 阳光男声", "longanyang"),
            ("longanhuan", "龙安欢 · 活力女声", "longanhuan"),
            ("longhuhu_v3", "龙呼呼 · 灵动女声", "longhuhu"),
        ]
        for model_id, prefix in (("cosyvoice-v3-flash", "cosy_flash"), ("cosyvoice-v3-plus", "cosy_plus")):
            connection.executemany(
                "INSERT OR IGNORE INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                [
                    (
                        f"voice_{prefix}_{alias}",
                        "dashscope",
                        model_id,
                        remote_id,
                        display_name,
                        f"{prefix.replace('_', '-')}-{alias}",
                        "preset",
                        "active",
                        json.dumps(["zh-CN", "en-US"], ensure_ascii=False),
                        now(),
                    )
                    for remote_id, display_name, alias in cosy_voices
                ],
            )
        connection.executemany(
            """UPDATE voices SET model_id=?,provider_voice_id=?,display_name=?
               WHERE id=? AND (model_id IS NOT ? OR provider_voice_id IS NOT ? OR display_name IS NOT ?)""",
            [
                ("speech-2.8-turbo", "presenter_male", "男性主持人", "voice_narrator", "speech-2.8-turbo", "presenter_male", "男性主持人"),
                ("qwen3-tts-flash", "Cherry", "Cherry · 明快女声", "voice_coral", "qwen3-tts-flash", "Cherry", "Cherry · 明快女声"),
                ("seed-tts-2.0", "zh_female_vv_uranus_bigtts", "Vivi 2.0 · 通用女声", "voice_nova", "seed-tts-2.0", "zh_female_vv_uranus_bigtts", "Vivi 2.0 · 通用女声"),
            ],
        )
        volcengine_voices = [
            ("voice_volc_vivi", "zh_female_vv_uranus_bigtts", "Vivi 2.0 · 通用女声", "volc-vivi"),
            ("voice_volc_xiaohe", "zh_female_xiaohe_uranus_bigtts", "小何 2.0 · 自然女声", "volc-xiaohe"),
            ("voice_volc_yunzhou", "zh_male_m191_uranus_bigtts", "云舟 2.0 · 稳重男声", "volc-yunzhou"),
            ("voice_volc_xiaotian", "zh_male_taocheng_uranus_bigtts", "小天 2.0 · 清朗男声", "volc-xiaotian"),
            ("voice_volc_sophie", "zh_female_sophie_uranus_bigtts", "魅力苏菲 2.0", "volc-sophie"),
            ("voice_volc_narrator", "zh_male_jieshuoxiaoming_uranus_bigtts", "解说小明 2.0", "volc-narrator"),
        ]
        connection.executemany(
            "INSERT OR IGNORE INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(voice_id, "volcengine", "seed-tts-2.0", remote_id, name, alias, "preset", "active", json.dumps(["zh-CN", "en-US"], ensure_ascii=False), now()) for voice_id,remote_id,name,alias in volcengine_voices],
        )
        connection.execute("DELETE FROM voices WHERE id='voice_nova'")
        connection.execute(
            "UPDATE voices SET status='legacy' WHERE provider='minimax' AND status='active' AND (model_id='speech-demo' OR provider_voice_id LIKE 'reference_%')"
        )
        connection.execute("UPDATE voices SET status='legacy' WHERE id='voice_minimax_presenter-male' AND status!='legacy'")
        aliases = {
            "tts-default": "mimo/mimo-v2.5-tts",
            "tts-fast": "dashscope/qwen3-tts-flash",
            "tts-hq": "mimo/mimo-v2.5-tts",
        }
        connection.executemany(
            "INSERT OR IGNORE INTO gateway_model_aliases (alias, model_id, updated_at) VALUES (?, ?, ?)",
            [(alias, model_id, now()) for alias, model_id in aliases.items()],
        )
        minimax_voices = [
            ("male-qn-qingse", "青涩青年音色", "qingse"),
            ("female-shaonv", "少女音色", "shaonv"),
            ("presenter_female", "女性主持人", "presenter-female"),
        ]
        connection.executemany(
            "INSERT OR IGNORE INTO voices (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (f"voice_minimax_{alias}", "minimax", "speech-2.8-turbo", remote_id, display_name, f"minimax-{alias}", "preset", "active", json.dumps(["zh-CN", "en-US"], ensure_ascii=False), now())
                for remote_id, display_name, alias in minimax_voices
            ],
        )
        # Older builds only checked aliases before inserting. Two concurrent
        # requests could therefore create duplicate active public names. Repair
        # any legacy duplicates deterministically after all seed migrations,
        # then enforce the rule atomically in SQLite.
        duplicate_aliases = connection.execute(
            """SELECT public_name FROM voices WHERE status='active'
               GROUP BY public_name HAVING COUNT(*) > 1"""
        ).fetchall()
        for duplicate in duplicate_aliases:
            rows = connection.execute(
                """SELECT id, public_name FROM voices
                   WHERE status='active' AND public_name=? ORDER BY created_at, id""",
                (duplicate["public_name"],),
            ).fetchall()
            for row in rows[1:]:
                base = row["public_name"][:89]
                candidate = f"{base}-{row['id'][-8:]}"
                counter = 2
                while connection.execute(
                    "SELECT 1 FROM voices WHERE status='active' AND public_name=?",
                    (candidate,),
                ).fetchone():
                    suffix = f"-{row['id'][-8:]}-{counter}"
                    candidate = row["public_name"][: 100 - len(suffix)] + suffix
                    counter += 1
                connection.execute("UPDATE voices SET public_name=? WHERE id=?", (candidate, row["id"]))
        connection.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS idx_voices_active_public_name
               ON voices(public_name) WHERE status='active'"""
        )
        sync_environment_accounts(connection)
        if current_version != SCHEMA_VERSION:
            connection.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        if connection.execute("SELECT COUNT(*) FROM gateway_clients").fetchone()[0] == 0:
            from .gateway_auth import gateway_key
            key = gateway_key()
            connection.execute("INSERT INTO gateway_clients VALUES (?,?,?,?,?,?,?)", ("client_demo", "本地演示客户端", hashlib.sha256(key.encode()).hexdigest(), key[:10], "active", now(), None))
        if current_version < SCHEMA_VERSION:
            connection.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
