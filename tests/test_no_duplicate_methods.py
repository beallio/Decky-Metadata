import ast


def test_main_classes_do_not_define_duplicate_methods():
    with open("main.py", encoding="utf-8") as handle:
        tree = ast.parse(handle.read())
    duplicate_messages = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        names = [
            child.name
            for child in node.body
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            duplicate_messages.append(f"{node.name}: {', '.join(duplicates)}")

    assert not duplicate_messages, "duplicate methods found: " + "; ".join(duplicate_messages)
