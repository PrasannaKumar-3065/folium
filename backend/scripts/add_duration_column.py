import sqlite3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "storage" / "app.db"
conn = sqlite3.connect(str(p))
cur = conn.cursor()
cur.execute("PRAGMA table_info('question_papers')")
cols = [r[1] for r in cur.fetchall()]
print('Existing columns:', cols)

cols_to_add = {
    "duration_minutes": "INTEGER",
    "exam_title": "TEXT",
    "school_name": "TEXT",
    "grade_section": "TEXT",
    "exam_date": "TEXT",
    "instructions_text": "TEXT",
    "footer_text": "TEXT",
    "teacher_name": "TEXT",
}

for c, t in cols_to_add.items():
    if c not in cols:
        print(f"Adding {c} column...")
        cur.execute(f"ALTER TABLE question_papers ADD COLUMN {c} {t}")
        conn.commit()
        print(f"Added {c}")
    else:
        print(f"{c} already exists")

conn.close()
