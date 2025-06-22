# @Learnwithme-ssr Python Web Terminal

[![Learn Python and More Technologies on YouTube](https://img.shields.io/badge/YouTube-Learnwithme--ssr-red?logo=youtube)](https://www.youtube.com/@Learnwithme-ssr)

**Check out the [@Learnwithme-ssr YouTube channel](https://www.youtube.com/@Learnwithme-ssr) for learning Python and more technologies!**

---

A futuristic Python code compiler and runner with smart suggestions, instant output, debugging, and theme switching. Write, run, and debug Python code directly in your browser!

## Features
- Write and run Python code in your browser
- Smart code suggestions and autocomplete
- Automatic bracket, parenthesis, and quote completion
- Automatic indentation after colons
- Syntax highlighting
- Output and error display
- Debug mode for detailed error tracebacks
- Light/Dark theme toggle
- Code history (last 24h, stored in browser)

## Setup (Local)
1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-folder>
   ```
2. **Install dependencies:**
   ```bash
   pip install flask flask_cors jedi
   ```
3. **Run the app:**
   ```bash
   python app.py
   ```
4. **Open in browser:**
   Go to [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Deployment

### PythonAnywhere (Recommended for Beginners)
1. Sign up at [pythonanywhere.com](https://www.pythonanywhere.com/)
2. Upload your project files.
3. Set up a new Flask web app (point it to `app.py`).
4. Make sure your `static` and `templates` folders are referenced correctly.
5. Reload the web app from the dashboard.

### Render.com
1. Push your project to GitHub.
2. Create a new Web Service on [Render](https://render.com/), connect your repo.
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `python app.py` (or `gunicorn app:app` for production)
5. Add a `requirements.txt` if you don't have one:
    ```
    flask
    flask_cors
    jedi
    ```
6. Deploy!

### Heroku
1. Add a `requirements.txt` and a `Procfile`:
    - `requirements.txt`:
      ```
      flask
      flask_cors
      jedi
      ```
    - `Procfile`:
      ```
      web: python app.py
      ```
2. Initialize git, commit your code, and run:
    ```bash
    heroku create
    git push heroku main
    heroku open
    ```

## Folder Structure
```
├── app.py
├── static/
│   └── main.js
├── templates/
│   └── index.html
└── README.md
```

## License
MIT
