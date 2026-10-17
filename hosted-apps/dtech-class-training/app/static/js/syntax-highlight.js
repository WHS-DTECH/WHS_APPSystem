/**
 * Code Syntax Highlighting Manager
 * Manages Prism.js integration for syntax highlighting and code formatting
 */

class SyntaxHighlighter {
    constructor() {
        this.initialized = false;
        this.init();
    }

    /**
     * Initialize syntax highlighting on page load and mutations
     */
    init() {
        if (typeof Prism === 'undefined') {
            console.warn('Prism.js not loaded');
            return;
        }

        // Highlight existing code blocks
        this.highlightAll();

        // Observe DOM for new code blocks (dynamic content)
        this.observeDOM();

        this.initialized = true;
    }

    /**
     * Highlight all code blocks on the page
     */
    highlightAll() {
        try {
            Prism.highlightAll();
        } catch (e) {
            console.error('Error highlighting code:', e);
        }
    }

    /**
     * Highlight a specific element
     */
    highlightElement(element) {
        try {
            Prism.highlightElement(element);
        } catch (e) {
            console.error('Error highlighting element:', e);
        }
    }

    /**
     * Observe DOM for new code blocks and highlight them
     */
    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            let shouldHighlight = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            if (node.tagName === 'CODE' || 
                                node.tagName === 'PRE' || 
                                node.querySelector && node.querySelector('code')) {
                                shouldHighlight = true;
                            }
                        }
                    });
                }
            });

            if (shouldHighlight) {
                setTimeout(() => this.highlightAll(), 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });
    }

    /**
     * Format code block with language detection
     */
    static formatCodeBlock(content, language = null) {
        const pre = document.createElement('pre');
        
        if (language) {
            pre.className = `language-${language}`;
        }

        const code = document.createElement('code');
        code.textContent = content;
        
        if (language) {
            code.className = `language-${language}`;
        }

        pre.appendChild(code);
        return pre;
    }

    /**
     * Detect language from common patterns
     */
    static detectLanguage(content) {
        if (/^#!\/bin\/bash|^\s*\$\s|^\.\//.test(content)) return 'bash';
        if (/^\s*import\s+|^\s*from\s+|^\s*def\s+|^\s*class\s+|print\(|if\s+__name__/.test(content)) return 'python';
        if (/^const\s+|let\s+|function\s+|=>|console\.log|document\./.test(content)) return 'javascript';
        if (/^<[a-z]|DOCTYPE|<html|<body|<script|<style/.test(content)) return 'markup';
        if (/^\s*\.|#\w+|color:|background:|border:|margin:|padding:/.test(content)) return 'css';
        if (/^SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+|CREATE\s+|DROP\s+/.test(content.toUpperCase())) return 'sql';
        return null;
    }

    /**
     * Wrap code content in proper pre/code tags if not already
     */
    static wrapCode(element, language = null) {
        if (element.tagName !== 'CODE' && element.tagName !== 'PRE') {
            return element;
        }

        if (element.parentElement && element.parentElement.tagName === 'PRE') {
            return element.parentElement;
        }

        const parent = element.parentElement || element.parentNode;
        const wasInPre = parent && parent.tagName === 'PRE';
        
        if (!wasInPre) {
            const pre = document.createElement('pre');
            pre.className = language ? `language-${language} line-numbers` : 'line-numbers';
            element.parentNode.replaceChild(pre, element);
            pre.appendChild(element);
        }

        return element.parentElement;
    }

    /**
     * Add copy button to code blocks
     */
    static addCopyButtons() {
        document.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.copy-btn')) return; // Already has button

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            copyBtn.title = 'Copy code to clipboard';

            copyBtn.addEventListener('click', () => {
                const code = pre.querySelector('code');
                const text = code.textContent;

                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    copyBtn.innerHTML = '<i class="fas fa-exclamation"></i> Copy failed';
                });
            });

            pre.style.position = 'relative';
            pre.appendChild(copyBtn);
        });
    }

    /**
     * Add line numbers to code blocks
     */
    static addLineNumbers() {
        document.querySelectorAll('pre code').forEach(code => {
            const pre = code.parentElement;
            
            if (!pre.classList.contains('line-numbers')) {
                pre.classList.add('line-numbers');
            }
        });
    }

    /**
     * Enhance code blocks with custom styling
     */
    static enhanceCodeBlocks() {
        document.querySelectorAll('pre').forEach(pre => {
            const language = pre.className.match(/language-(\w+)/);
            const langName = language ? language[1].toUpperCase() : 'CODE';

            // Add language label
            if (!pre.querySelector('.language-label')) {
                const label = document.createElement('span');
                label.className = 'language-label';
                label.textContent = langName;
                pre.insertBefore(label, pre.firstChild);
            }

            // Add syntax-highlight class
            if (!pre.classList.contains('syntax-highlight')) {
                pre.classList.add('syntax-highlight');
            }
        });
    }
}

/**
 * Initialize on DOM ready and re-run on dynamic content
 */
document.addEventListener('DOMContentLoaded', () => {
    const highlighter = new SyntaxHighlighter();
    
    // Add copy buttons after Prism highlights
    setTimeout(() => {
        SyntaxHighlighter.addCopyButtons();
        SyntaxHighlighter.addLineNumbers();
        SyntaxHighlighter.enhanceCodeBlocks();
    }, 500);

    // Re-run on dynamic content
    const observer = new MutationObserver((mutations) => {
        let hasCodeBlock = false;
        
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && (node.tagName === 'PRE' || node.querySelector?.('pre'))) {
                        hasCodeBlock = true;
                    }
                });
            }
        });

        if (hasCodeBlock) {
            setTimeout(() => {
                SyntaxHighlighter.addCopyButtons();
                SyntaxHighlighter.enhanceCodeBlocks();
            }, 300);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyntaxHighlighter;
}
