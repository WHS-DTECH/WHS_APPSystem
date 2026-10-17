function showSolution(id) {
  var sol = document.getElementById(id);
  if (sol) sol.style.display = 'block';
}

function checkDebug1() {
  var answer = document.getElementById('debug1').value.toLowerCase();
  var feedback = document.getElementById('feedback1');
  if (answer.includes('greet()') || answer.includes('argument') || answer.includes('call')) {
    feedback.innerHTML = '<span style="color:green;">✔ Correct!</span>';
  } else {
    feedback.innerHTML = '<span style="color:#d9534f;">✘ Try again. Hint: Look at the function call.</span>';
  }
}

function checkDebug2() {
  var answer = document.getElementById('debug2').value.toLowerCase();
  var feedback = document.getElementById('feedback2');
  if (answer.includes('range') || answer.includes('index') || answer.includes('numbers[5]') || answer.includes('out of range')) {
    feedback.innerHTML = '<span style="color:green;">✔ Correct!</span>';
  } else {
    feedback.innerHTML = '<span style="color:#d9534f;">✘ Try again. Hint: Look at the loop and the list size.</span>';
  }
}

function checkDebug3() {
  var answer = document.getElementById('debug3').value.toLowerCase();
  var feedback = document.getElementById('feedback3');
  if (answer.includes('zero') || answer.includes('divide') || answer.includes('division')) {
    feedback.innerHTML = '<span style="color:green;">✔ Correct!</span>';
  } else {
    feedback.innerHTML = '<span style="color:#d9534f;">✘ Try again. Hint: What is b in divide(10, 0)?</span>';
  }
}

function checkDebug4() {
  var answer = document.getElementById('debug4').value.toLowerCase();
  var feedback = document.getElementById('feedback4');
  if (answer.includes('totals') || answer.includes('variable') || answer.includes('name')) {
    feedback.innerHTML = '<span style="color:green;">✔ Correct!</span>';
  } else {
    feedback.innerHTML = '<span style="color:#d9534f;">✘ Try again. Hint: Check the variable names.</span>';
  }
}
