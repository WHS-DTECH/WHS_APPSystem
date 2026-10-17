/**
 * CODE SYNTAX HIGHLIGHTING - USAGE GUIDE
 * =====================================
 * 
 * Using Prism.js with the SyntaxHighlighter utility for code blocks
 */

/**
 * BASIC USAGE IN HTML TEMPLATES
 * ============================
 */

// Example 1: Simple Python code block
`<pre><code class="language-python">
def hello_world():
    print("Hello, World!")
    return True

if __name__ == "__main__":
    hello_world()
</code></pre>`;

// Example 2: JavaScript code block with line numbers
`<pre class="line-numbers"><code class="language-javascript">
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(result);
</code></pre>`;

// Example 3: HTML markup
`<pre><code class="language-markup">
<!DOCTYPE html>
<html>
<head>
    <title>Example Page</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>
</code></pre>`;

// Example 4: CSS code
`<pre><code class="language-css">
.container {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
}

.card {
    background: white;
    border-radius: 0.5em;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</code></pre>`;

// Example 5: SQL code
`<pre><code class="language-sql">
SELECT users.username, COUNT(posts.id) as post_count
FROM users
LEFT JOIN posts ON users.id = posts.user_id
GROUP BY users.id
ORDER BY post_count DESC;
</code></pre>`;

// Example 6: Bash/Shell commands
`<pre><code class="language-bash">
#!/bin/bash
# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py

# Check status
ps aux | grep python
</code></pre>`;

/**
 * SUPPORTED LANGUAGES
 * ==================
 */
const SUPPORTED_LANGUAGES = [
    'python',      // Python code
    'javascript',  // JavaScript/Node.js
    'css',         // CSS stylesheets
    'markup',      // HTML/XML
    'sql',         // SQL queries
    'bash',        // Shell/Bash scripts
    'json',        // JSON data
    'yaml',        // YAML configuration
];

/**
 * FEATURES INCLUDED
 * ================
 */
const FEATURES = {
    'Syntax Highlighting': 'Automatic color coding based on language',
    'Line Numbers': 'Add .line-numbers class to <pre> for line numbering',
    'Copy Button': 'Automatic copy-to-clipboard button in top-right',
    'Language Label': 'Displays detected language in top-right corner',
    'Language Detection': 'Auto-detects language from code patterns',
    'Dynamic Content': 'Highlights new code blocks added via JavaScript',
    'Line Highlighting': 'Highlight specific lines with data-line attribute',
    'Dark Mode': 'Respects system dark mode preferences',
    'Mobile Responsive': 'Optimized for touch devices',
    'Scrollbar Styling': 'Custom scrollbars for code blocks',
};

/**
 * JAVASCRIPT API USAGE
 * ===================
 */

// Example 1: Manual highlighting of all code blocks
if (typeof SyntaxHighlighter !== 'undefined') {
    SyntaxHighlighter.highlightAll();
}

// Example 2: Highlight a specific element
const codeBlock = document.querySelector('code');
if (typeof SyntaxHighlighter !== 'undefined') {
    SyntaxHighlighter.highlightElement(codeBlock);
}

// Example 3: Format code and insert into DOM
const code = `
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n - 1)
`;
const formatted = SyntaxHighlighter.formatCodeBlock(code, 'python');
document.body.appendChild(formatted);

// Example 4: Detect language from code content
const testCode = `const x = 42; console.log(x);`;
const language = SyntaxHighlighter.detectLanguage(testCode);
console.log(language); // Output: 'javascript'

// Example 5: Wrap existing code element
const codeEl = document.querySelector('code');
const wrappedEl = SyntaxHighlighter.wrapCode(codeEl, 'python');

// Example 6: Add copy buttons to all code blocks
SyntaxHighlighter.addCopyButtons();

// Example 7: Add line numbers
SyntaxHighlighter.addLineNumbers();

// Example 8: Enhance with language labels and styling
SyntaxHighlighter.enhanceCodeBlocks();

/**
 * CSS CUSTOMIZATION
 * ================
 */

