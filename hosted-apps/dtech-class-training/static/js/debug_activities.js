// Debugging Practice Activities JS
function showSolution(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'block';
}
function checkDebug1(form) {
  const ans = form.answer.value.toLowerCase();
  if (ans.includes('greet()') || ans.includes('missing argument') || ans.includes('function call')) {
    form.querySelector('.feedback').textContent = '✅ Correct! greet() is missing a required argument.';
  } else {
    form.querySelector('.feedback').textContent = '❌ Try again. Hint: Look at the function call.';
  }
  return false;
}
function checkDebug2(form) {
  const ans = form.answer.value.toLowerCase();
  if (ans.includes('range(6)') || ans.includes('indexerror') || ans.includes('out of range')) {
    form.querySelector('.feedback').textContent = '✅ Correct! range(6) goes beyond the list length.';
  } else {
    form.querySelector('.feedback').textContent = '❌ Try again. Hint: Check the loop range and list size.';
  }
  return false;
}
function checkDebug3(form) {
  const ans = form.answer.value.toLowerCase();
  if (ans.includes('divide(10, 0)') || ans.includes('zero') || ans.includes('division by zero')) {
    form.querySelector('.feedback').textContent = '✅ Correct! Division by zero will cause an error.';
  } else {
    form.querySelector('.feedback').textContent = '❌ Try again. Hint: What happens when dividing by zero?';
  }
  return false;
}
function checkDebug4(form) {
  const ans = form.answer.value.toLowerCase();
  if (ans.includes('totals') || ans.includes('nameerror') || ans.includes('variable name')) {
    form.querySelector('.feedback').textContent = '✅ Correct! The variable should be total, not totals.';
  } else {
    form.querySelector('.feedback').textContent = '❌ Try again. Hint: Check the variable names.';
  }
  return false;
}
