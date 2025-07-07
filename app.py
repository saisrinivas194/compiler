from flask import Flask, render_template, request, jsonify
import sys
import io
import traceback
from flask_cors import CORS
import jedi
import re
import os
import sqlite3
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/run', methods=['POST'])
def run_code():
    data = request.json
    code = data.get('code', '')
    debug = data.get('debug', False)
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirected_output = io.StringIO()
    redirected_error = io.StringIO()
    sys.stdout = redirected_output
    sys.stderr = redirected_error
    # Execute code in a fresh namespace
    exec_globals = {'__builtins__': __builtins__}
    exec_locals = {}
    try:
        exec(code, exec_globals, exec_locals)
    except Exception:
        if debug:
            traceback.print_exc()
        else:
            err = traceback.format_exc().splitlines()[-1]
            print(err, file=sys.stderr)
    sys.stdout = old_stdout
    sys.stderr = old_stderr
    output = redirected_output.getvalue()
    error = redirected_error.getvalue()
    return jsonify({'output': output, 'error': error})

@app.route('/suggest', methods=['POST'])
def suggest():
    data = request.json
    code = data.get('code', '')
    cursor_pos = data.get('cursor', 0)
    # Jedi completions
    script = jedi.Script(code, path='example.py')
    line = code[:cursor_pos].count('\n') + 1
    column = cursor_pos - code.rfind('\n', 0, cursor_pos) - 1
    completions = script.complete(line, column)
    suggestions = [c.name_with_symbols for c in completions]
    # Custom comment suggestions for variable assignments
    comment_suggestions = []
    assign_match = re.search(r'(\w+)\s*=\s*([\w\'\"]+)$', code[:cursor_pos])
    if assign_match:
        var_name, value = assign_match.groups()
        if value.startswith('"') or value.startswith("'"):
            comment_suggestions.append(f'# string')
        elif value.isdigit():
            comment_suggestions.append(f'# integer')
        elif value.replace('.', '', 1).isdigit():
            comment_suggestions.append(f'# float')
        elif value in ['True', 'False']:
            comment_suggestions.append(f'# boolean')
    return jsonify({'suggestions': suggestions + comment_suggestions})

@app.route('/sql', methods=['POST'])
def run_sql():
    data = request.json
    query = data.get('query', '')
    db_path = data.get('db_path', 'test.db')  # default SQLite DB
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(query)
        if query.strip().lower().startswith('select'):
            result = cursor.fetchall()
        else:
            conn.commit()
            result = f"{cursor.rowcount} rows affected."
        cursor.close()
        conn.close()
        return jsonify({'result': result, 'error': ''})
    except Exception as e:
        return jsonify({'result': '', 'error': str(e)})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True) 