// Custom color theme for syntax highlighting
`
<style>
    .syntax-highlight {
        background: #282c34;
        border-radius: 0.5em;
        margin: 1.5em 0;
    }

    .syntax-highlight code {
        color: #abb2bf;
        font-family: 'Fira Code', monospace;
    }

    .token.keyword { color: #c678dd; }
    .token.string { color: #98c379; }
    .token.function { color: #61afef; }
    .token.comment { color: #5c6370; }
</style>
`;

/**
 * COMMON PATTERNS
 * ==============
 */

// Pattern 1: Code block in lesson content
`
<div class="lesson-content">
    <h2>Python Functions</h2>
    <p>Here's how to write a simple function:</p>
    <pre><code class="language-python">
def greet(name):
    return f"Hello, {name}!"

print(greet("Alice"))  # Output: Hello, Alice!
    </code></pre>
</div>
`;

// Pattern 2: Multiple code examples with tabs
`
<div class="code-examples">
    <div class="example">
        <h3>Python Version</h3>
        <pre><code class="language-python">
# Python example
for i in range(5):
    print(i)
        </code></pre>
    </div>
    
    <div class="example">
        <h3>JavaScript Version</h3>
        <pre><code class="language-javascript">
// JavaScript example
for (let i = 0; i < 5; i++) {
    console.log(i);
}
        </code></pre>
    </div>
</div>
`;

// Pattern 3: Interactive code with line numbers and highlighting
`
<pre class="line-numbers" data-line="3,5-6"><code class="language-python">
def fibonacci(n):
    if n <= 1:
        return n  # Highlighted
    return fibonacci(n - 1) + fibonacci(n - 2)  # Highlighted
    # Next line also highlighted
</code></pre>
`;

/**
 * BEST PRACTICES
 * =============
 */

const BEST_PRACTICES = {
    'Use semantic HTML': 'Always wrap code in <pre><code> tags',
    'Specify language': 'Add language-{lang} class to <code> element',
    'Escape HTML entities': 'Use &lt; and &gt; for < and > in HTML',
    'Keep lines short': 'Aim for <80 characters to avoid horizontal scroll',
    'Use meaningful indentation': 'Shows code structure clearly',
    'Avoid very long blocks': 'Break into smaller, logical chunks',
    'Add explanatory text': 'Context helps learners understand code',
    'Include output examples': 'Show expected results after code blocks',
    'Use consistent formatting': 'Apply same style across all examples',
    'Test in multiple browsers': 'Ensure compatibility across platforms',
};

/**
 * TROUBLESHOOTING
 * ==============
 */

const TROUBLESHOOTING = {
    'Code not highlighting': 'Ensure language class is set correctly: language-{lang}',
    'Line numbers not showing': 'Add line-numbers class to <pre> element',
    'Copy button not working': 'Check that SyntaxHighlighter script is loaded',
    'Performance issues': 'Avoid highlighting very large code blocks (>1000 lines)',
    'Dynamic content not highlighted': 'Call SyntaxHighlighter.highlightAll() after inserting content',
    'Mobile scrolling awkward': 'Use overflow-x: auto on .syntax-highlight',
};

/**
 * PERFORMANCE TIPS
 * ===============
 */

// Lazy load syntax highlighting for below-fold content
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && typeof SyntaxHighlighter !== 'undefined') {
            SyntaxHighlighter.highlightElement(entry.target);
            observer.unobserve(entry.target);
        }
    });
});

document.querySelectorAll('pre code').forEach(el => {
    observer.observe(el);
});

/**
 * ACCESSIBILITY
 * =============
 */

// Screen reader accessible code blocks
`
<figure>
    <figcaption>Example Python function</figcaption>
    <pre><code class="language-python">
def hello():
    print("Hello!")
    </code></pre>
</figure>
`;

// With ARIA labels
`
<pre role="group" aria-label="Python code example">
    <code class="language-python">
def hello():
    print("Hello!")
    </code>
</pre>
`;
