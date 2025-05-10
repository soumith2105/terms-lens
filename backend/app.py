from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import requests
import google.generativeai as genai
import json
from bs4 import BeautifulSoup

from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        }
    },
)


genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("models/gemini-1.5-flash-8b-latest")

parsed_terms_store = {}  # Global dict to store {url: parsed_terms}


@app.route("/ask", methods=["POST"])
def ask_about_terms():
    try:
        data = request.get_json()
        question = data.get("question")
        url = data.get("url")

        if not question or not url:
            return jsonify({"error": "Missing question or context"}), 400

        prompt = (
            "You are a helpful assistant. A user has a question about some terms and rules from an API or website. "
            "Using the context below, answer their question simply and clearly in detail. If the answer isn't in the context, say so.\n\n"
            f"### CONTEXT:\n{parsed_terms_store[url]}\n\n"
            f"### PREVIOUS CHATS:\n{parsed_terms_store[url]["chats"]}\n"
            f"### QUESTION:\n{question}\n\n"
            "Answer:"
        )

        response = model.generate_content(prompt)
        answer = response.text.strip()
        parsed_terms_store[url]["chats"].append(
            {"question": question, "answer": answer}
        )
        return jsonify({"answer": response.text.strip()})

    except Exception as e:
        return jsonify({"error": str(e)})


@app.route("/analyze", methods=["POST"])
def analyze():
    summary = ""
    url_key = ""

    if "url" in request.form and request.form["url"]:
        url = request.form["url"]
        url_key = url
        summary, text = summarize_terms(url=url)
    else:
        return jsonify({"error": "No input provided"}), 400

    if isinstance(summary, dict):
        parsed_terms_store[url_key] = {
            "summary": summary,
            "text": text,
            "chats": [],
        }
    return jsonify(summary)


def clean_and_focus_text(html_text: str) -> str:
    soup = BeautifulSoup(html_text, "html.parser")
    for script in soup(["script", "style", "footer", "nav", "head"]):
        script.decompose()

    paragraphs = soup.find_all(["p", "li", "h1", "h2", "h3", "h4"])

    important_sections = []
    keywords = [
        "terms",
        "usage",
        "license",
        "privacy",
        "data",
        "limitation",
        "prohibited",
        "commercial",
        "redistribution",
    ]
    for tag in paragraphs:
        text = tag.get_text(separator=" ", strip=True)
        if any(kw in text.lower() for kw in keywords):
            important_sections.append(text)

    return "\n".join(important_sections)  # First 100 relevant blocks


def summarize_terms(url=None):
    text = ""
    if url:
        try:
            response = requests.get(url)
            response.raise_for_status()
            text = clean_and_focus_text(response.text)
        except Exception as e:
            return f"Failed to fetch or parse URL: {str(e)}"

    return extract_summary_from_text(text)


def extract_summary_from_text(text):
    try:
        prompt = (
            "You are a legal assistant. Read the following full API terms or documentation and condense it into a structured JSON object.\n\n"
            "**Explain the rules like you're talking to a smart kid** — simple, clear, and friendly. Use sentences and avoid difficult legal words.\n\n"
            "**But** also be **very detailed**. Don't just say 'they collect your data' — say what kind (like name, email, IP address, device info, usage patterns, etc.). \n"
            "Your goal is to make the hidden or easily missed parts obvious — the gray areas. Call out anything that users might skip over, misunderstand, or assume is harmless. \n"
            "If there are parts that give the company too much power (like 'we can remove your account anytime') or shift responsibility to the user — **highlight them**.\n\n"
            "Your job is to:\n"
            "1. Give a **Markdown-formatted summary** of the overall terms — clearly explaining what the service is, what users must agree to, and any tricky or surprising rules.\n"
            "2. For each of these 5 user roles below, explain what applies to them:\n"
            "   - 🧑 Public User\n"
            "   - 🧑‍💻 Developer\n"
            "   - 🏢 Non-Developer (like businesses, third-party tools)\n"
            "   - 🎓 Student\n"
            "   - 🧒 Minor\n\n"
            "3. For each role, return a list called `points`. Each item in `points` must be an object like this:\n"
            "{\n"
            '  "title": "Data Collected",\n'
            '  "items": ["<specific example of data>", "..."]\n'
            "}\n"
            "Use the following **4 titles** exactly:\n"
            "   - Data Collected\n"
            "   - Terms You Are Agreeing To\n"
            "   - Does\n"
            "   - Don'ts\n\n"
            "Each list of items should be as detailed as possible. For example:\n"
            "- Instead of saying: 'You agree to follow the rules'\n"
            "- Say: 'You agree not to overload the servers, or try to bypass login systems'\n\n"
            "4. If the terms do not mention the user type at all or it’s unclear whether they’re allowed, clearly return:\n"
            '"This kind of person is not really talked about in specific in the terms and conditions"\n\n'
            "5. Include a list called **importantNotices** — these are major red flags, risks, or powers the company holds (like no refunds, account removal, changes without notice, sharing data with 3rd parties, etc.). Be honest, not scary.\n\n"
            "✅ Validate your response and avoid hallucinating — only include what's actually stated in the terms.\n\n"
            "✅ Return only valid JSON in the following format:\n"
            "{\n"
            '  "summary": "<Markdown summary of overall terms>",\n'
            '  "userTypes": [\n'
            "    {\n"
            '      "userType": "🧑 Public User",\n'
            '      "points": [\n'
            "        {\n"
            '          "title": "Data Collected",\n'
            '          "items": ["IP address", "browser version", "actions taken on the site"]\n'
            "        },\n"
            "        {\n"
            '          "title": "Don\'ts",\n'
            '          "items": ["Don’t try to scrape data", "Don’t share your account with others"]\n'
            "        }\n"
            "      ]\n"
            "    },\n"
            "    ...(same for Developer, Non-Developer, Student, Minor)\n"
            "  ],\n"
            '  "importantNotices": [\n'
            '    "The company can delete your account anytime, even without notice.",\n'
            '    "They may share your data with authorities or partners under some conditions."\n'
            "  ]\n"
            "}\n\n"
            "⚠️ Do not include any extra commentary or markdown outside the JSON.\n\n"
            f"Here are the rules:\n{text}"
        )

        response = model.generate_content(prompt)
        raw = response.text.strip()

        # # Try to parse it into valid JSON
        # res = json.loads(raw)
        # print(raw)
        return (
            json.loads(
                raw.replace("```json\n", "")
                .replace("```", "")
                .replace("`", "")
                .replace("\n", "")
            ),
            text,
        )
    except Exception as e:
        return f"LLM summarization failed: {str(e)}"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
