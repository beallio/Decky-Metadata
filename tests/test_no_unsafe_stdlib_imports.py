import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN_SOURCE = ROOT / "main.py"


def test_backend_does_not_import_decky_unsafe_stdlib_modules() -> None:
    source = MAIN_SOURCE.read_text(encoding="utf-8")
    tree = ast.parse(source)

    imported_modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.add(node.module)

    unsafe_modules = {"html.parser"}

    assert "from html.parser" not in source
    assert "import html.parser" not in source
    assert imported_modules.isdisjoint(unsafe_modules)
