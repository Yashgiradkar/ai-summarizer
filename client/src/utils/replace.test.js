import assert from 'assert';
import { replaceTextSafe } from './replaceText.js';

console.log('Running safe text replacement tests...');

// 1. Basic selection replacement in middle
{
  const original = 'Hello world.';
  const result = replaceTextSafe(original, 'developer', 6, 11, 'world');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.updatedText, 'Hello developer.');
}

// 2. Selection at beginning
{
  const original = 'Hello world.';
  const result = replaceTextSafe(original, 'Hi', 0, 5, 'Hello');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.updatedText, 'Hi world.');
}

// 3. Selection at end
{
  const original = 'Hello world.';
  const result = replaceTextSafe(original, 'everyone!', 6, 12, 'world.');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.updatedText, 'Hello everyone!');
}

// 4. Empty selection (insertion)
{
  const original = 'Hello world.';
  const result = replaceTextSafe(original, ' brave', 5, 5, '');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.updatedText, 'Hello brave world.');
}

// 5. Changed content after AI request (mismatch)
{
  const original = 'Hello world.';
  // User typed something else in the meantime, so original text is now 'Hello reader.'
  const mutated = 'Hello reader.';
  const result = replaceTextSafe(mutated, 'developer', 6, 11, 'world');
  assert.strictEqual(result.success, false);
  assert.match(result.error, /editor content in the selected range has changed/);
}

// 6. Invalid bounds
{
  const original = 'Hello';
  const result = replaceTextSafe(original, 'x', 2, 10, 'llo');
  assert.strictEqual(result.success, false);
  assert.match(result.error, /out of range/);
}

console.log('✅ All safe text replacement tests passed successfully!');
