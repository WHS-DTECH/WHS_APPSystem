
// comment_activities.js
// Handles feedback for comment-writing activities in lessons

document.addEventListener('DOMContentLoaded', function() {
    // Support both .write-comment-activity and .comment-activity for backward compatibility
    document.querySelectorAll('.write-comment-activity, .comment-activity').forEach(function(activity) {
        // Support both .check-comment and .check-comment-btn
        var button = activity.querySelector('.check-comment, .check-comment-btn');
        var input = activity.querySelector('.comment-input');
        var feedback = activity.querySelector('.comment-feedback');
        if (!button || !input || !feedback) return;

        button.addEventListener('click', function() {
            console.log('Check Comment button clicked!');
            var comment = input.value.trim().toLowerCase();
            feedback.innerHTML = '';
            feedback.classList.remove('correct', 'incorrect');
            feedback.style.display = 'block';
            feedback.style.border = '2px solid #007bff';
            feedback.style.padding = '0.5em';
            feedback.style.marginTop = '0.5em';

            // Smart feedback logic (customize per activity)
            if (comment.includes('why') || comment.includes('free shipping') || comment.includes('business rule') || comment.includes('threshold')) {
                feedback.innerHTML = '✅ Good job! You explained the business logic behind the threshold.';
                feedback.classList.add('correct');
            } else if (comment.length < 10) {
                feedback.innerHTML = '❌ Please write a more detailed comment explaining WHY the threshold is 75.';
                feedback.classList.add('incorrect');
            } else if (comment.includes('no comment needed')) {
                feedback.innerHTML = '👍 Correct! This code is self-explanatory and does not need a comment.';
                feedback.classList.add('correct');
            } else {
                feedback.innerHTML = '❌ Try to explain the business reason for the threshold, not just what the code does.';
                feedback.classList.add('incorrect');
            }
        });
    });

    // Show Explanation button logic
    document.querySelectorAll('.show-explanation').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var targetId = btn.getAttribute('data-target');
            var box = document.getElementById(targetId);
            if (box) {
                if (box.style.display === 'none' || box.style.display === '') {
                    box.style.display = 'block';
                    btn.textContent = 'Hide Explanation';
                } else {
                    box.style.display = 'none';
                    btn.textContent = 'Show Explanation';
                }
            }
        });
    });
});
