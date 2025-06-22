console.log('main.js loaded');

const editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.session.setMode("ace/mode/python");

// Enable autocomplete, snippets, and auto-closing brackets/quotes
editor.setOptions({
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    enableSnippets: true
});
editor.setBehavioursEnabled(true);

const runBtn = document.getElementById('run-btn');
const debugBtn = document.getElementById('debug-btn');
const outputDiv = document.getElementById('output');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

function saveHistory(code, action) {
    const now = Date.now();
    let history = JSON.parse(localStorage.getItem('pyfuturist_history') || '[]');
    // Remove entries older than 24h
    history = history.filter(item => now - item.time < 24*60*60*1000);
    history.unshift({ code, action, time: now });
    // Keep only last 30 entries for sanity
    history = history.slice(0, 30);
    localStorage.setItem('pyfuturist_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    let history = JSON.parse(localStorage.getItem('pyfuturist_history') || '[]');
    const now = Date.now();
    history = history.filter(item => now - item.time < 24*60*60*1000);
    historyList.innerHTML = '';
    if (history.length === 0) {
        historyList.innerHTML = '<div style="color:var(--features-color);font-size:0.95rem;">No history in the last 24 hours.</div>';
        return;
    }
    history.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const date = new Date(item.time);
        div.innerHTML = `<b>[${item.action}]</b> ${date.toLocaleTimeString()}<br><code>${item.code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`;
        div.onclick = () => editor.setValue(item.code, 1);
        historyList.appendChild(div);
    });
}

// Call renderHistory on page load
renderHistory();

async function runCode(debug = false) {
    const code = editor.getValue();
    outputDiv.textContent = debug ? 'Debugging...' : 'Running...';
    try {
        const response = await fetch('/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, debug })
        });
        const result = await response.json();
        outputDiv.textContent = (result.output || '') + (result.error ? '\n' + result.error : '');
        saveHistory(code, debug ? 'debug' : 'run');
    } catch (err) {
        outputDiv.textContent = 'Error connecting to server.';
    }
}

runBtn.addEventListener('click', () => runCode(false));
debugBtn.addEventListener('click', () => runCode(true));

// Custom completer using backend /suggest endpoint
const customCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        const code = editor.getValue();
        // Calculate cursor position as index in code string
        let cursor = session.doc.positionToIndex(pos);
        fetch('/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, cursor })
        })
        .then(res => res.json())
        .then(data => {
            const completions = (data.suggestions || []).map(s => ({
                caption: s,
                value: s,
                meta: 'suggestion'
            }));
            callback(null, completions);
        })
        .catch(() => callback(null, []));
    }
};

ace.require('ace/ext/language_tools').addCompleter(customCompleter);

function setTheme(light) {
    if (light) {
        document.body.classList.add('light-theme');
        themeIcon.textContent = '☀️';
        editor.setTheme('ace/theme/xcode');
    } else {
        document.body.classList.remove('light-theme');
        themeIcon.textContent = '🌙';
        editor.setTheme('ace/theme/monokai');
    }
}

let isLight = false;
themeToggle.addEventListener('click', () => {
    isLight = !isLight;
    setTheme(isLight);
});