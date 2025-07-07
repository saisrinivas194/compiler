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
const modeSelect = document.getElementById('mode-select');
const darkModeBtn = document.getElementById('dark-mode-btn');
const lightModeBtn = document.getElementById('light-mode-btn');
let isClassicDark = false;
let currentMode = 'python';

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

modeSelect.addEventListener('change', () => {
    currentMode = modeSelect.value;
    if (currentMode === 'python') {
        editor.session.setMode('ace/mode/python');
        editor.setValue("print('Hello, World!')", 1);
    } else {
        editor.session.setMode('ace/mode/sql');
        editor.setValue("SELECT sqlite_version();", 1);
    }
});

async function getInputsAndReplace(code) {
    // Regex to match input('prompt') or input()
    const inputRegex = /input\(([^)]*)\)/g;
    let match;
    let newCode = code;
    let inputValues = [];
    let inputPrompts = [];
    let inputMatches = [];
    // Collect all input() matches and their prompts
    while ((match = inputRegex.exec(code)) !== null) {
        let prompt = '';
        if (match[1]) {
            try {
                // Try to eval the prompt string (handles both '...' and "...")
                prompt = eval(match[1]);
            } catch {
                prompt = match[1];
            }
        }
        inputPrompts.push(prompt);
        inputMatches.push(match[0]);
    }
    // Prompt the user for each input
    for (let i = 0; i < inputPrompts.length; i++) {
        let value = window.prompt(inputPrompts[i] || 'Input:');
        if (value === null) value = '';
        // Always treat as string literal
        value = JSON.stringify(value);
        inputValues.push(value);
    }
    // Replace input() calls in order with user values
    let replaced = 0;
    newCode = newCode.replace(inputRegex, function() {
        return inputValues[replaced++];
    });
    return newCode;
}

async function runCode(debug = false) {
    let code = editor.getValue();
    outputDiv.textContent = debug ? 'Debugging...' : 'Running...';
    // Only do input() replacement in Python mode
    if (currentMode === 'python' && code.includes('input(')) {
        code = await getInputsAndReplace(code);
    }
    try {
        let response, result;
        if (currentMode === 'python') {
            response = await fetch('/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, debug })
            });
            result = await response.json();
            outputDiv.textContent = (result.output || '') + (result.error ? '\n' + result.error : '');
            saveHistory(code, debug ? 'debug' : 'run');
        } else {
            response = await fetch('/sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: code })
            });
            result = await response.json();
            if (result.error) {
                outputDiv.textContent = result.error;
            } else {
                outputDiv.textContent = JSON.stringify(result.result, null, 2);
            }
            saveHistory(code, 'sql');
        }
    } catch (err) {
        outputDiv.textContent = 'Error connecting to server.';
    }
}

runBtn.addEventListener('click', () => runCode(false));
debugBtn.addEventListener('click', () => runCode(true));

// Add Shift+Enter to run code
editor.commands.addCommand({
    name: 'runOnShiftEnter',
    bindKey: { win: 'Shift-Enter', mac: 'Shift-Enter' },
    exec: function() {
        runCode(false);
    },
    readOnly: false
});

