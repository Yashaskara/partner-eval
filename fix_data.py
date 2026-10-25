"""One-time script to reassociate profile 1 data with the current user for kryj999@gmail.com.

Profile 1 (78 answers, 12 domains, 1 partner) is linked to old better-auth user ID
that no longer exists. This script links it to the current user ID instead, and
removes the empty duplicate profiles that were auto-created.
"""
import libsql_experimental as libsql
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = libsql.connect(os.getenv("TURSO_DATABASE_URL"), auth_token=os.getenv("TURSO_AUTH_TOKEN"))

OLD = "C0d58J7FiVsaTl2eNW2EdoHqMwSnbPM2"
NEW = "8noIGCW8i3tzRWAPMRqnpslCvkQmmAfB"

conn.execute("UPDATE profiles SET user_id = ? WHERE id = 1", (NEW,))
conn.execute("UPDATE partners SET user_id = ? WHERE user_id = ?", (NEW, OLD))
conn.execute("UPDATE conversations SET user_id = ? WHERE user_id = ?", (NEW, OLD))
conn.execute("UPDATE prep_questions SET user_id = ? WHERE user_id = ?", (NEW, OLD))
conn.execute("DELETE FROM profile_domains WHERE profile_id IN (8, 9)")
conn.execute("DELETE FROM profiles WHERE id IN (8, 9)")
conn.commit()

profile = conn.execute("SELECT id, user_id FROM profiles WHERE id = 1").fetchone()
print(f"Profile 1 now linked to: {profile[1]}")
print("Done! Your data should be back.")
