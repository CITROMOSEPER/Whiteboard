"""The characters the recogniser knows (must match SETS in js/ink.js) and how dataset labels map to them."""

SETS = {
    "digit": "0123456789",
    "lower": "abcdefghijklmnopqrstuvwxyz",
    "upper": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "latinX": "ßıȷ",
    "punct": ".,;:!?'\"()[]{}/\\|-_+=*<>%&@#~^$€£",
    "math": "±×÷·≠≈≡≤≥≪≫∞∝√∫∬∮∑∏∂∇∈∉∋⊂⊃⊆⊇∪∩∅∀∃∄¬∧∨⊕⊗→←↔⇒⇐⇔↦↑↓∠⊥∥°′ℝℕℤℚℂ∴∵∘…ℏ‰",
    "greek": "αβγδεζηθικλμνξπρσςτυφϕχψωϑΓΔΘΛΞΦΨΩ",
    # Cyrillic is one class per letter regardless of case (the dataset mixes them);
    # the app decides capital or small from the size of the writing.
    "cyr": "абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ",
}
JUNK = "\u0000"   # "not a single character": two letters run together, scribbles

LABELS = [c for chars in SETS.values() for c in chars] + [JUNK]
INDEX = {c: i for i, c in enumerate(LABELS)}
assert len(INDEX) == len(LABELS), "duplicate character in SETS"

# HASYv2 LaTeX command -> character. Plain letters and digits map to themselves.
HASY = {
    "\\pm": "±", "\\times": "×", "\\div": "÷", "\\cdot": "·", "\\neq": "≠", "\\approx": "≈", "\\equiv": "≡",
    "\\leq": "≤", "\\geq": "≥", "\\ll": "≪", "\\gg": "≫", "\\infty": "∞", "\\propto": "∝", "\\sqrt{}": "√",
    "\\int": "∫", "\\iint": "∬", "\\oint": "∮", "\\sum": "∑", "\\prod": "∏", "\\partial": "∂", "\\nabla": "∇",
    "\\in": "∈", "\\notin": "∉", "\\ni": "∋", "\\subset": "⊂", "\\supset": "⊃", "\\subseteq": "⊆", "\\supseteq": "⊇",
    "\\cup": "∪", "\\cap": "∩", "\\emptyset": "∅", "\\varnothing": "∅", "\\forall": "∀", "\\exists": "∃", "\\nexists": "∄",
    "\\neg": "¬", "\\wedge": "∧", "\\vee": "∨", "\\oplus": "⊕", "\\otimes": "⊗",
    "\\rightarrow": "→", "\\to": "→", "\\leftarrow": "←", "\\leftrightarrow": "↔", "\\Rightarrow": "⇒", "\\Leftarrow": "⇐",
    "\\Leftrightarrow": "⇔", "\\mapsto": "↦", "\\uparrow": "↑", "\\downarrow": "↓",
    "\\angle": "∠", "\\perp": "⊥", "\\parallel": "∥", "\\degree": "°", "\\circ": "∘", "\\prime": "′",
    "\\mathbb{R}": "ℝ", "\\mathbb{N}": "ℕ", "\\mathbb{Z}": "ℤ", "\\mathbb{Q}": "ℚ", "\\mathbb{C}": "ℂ",
    "\\therefore": "∴", "\\because": "∵", "\\dots": "…", "\\hbar": "ℏ",
    "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\varepsilon": "ε", "\\zeta": "ζ", "\\eta": "η",
    "\\theta": "θ", "\\iota": "ι", "\\kappa": "κ", "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ", "\\pi": "π",
    "\\rho": "ρ", "\\sigma": "σ", "\\varsigma": "ς", "\\tau": "τ", "\\upsilon": "υ", "\\varphi": "φ", "\\phi": "ϕ",
    "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω", "\\vartheta": "ϑ",
    "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ", "\\Xi": "Ξ", "\\Phi": "Φ", "\\Psi": "Ψ", "\\Omega": "Ω",
    "\\%": "%", "\\&": "&", "\\#": "#", "\\$": "$", "\\{": "{", "\\}": "}", "[": "[", "]": "]", "|": "|", "\\mid": "|",
    "/": "/", "\\backslash": "\\", "+": "+", "-": "-", "<": "<", ">": ">", "\\pounds": "£", "\\sim": "~", "\\ast": "*",
    "\\ss": "ß",
    # Same symbol under another LaTeX name.
    "\\Sigma": "∑", "\\Pi": "∏", "\\bot": "⊥", "\\varpropto": "∝", "\\leqslant": "≤", "\\geqslant": "≥",
    "\\longrightarrow": "→", "\\Longrightarrow": "⇒", "\\Longleftrightarrow": "⇔", "\\longmapsto": "↦",
    "\\setminus": "\\", "\\|": "∥",
    "\\mathds{R}": "ℝ", "\\mathds{N}": "ℕ", "\\mathds{Z}": "ℤ", "\\mathds{Q}": "ℚ", "\\mathds{C}": "ℂ",
}