// Custom completer using backend /suggest endpoint
const customCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        const code = editor.getValue();
        // Calculate cursor position as index in code string
        let cursor = session.doc.positionToIndex(pos);
        
        // Python operators and common functions
        const pythonOperators = [
            { caption: '+ (addition)', value: '+', meta: 'operator' },
            { caption: '- (subtraction)', value: '-', meta: 'operator' },
            { caption: '* (multiplication)', value: '*', meta: 'operator' },
            { caption: '/ (division)', value: '/', meta: 'operator' },
            { caption: '// (floor division)', value: '//', meta: 'operator' },
            { caption: '% (modulo)', value: '%', meta: 'operator' },
            { caption: '** (exponentiation)', value: '**', meta: 'operator' },
            { caption: '== (equal)', value: '==', meta: 'operator' },
            { caption: '!= (not equal)', value: '!=', meta: 'operator' },
            { caption: '< (less than)', value: '<', meta: 'operator' },
            { caption: '> (greater than)', value: '>', meta: 'operator' },
            { caption: '<= (less or equal)', value: '<=', meta: 'operator' },
            { caption: '>= (greater or equal)', value: '>=', meta: 'operator' },
            { caption: 'and (logical and)', value: 'and', meta: 'operator' },
            { caption: 'or (logical or)', value: 'or', meta: 'operator' },
            { caption: 'not (logical not)', value: 'not', meta: 'operator' },
            { caption: 'in (membership)', value: 'in', meta: 'operator' },
            { caption: 'is (identity)', value: 'is', meta: 'operator' },
            { caption: '+= (add and assign)', value: '+=', meta: 'operator' },
            { caption: '-= (subtract and assign)', value: '-=', meta: 'operator' },
            { caption: '*= (multiply and assign)', value: '*=', meta: 'operator' },
            { caption: '/= (divide and assign)', value: '/=', meta: 'operator' }
        ];

        const pythonFunctions = [
            { caption: 'print() - print to console', value: 'print()', meta: 'function' },
            { caption: 'len() - get length', value: 'len()', meta: 'function' },
            { caption: 'input() - get user input', value: 'input()', meta: 'function' },
            { caption: 'int() - convert to integer', value: 'int()', meta: 'function' },
            { caption: 'float() - convert to float', value: 'float()', meta: 'function' },
            { caption: 'str() - convert to string', value: 'str()', meta: 'function' },
            { caption: 'list() - create list', value: 'list()', meta: 'function' },
            { caption: 'dict() - create dictionary', value: 'dict()', meta: 'function' },
            { caption: 'tuple() - create tuple', value: 'tuple()', meta: 'function' },
            { caption: 'set() - create set', value: 'set()', meta: 'function' },
            { caption: 'range() - create range', value: 'range()', meta: 'function' },
            { caption: 'sum() - sum of items', value: 'sum()', meta: 'function' },
            { caption: 'max() - maximum value', value: 'max()', meta: 'function' },
            { caption: 'min() - minimum value', value: 'min()', meta: 'function' },
            { caption: 'abs() - absolute value', value: 'abs()', meta: 'function' },
            { caption: 'round() - round number', value: 'round()', meta: 'function' },
            { caption: 'sorted() - sort items', value: 'sorted()', meta: 'function' },
            { caption: 'reversed() - reverse items', value: 'reversed()', meta: 'function' },
            { caption: 'enumerate() - enumerate items', value: 'enumerate()', meta: 'function' },
            { caption: 'zip() - zip iterables', value: 'zip()', meta: 'function' },
            { caption: 'type() - get type', value: 'type()', meta: 'function' },
            { caption: 'isinstance() - check type', value: 'isinstance()', meta: 'function' },
            { caption: 'open() - open file', value: 'open()', meta: 'function' },
            { caption: 'help() - get help', value: 'help()', meta: 'function' },
            { caption: 'dir() - list attributes', value: 'dir()', meta: 'function' }
        ];

        const pythonKeywords = [
            { caption: 'if - conditional statement', value: 'if ', meta: 'keyword' },
            { caption: 'elif - else if', value: 'elif ', meta: 'keyword' },
            { caption: 'else - else clause', value: 'else:', meta: 'keyword' },
            { caption: 'for - for loop', value: 'for ', meta: 'keyword' },
            { caption: 'while - while loop', value: 'while ', meta: 'keyword' },
            { caption: 'def - define function', value: 'def ', meta: 'keyword' },
            { caption: 'class - define class', value: 'class ', meta: 'keyword' },
            { caption: 'return - return value', value: 'return ', meta: 'keyword' },
            { caption: 'break - break loop', value: 'break', meta: 'keyword' },
            { caption: 'continue - continue loop', value: 'continue', meta: 'keyword' },
            { caption: 'pass - do nothing', value: 'pass', meta: 'keyword' },
            { caption: 'import - import module', value: 'import ', meta: 'keyword' },
            { caption: 'from - from import', value: 'from ', meta: 'keyword' },
            { caption: 'as - alias', value: 'as ', meta: 'keyword' },
            { caption: 'try - try block', value: 'try:', meta: 'keyword' },
            { caption: 'except - except block', value: 'except:', meta: 'keyword' },
            { caption: 'finally - finally block', value: 'finally:', meta: 'keyword' },
            { caption: 'with - context manager', value: 'with ', meta: 'keyword' },
            { caption: 'lambda - lambda function', value: 'lambda ', meta: 'keyword' },
            { caption: 'yield - yield value', value: 'yield ', meta: 'keyword' },
            { caption: 'global - global variable', value: 'global ', meta: 'keyword' },
            { caption: 'nonlocal - nonlocal variable', value: 'nonlocal ', meta: 'keyword' },
            { caption: 'True - boolean true', value: 'True', meta: 'keyword' },
            { caption: 'False - boolean false', value: 'False', meta: 'keyword' },
            { caption: 'None - null value', value: 'None', meta: 'keyword' }
        ];

        // Math functions (math module)
        const mathFunctions = [
            { caption: 'math.sqrt() - square root', value: 'math.sqrt()', meta: 'math' },
            { caption: 'math.pow() - power function', value: 'math.pow()', meta: 'math' },
            { caption: 'math.ceil() - ceiling function', value: 'math.ceil()', meta: 'math' },
            { caption: 'math.floor() - floor function', value: 'math.floor()', meta: 'math' },
            { caption: 'math.sin() - sine function', value: 'math.sin()', meta: 'math' },
            { caption: 'math.cos() - cosine function', value: 'math.cos()', meta: 'math' },
            { caption: 'math.tan() - tangent function', value: 'math.tan()', meta: 'math' },
            { caption: 'math.pi - mathematical constant π', value: 'math.pi', meta: 'math' },
            { caption: 'math.e - mathematical constant e', value: 'math.e', meta: 'math' },
            { caption: 'math.log() - natural logarithm', value: 'math.log()', meta: 'math' },
            { caption: 'math.log10() - base-10 logarithm', value: 'math.log10()', meta: 'math' },
            { caption: 'math.exp() - exponential function', value: 'math.exp()', meta: 'math' },
            { caption: 'math.factorial() - factorial function', value: 'math.factorial()', meta: 'math' },
            { caption: 'math.gcd() - greatest common divisor', value: 'math.gcd()', meta: 'math' },
            { caption: 'math.degrees() - radians to degrees', value: 'math.degrees()', meta: 'math' },
            { caption: 'math.radians() - degrees to radians', value: 'math.radians()', meta: 'math' },
            { caption: 'math.isnan() - check if NaN', value: 'math.isnan()', meta: 'math' },
            { caption: 'math.isinf() - check if infinite', value: 'math.isinf()', meta: 'math' }
        ];

        // String functions
        const stringFunctions = [
            { caption: 'str.upper() - convert to uppercase', value: '.upper()', meta: 'string' },
            { caption: 'str.lower() - convert to lowercase', value: '.lower()', meta: 'string' },
            { caption: 'str.capitalize() - capitalize first letter', value: '.capitalize()', meta: 'string' },
            { caption: 'str.title() - title case', value: '.title()', meta: 'string' },
            { caption: 'str.strip() - remove whitespace', value: '.strip()', meta: 'string' },
            { caption: 'str.lstrip() - remove left whitespace', value: '.lstrip()', meta: 'string' },
            { caption: 'str.rstrip() - remove right whitespace', value: '.rstrip()', meta: 'string' },
            { caption: 'str.split() - split string', value: '.split()', meta: 'string' },
            { caption: 'str.join() - join strings', value: '.join()', meta: 'string' },
            { caption: 'str.replace() - replace substring', value: '.replace()', meta: 'string' },
            { caption: 'str.find() - find substring', value: '.find()', meta: 'string' },
            { caption: 'str.count() - count occurrences', value: '.count()', meta: 'string' },
            { caption: 'str.startswith() - check prefix', value: '.startswith()', meta: 'string' },
            { caption: 'str.endswith() - check suffix', value: '.endswith()', meta: 'string' },
            { caption: 'str.isdigit() - check if digits', value: '.isdigit()', meta: 'string' },
            { caption: 'str.isalpha() - check if alphabetic', value: '.isalpha()', meta: 'string' },
            { caption: 'str.isalnum() - check if alphanumeric', value: '.isalnum()', meta: 'string' },
            { caption: 'str.format() - format string', value: '.format()', meta: 'string' },
            { caption: 'f-string - formatted string literal', value: 'f""', meta: 'string' }
        ];

        // List functions
        const listFunctions = [
            { caption: 'list.append() - add item to end', value: '.append()', meta: 'list' },
            { caption: 'list.extend() - extend with iterable', value: '.extend()', meta: 'list' },
            { caption: 'list.insert() - insert at position', value: '.insert()', meta: 'list' },
            { caption: 'list.remove() - remove first occurrence', value: '.remove()', meta: 'list' },
            { caption: 'list.pop() - remove and return item', value: '.pop()', meta: 'list' },
            { caption: 'list.clear() - remove all items', value: '.clear()', meta: 'list' },
            { caption: 'list.index() - find index of item', value: '.index()', meta: 'list' },
            { caption: 'list.count() - count occurrences', value: '.count()', meta: 'list' },
            { caption: 'list.sort() - sort in place', value: '.sort()', meta: 'list' },
            { caption: 'list.reverse() - reverse in place', value: '.reverse()', meta: 'list' },
            { caption: 'list.copy() - shallow copy', value: '.copy()', meta: 'list' }
        ];

        // Dictionary functions
        const dictFunctions = [
            { caption: 'dict.get() - get value with default', value: '.get()', meta: 'dict' },
            { caption: 'dict.setdefault() - set default value', value: '.setdefault()', meta: 'dict' },
            { caption: 'dict.update() - update with items', value: '.update()', meta: 'dict' },
            { caption: 'dict.pop() - remove and return item', value: '.pop()', meta: 'dict' },
            { caption: 'dict.popitem() - remove last item', value: '.popitem()', meta: 'dict' },
            { caption: 'dict.clear() - remove all items', value: '.clear()', meta: 'dict' },
            { caption: 'dict.copy() - shallow copy', value: '.copy()', meta: 'dict' },
            { caption: 'dict.keys() - get all keys', value: '.keys()', meta: 'dict' },
            { caption: 'dict.values() - get all values', value: '.values()', meta: 'dict' },
            { caption: 'dict.items() - get all key-value pairs', value: '.items()', meta: 'dict' }
        ];

        // File operations
        const fileFunctions = [
            { caption: 'open() - open file', value: 'open()', meta: 'file' },
            { caption: 'file.read() - read entire file', value: '.read()', meta: 'file' },
            { caption: 'file.readline() - read one line', value: '.readline()', meta: 'file' },
            { caption: 'file.readlines() - read all lines', value: '.readlines()', meta: 'file' },
            { caption: 'file.write() - write to file', value: '.write()', meta: 'file' },
            { caption: 'file.writelines() - write lines', value: '.writelines()', meta: 'file' },
            { caption: 'file.close() - close file', value: '.close()', meta: 'file' },
            { caption: 'file.seek() - move file pointer', value: '.seek()', meta: 'file' },
            { caption: 'file.tell() - get current position', value: '.tell()', meta: 'file' }
        ];

        // Random functions
        const randomFunctions = [
            { caption: 'random.random() - random float 0-1', value: 'random.random()', meta: 'random' },
            { caption: 'random.randint() - random integer', value: 'random.randint()', meta: 'random' },
            { caption: 'random.choice() - random choice', value: 'random.choice()', meta: 'random' },
            { caption: 'random.shuffle() - shuffle sequence', value: 'random.shuffle()', meta: 'random' },
            { caption: 'random.sample() - random sample', value: 'random.sample()', meta: 'random' },
            { caption: 'random.uniform() - random float range', value: 'random.uniform()', meta: 'random' },
            { caption: 'random.seed() - set random seed', value: 'random.seed()', meta: 'random' }
        ];

        // Datetime functions
        const datetimeFunctions = [
            { caption: 'datetime.now() - current datetime', value: 'datetime.datetime.now()', meta: 'datetime' },
            { caption: 'datetime.today() - current date', value: 'datetime.date.today()', meta: 'datetime' },
            { caption: 'datetime.strptime() - parse string', value: 'datetime.datetime.strptime()', meta: 'datetime' },
            { caption: 'datetime.strftime() - format datetime', value: '.strftime()', meta: 'datetime' },
            { caption: 'datetime.timedelta() - time difference', value: 'datetime.timedelta()', meta: 'datetime' }
        ];

        // OS functions
        const osFunctions = [
            { caption: 'os.getcwd() - get current directory', value: 'os.getcwd()', meta: 'os' },
            { caption: 'os.listdir() - list directory contents', value: 'os.listdir()', meta: 'os' },
            { caption: 'os.mkdir() - create directory', value: 'os.mkdir()', meta: 'os' },
            { caption: 'os.remove() - remove file', value: 'os.remove()', meta: 'os' },
            { caption: 'os.rename() - rename file/directory', value: 'os.rename()', meta: 'os' },
            { caption: 'os.path.exists() - check if exists', value: 'os.path.exists()', meta: 'os' },
            { caption: 'os.path.join() - join path components', value: 'os.path.join()', meta: 'os' },
            { caption: 'os.path.basename() - get filename', value: 'os.path.basename()', meta: 'os' },
            { caption: 'os.path.dirname() - get directory name', value: 'os.path.dirname()', meta: 'os' }
        ];

        // JSON functions
        const jsonFunctions = [
            { caption: 'json.dumps() - serialize to string', value: 'json.dumps()', meta: 'json' },
            { caption: 'json.loads() - deserialize from string', value: 'json.loads()', meta: 'json' },
            { caption: 'json.dump() - serialize to file', value: 'json.dump()', meta: 'json' },
            { caption: 'json.load() - deserialize from file', value: 'json.load()', meta: 'json' }
        ];

        // NumPy functions
        const numpyFunctions = [
            { caption: 'np.array() - create numpy array', value: 'np.array()', meta: 'numpy' },
            { caption: 'np.zeros() - array of zeros', value: 'np.zeros()', meta: 'numpy' },
            { caption: 'np.ones() - array of ones', value: 'np.ones()', meta: 'numpy' },
            { caption: 'np.arange() - evenly spaced values', value: 'np.arange()', meta: 'numpy' },
            { caption: 'np.linspace() - linearly spaced values', value: 'np.linspace()', meta: 'numpy' },
            { caption: 'np.random.rand() - random array', value: 'np.random.rand()', meta: 'numpy' },
            { caption: 'np.random.randint() - random integers', value: 'np.random.randint()', meta: 'numpy' },
            { caption: 'np.random.normal() - normal distribution', value: 'np.random.normal()', meta: 'numpy' },
            { caption: 'np.mean() - arithmetic mean', value: 'np.mean()', meta: 'numpy' },
            { caption: 'np.median() - median value', value: 'np.median()', meta: 'numpy' },
            { caption: 'np.std() - standard deviation', value: 'np.std()', meta: 'numpy' },
            { caption: 'np.var() - variance', value: 'np.var()', meta: 'numpy' },
            { caption: 'np.sum() - sum of elements', value: 'np.sum()', meta: 'numpy' },
            { caption: 'np.min() - minimum value', value: 'np.min()', meta: 'numpy' },
            { caption: 'np.max() - maximum value', value: 'np.max()', meta: 'numpy' },
            { caption: 'np.argmin() - index of minimum', value: 'np.argmin()', meta: 'numpy' },
            { caption: 'np.argmax() - index of maximum', value: 'np.argmax()', meta: 'numpy' },
            { caption: 'np.reshape() - reshape array', value: 'np.reshape()', meta: 'numpy' },
            { caption: 'np.transpose() - transpose array', value: 'np.transpose()', meta: 'numpy' },
            { caption: 'np.dot() - dot product', value: 'np.dot()', meta: 'numpy' },
            { caption: 'np.matmul() - matrix multiplication', value: 'np.matmul()', meta: 'numpy' },
            { caption: 'np.sqrt() - square root', value: 'np.sqrt()', meta: 'numpy' },
            { caption: 'np.exp() - exponential', value: 'np.exp()', meta: 'numpy' },
            { caption: 'np.log() - natural logarithm', value: 'np.log()', meta: 'numpy' },
            { caption: 'np.sin() - sine function', value: 'np.sin()', meta: 'numpy' },
            { caption: 'np.cos() - cosine function', value: 'np.cos()', meta: 'numpy' },
            { caption: 'np.tan() - tangent function', value: 'np.tan()', meta: 'numpy' },
            { caption: 'np.abs() - absolute value', value: 'np.abs()', meta: 'numpy' },
            { caption: 'np.round() - round to decimals', value: 'np.round()', meta: 'numpy' },
            { caption: 'np.ceil() - ceiling function', value: 'np.ceil()', meta: 'numpy' },
            { caption: 'np.floor() - floor function', value: 'np.floor()', meta: 'numpy' },
            { caption: 'np.unique() - unique elements', value: 'np.unique()', meta: 'numpy' },
            { caption: 'np.where() - conditional selection', value: 'np.where()', meta: 'numpy' },
            { caption: 'np.concatenate() - join arrays', value: 'np.concatenate()', meta: 'numpy' },
            { caption: 'np.split() - split array', value: 'np.split()', meta: 'numpy' },
            { caption: 'np.save() - save array to file', value: 'np.save()', meta: 'numpy' },
            { caption: 'np.load() - load array from file', value: 'np.load()', meta: 'numpy' },
            { caption: 'np.eye() - identity matrix', value: 'np.eye()', meta: 'numpy' },
            { caption: 'np.diag() - diagonal matrix', value: 'np.diag()', meta: 'numpy' },
            { caption: 'np.trace() - trace of matrix', value: 'np.trace()', meta: 'numpy' },
            { caption: 'np.linalg.det() - determinant', value: 'np.linalg.det()', meta: 'numpy' },
            { caption: 'np.linalg.inv() - matrix inverse', value: 'np.linalg.inv()', meta: 'numpy' },
            { caption: 'np.linalg.eig() - eigenvalues', value: 'np.linalg.eig()', meta: 'numpy' },
            { caption: 'np.linalg.solve() - solve linear system', value: 'np.linalg.solve()', meta: 'numpy' }
        ];

        // Pandas functions
        const pandasFunctions = [
            { caption: 'pd.DataFrame() - create dataframe', value: 'pd.DataFrame()', meta: 'pandas' },
            { caption: 'pd.Series() - create series', value: 'pd.Series()', meta: 'pandas' },
            { caption: 'pd.read_csv() - read CSV file', value: 'pd.read_csv()', meta: 'pandas' },
            { caption: 'pd.read_excel() - read Excel file', value: 'pd.read_excel()', meta: 'pandas' },
            { caption: 'pd.read_json() - read JSON file', value: 'pd.read_json()', meta: 'pandas' },
            { caption: 'pd.read_sql() - read SQL query', value: 'pd.read_sql()', meta: 'pandas' },
            { caption: 'df.head() - first n rows', value: '.head()', meta: 'pandas' },
            { caption: 'df.tail() - last n rows', value: '.tail()', meta: 'pandas' },
            { caption: 'df.info() - dataframe info', value: '.info()', meta: 'pandas' },
            { caption: 'df.describe() - statistical summary', value: '.describe()', meta: 'pandas' },
            { caption: 'df.shape - dimensions', value: '.shape', meta: 'pandas' },
            { caption: 'df.columns - column names', value: '.columns', meta: 'pandas' },
            { caption: 'df.index - index', value: '.index', meta: 'pandas' },
            { caption: 'df.dtypes - data types', value: '.dtypes', meta: 'pandas' },
            { caption: 'df.isnull() - check for nulls', value: '.isnull()', meta: 'pandas' },
            { caption: 'df.dropna() - remove nulls', value: '.dropna()', meta: 'pandas' },
            { caption: 'df.fillna() - fill nulls', value: '.fillna()', meta: 'pandas' },
            { caption: 'df.drop() - drop rows/columns', value: '.drop()', meta: 'pandas' },
            { caption: 'df.rename() - rename columns', value: '.rename()', meta: 'pandas' },
            { caption: 'df.sort_values() - sort by values', value: '.sort_values()', meta: 'pandas' },
            { caption: 'df.groupby() - group by column', value: '.groupby()', meta: 'pandas' },
            { caption: 'df.merge() - merge dataframes', value: '.merge()', meta: 'pandas' },
            { caption: 'df.join() - join dataframes', value: '.join()', meta: 'pandas' },
            { caption: 'df.concat() - concatenate dataframes', value: 'pd.concat()', meta: 'pandas' },
            { caption: 'df.pivot_table() - create pivot table', value: '.pivot_table()', meta: 'pandas' },
            { caption: 'df.melt() - reshape to long format', value: '.melt()', meta: 'pandas' },
            { caption: 'df.pivot() - reshape to wide format', value: '.pivot()', meta: 'pandas' },
            { caption: 'df.query() - query dataframe', value: '.query()', meta: 'pandas' },
            { caption: 'df.loc[] - label-based indexing', value: '.loc[]', meta: 'pandas' },
            { caption: 'df.iloc[] - integer-based indexing', value: '.iloc[]', meta: 'pandas' },
            { caption: 'df.at[] - scalar accessor', value: '.at[]', meta: 'pandas' },
            { caption: 'df.iat[] - integer scalar accessor', value: '.iat[]', meta: 'pandas' },
            { caption: 'df.apply() - apply function', value: '.apply()', meta: 'pandas' },
            { caption: 'df.map() - map values', value: '.map()', meta: 'pandas' },
            { caption: 'df.replace() - replace values', value: '.replace()', meta: 'pandas' },
            { caption: 'df.duplicated() - find duplicates', value: '.duplicated()', meta: 'pandas' },
            { caption: 'df.drop_duplicates() - remove duplicates', value: '.drop_duplicates()', meta: 'pandas' },
            { caption: 'df.value_counts() - count values', value: '.value_counts()', meta: 'pandas' },
            { caption: 'df.corr() - correlation matrix', value: '.corr()', meta: 'pandas' },
            { caption: 'df.cov() - covariance matrix', value: '.cov()', meta: 'pandas' },
            { caption: 'df.to_csv() - save to CSV', value: '.to_csv()', meta: 'pandas' },
            { caption: 'df.to_excel() - save to Excel', value: '.to_excel()', meta: 'pandas' },
            { caption: 'df.to_json() - save to JSON', value: '.to_json()', meta: 'pandas' },
            { caption: 'df.to_sql() - save to database', value: '.to_sql()', meta: 'pandas' },
            { caption: 'df.plot() - create plot', value: '.plot()', meta: 'pandas' },
            { caption: 'df.hist() - histogram', value: '.hist()', meta: 'pandas' },
            { caption: 'df.boxplot() - box plot', value: '.boxplot()', meta: 'pandas' },
            { caption: 'df.scatter() - scatter plot', value: '.scatter()', meta: 'pandas' },
            { caption: 'df.rolling() - rolling window', value: '.rolling()', meta: 'pandas' },
            { caption: 'df.expanding() - expanding window', value: '.expanding()', meta: 'pandas' },
            { caption: 'df.shift() - shift data', value: '.shift()', meta: 'pandas' },
            { caption: 'df.diff() - difference', value: '.diff()', meta: 'pandas' },
            { caption: 'df.pct_change() - percentage change', value: '.pct_change()', meta: 'pandas' },
            { caption: 'df.cumsum() - cumulative sum', value: '.cumsum()', meta: 'pandas' },
            { caption: 'df.cumprod() - cumulative product', value: '.cumprod()', meta: 'pandas' },
            { caption: 'df.rank() - rank values', value: '.rank()', meta: 'pandas' },
            { caption: 'df.qcut() - quantile-based discretization', value: 'pd.qcut()', meta: 'pandas' },
            { caption: 'pd.cut() - bin values into intervals', value: 'pd.cut()', meta: 'pandas' },
            { caption: 'pd.get_dummies() - one-hot encoding', value: 'pd.get_dummies()', meta: 'pandas' },
            { caption: 'pd.to_datetime() - convert to datetime', value: 'pd.to_datetime()', meta: 'pandas' },
            { caption: 'pd.date_range() - date range', value: 'pd.date_range()', meta: 'pandas' },
            { caption: 'pd.Timestamp() - timestamp', value: 'pd.Timestamp()', meta: 'pandas' },
            { caption: 'pd.Timedelta() - time difference', value: 'pd.Timedelta()', meta: 'pandas' }
        ];

        // Common imports
        const commonImports = [
            { caption: 'import math - mathematical functions', value: 'import math', meta: 'import' },
            { caption: 'import random - random number generation', value: 'import random', meta: 'import' },
            { caption: 'import datetime - date and time', value: 'import datetime', meta: 'import' },
            { caption: 'import os - operating system interface', value: 'import os', meta: 'import' },
            { caption: 'import json - JSON encoder/decoder', value: 'import json', meta: 'import' },
            { caption: 'import sys - system-specific parameters', value: 'import sys', meta: 'import' },
            { caption: 'import re - regular expressions', value: 'import re', meta: 'import' },
            { caption: 'import time - time-related functions', value: 'import time', meta: 'import' },
            { caption: 'import collections - container datatypes', value: 'import collections', meta: 'import' },
            { caption: 'import itertools - iterator building blocks', value: 'import itertools', meta: 'import' },
            { caption: 'import numpy as np - numerical computing', value: 'import numpy as np', meta: 'import' },
            { caption: 'import pandas as pd - data manipulation', value: 'import pandas as pd', meta: 'import' },
            { caption: 'import matplotlib.pyplot as plt - plotting', value: 'import matplotlib.pyplot as plt', meta: 'import' },
            { caption: 'import seaborn as sns - statistical plotting', value: 'import seaborn as sns', meta: 'import' },
            { caption: 'import scipy - scientific computing', value: 'import scipy', meta: 'import' },
            { caption: 'import sklearn - machine learning', value: 'import sklearn', meta: 'import' },
            { caption: 'from math import sqrt, pi - specific imports', value: 'from math import sqrt, pi', meta: 'import' },
            { caption: 'from datetime import datetime - specific import', value: 'from datetime import datetime', meta: 'import' },
            { caption: 'from numpy import array, zeros, ones - numpy imports', value: 'from numpy import array, zeros, ones', meta: 'import' },
            { caption: 'from pandas import DataFrame, Series - pandas imports', value: 'from pandas import DataFrame, Series', meta: 'import' }
        ];

        // Combine all suggestions
        const staticSuggestions = [
            ...pythonOperators, 
            ...pythonFunctions, 
            ...pythonKeywords,
            ...mathFunctions,
            ...stringFunctions,
            ...listFunctions,
            ...dictFunctions,
            ...fileFunctions,
            ...randomFunctions,
            ...datetimeFunctions,
            ...osFunctions,
            ...jsonFunctions,
            ...numpyFunctions,
            ...pandasFunctions,
            ...commonImports
        ];
        
        fetch('/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, cursor })
        })
        .then(res => res.json())
        .then(data => {
            const backendSuggestions = (data.suggestions || []).map(s => ({
                caption: s,
                value: s,
                meta: 'suggestion'
            }));
            const allSuggestions = [...staticSuggestions, ...backendSuggestions];
            callback(null, allSuggestions);
        })
        .catch(() => {
            // If backend fails, still show static suggestions
            callback(null, staticSuggestions);
        });
    }
};

ace.require('ace/ext/language_tools').addCompleter(customCompleter);

function setClassicTheme(dark) {
    if (dark) {
        document.body.classList.add('classic-dark');
        themeIcon.textContent = '🌙';
        editor.setTheme('ace/theme/monokai');
    } else {
        document.body.classList.remove('classic-dark');
        themeIcon.textContent = '☀️';
        editor.setTheme('ace/theme/xcode');
    }
}

themeToggle.addEventListener('click', () => {
    isClassicDark = !isClassicDark;
    setClassicTheme(isClassicDark);
});

// Dark Mode button
if (darkModeBtn) {
    darkModeBtn.addEventListener('click', () => {
        isClassicDark = true;
        setClassicTheme(true);
    });
}
// Light Mode button
if (lightModeBtn) {
    lightModeBtn.addEventListener('click', () => {
        isClassicDark = false;
        setClassicTheme(false);
    });
}