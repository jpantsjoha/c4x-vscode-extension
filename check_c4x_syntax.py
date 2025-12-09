import re
import sys
import os

def check_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    in_c4x_block = False
    errors = []
    
    for i, line in enumerate(lines):
        if line.strip().startswith('```c4x'):
            in_c4x_block = True
            continue
        if line.strip().startswith('```'):
            in_c4x_block = False
            continue
            
        if in_c4x_block:
            # Check 1: Invalid Arrow '->' (but allow '-->', '==>', '-.->')
            # Lookbehind now excludes '.', '-', '='
            if re.search(r'(?<![-=.])->', line):
                 # One edge case: comment arrows? C4X comments are %%
                 if not line.strip().startswith('%%'):
                     errors.append((i+1, "Invalid Arrow: Found '->'. Use '-->'."))

            # Check 2: Invalid Subgraph 'subgraph ID[Label]'
            if 'subgraph' in line and '[' in line and ']' in line:
                if not 'subgraph' in line: # partial check
                     pass
                # strict regex for subgraph ID[
                if re.search(r'subgraph\s+\w+\[', line):
                     errors.append((i+1, "Invalid Subgraph: Found 'subgraph ID[...]'. Use 'subgraph ID {'."))

            # Check 3: Invalid Element Type 'Container Db'
            if 'Container Db' in line:
                errors.append((i+1, "Invalid Type: Found 'Container Db'. Use 'Container'."))

    return errors

def main():
    files = sys.argv[1:]
    has_error = False
    for filepath in files:
        if not os.path.isfile(filepath): 
            continue
        errors = check_file(filepath)
        if errors:
            has_error = True
            print(f"📄 {filepath}:")
            for line_num, msg in errors:
                print(f"  Line {line_num}: {msg}")
            print("")
    
    if not has_error:
        print("✅ No C4X syntax errors found.")

if __name__ == "__main__":
    main()
