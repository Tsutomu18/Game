import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

test('Dirty Dozen Security Rules Verification: All 8 Pillars Enforced', () => {
  // 1. Default-deny catch-all at top
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  // 2. Email verification enforced on writes
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);

  // 3. ID Poisoning Guard (isValidId regex and length <= 128)
  assert.match(rulesSource, /id\.size\(\) <= 128 && id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);

  // 4. Anti-Update-Gap: Validation blueprints enforce hasAll and hasOnly
  assert.match(rulesSource, /function isValidCloudSave\(data\)/);
  assert.match(rulesSource, /function isValidLeaderboardEntry\(data\)/);
  assert.match(rulesSource, /function isValidChatMessage\(data\)/);
  assert.match(rulesSource, /data\.keys\(\)\.hasAll\(/);
  assert.match(rulesSource, /data\.keys\(\)\.hasOnly\(/);

  // 5. Action-based update pattern with affectedKeys().hasOnly()
  assert.match(rulesSource, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);

  // 6. Temporal integrity with request.time
  assert.match(rulesSource, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesSource, /incoming\(\)\.updatedAt == request\.time/);

  // 7. Immortal fields protected on update
  assert.match(rulesSource, /incoming\(\)\.uid == existing\(\)\.uid/);
  assert.match(rulesSource, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);

  // 8. Query Enforcer: allow list checks resource.data or is false
  assert.match(rulesSource, /allow list: if false;/);
  assert.match(rulesSource, /allow list: if resource\.data\.score >= 0/);
  assert.match(rulesSource, /allow list: if resource\.data\.channel in \['global', 'gilde', 'ereignisse'\]/);
});
