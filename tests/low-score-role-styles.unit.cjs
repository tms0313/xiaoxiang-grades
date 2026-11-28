const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'app-styles.js'), 'utf8');

test('admin low scores use semibold while parent and teacher low scores retain their role-specific weights', () => {
  assert.match(styles, /"\\.low-score \\{ color:#d32626; font-weight:600; \\}"/,
    'global/admin low scores must use semibold 600');
  assert.match(styles, /"\\.parent-score-list \\.low-score \\{ color:#d32626 !important; font-weight:800 !important; \\}"/,
    'parent query low scores must retain weight 800');
  assert.match(styles, /"\\.teacher-score-value \\.low-score \\{ color:#d32626 !important; font-weight:600 !important; \\}"/,
    'teacher query low scores must use weight 600');
});
