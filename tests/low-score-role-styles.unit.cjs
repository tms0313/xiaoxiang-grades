const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'app-styles.js'), 'utf8');

test('admin low scores stay red regular-weight while parent and teacher results stay bold', () => {
  const globalRuleStart = styles.indexOf('/* 管理員登錄頁低分維持一般字重');
  const globalRuleEnd = styles.indexOf('document.head.appendChild(style);', globalRuleStart);
  assert.notEqual(globalRuleStart, -1, 'the scoped low-score rule must exist');
  assert.notEqual(globalRuleEnd, -1, 'the scoped low-score rule must be closed');

  const globalRule = styles.slice(globalRuleStart, globalRuleEnd);
  assert.match(globalRule, /\.low-score/);
  assert.match(globalRule, /font-weight:400 !important/);
  assert.doesNotMatch(globalRule, /parent-score-list|parent-score-number|parent-subject-result-value|teacher-score-value|teacher-page/,
    'the global regular-weight rule must not override parent or teacher result styles');

  assert.match(styles, /\.parent-score-list \.low-score[^\n]*font-weight:800 !important/,
    'parent query low scores must remain bold');
  assert.match(styles, /\.teacher-score-value \.low-score[^\n]*font-weight:900 !important/,
    'teacher query low scores must remain bold');
});
