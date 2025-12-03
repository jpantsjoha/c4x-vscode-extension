Start
  = _ directive:Directive? _ GraphKeyword _ direction:Direction _ statements:StatementList _ {
      const viewType = directive != null ? directive : 'system-context';
      const elements = [];
      const relationships = [];
      const boundaries = [];
      const classDefinitions = [];
      const classAssignments = [];
      for (const stmt of statements) {
        if (stmt.type === 'element') {
          elements.push(stmt);
        } else if (stmt.type === 'relationship') {
          relationships.push(stmt);
        } else if (stmt.type === 'boundary') {
          boundaries.push(stmt);
          // Add boundary elements to the elements array
          if (stmt.elements) {
            elements.push(...stmt.elements);
          }
        } else if (stmt.type === 'classDef') {
          classDefinitions.push(stmt);
        } else if (stmt.type === 'class') {
          classAssignments.push(stmt);
        }
      }
      const elementMap = new Map();
      for (const element of elements) {
        elementMap.set(element.id, element);
      }
      for (const assignment of classAssignments) {
        for (const target of assignment.targets) {
          const element = elementMap.get(target);
          if (element && !element.tags.includes(assignment.className)) {
            element.tags.push(assignment.className);
          }
        }
      }
      return { viewType, elements, relationships, boundaries, classDefinitions };
    }

Directive
  = "%%{" _ "c4:" _ view:Identifier _ "}%%" {
      return view.toLowerCase();
    }

GraphKeyword
  = "graph"

Direction
  = "TB" / "BT" / "LR" / "RL"

StatementList
  = head:Statement tail:(_ Statement)* {
      const result = [head];
      for (let i = 0; i < tail.length; i++) {
        if (tail[i][1]) {
          result.push(tail[i][1]);
        }
      }
      return result;
    }
  / _ { return []; }

Statement
  = Comment
  / ClassDef
  / ClassAssignment
  / Subgraph
  / Element
  / Relationship

ClassDef
  = "classDef" __ name:Identifier _ body:ClassDefBody? {
      return {
        type: 'classDef',
        name,
        styles: body ? body.trim() : undefined,
      };
    }

ClassAssignment
  = "class" __ targets:IdentifierList __ className:Identifier {
      return {
        type: 'class',
        targets,
        className,
      };
    }

IdentifierList
  = head:Identifier tail:(_ "," _ Identifier)* {
      const result = [head];
      for (let i = 0; i < tail.length; i++) {
        result.push(tail[i][3]);
      }
      return result;
    }

ClassDefBody
  = chars:(!"\n" .)+ { return chars.map(function(c) { return c[1]; }).join(''); }

Comment
  = "%%" (!"\n" .)* _ { return { type: 'comment' }; }

Subgraph
  = "subgraph" _ label:Identifier _ "{" _ elements:SubgraphElementList _ "}" _ {
      return { 
        type: 'boundary', 
        label: label, 
        elements: elements.filter(function(el) { return el.type === 'element'; }),
        relationships: elements.filter(function(el) { return el.type === 'relationship'; })
      };
    }

SubgraphElementList
  = head:SubgraphStatement tail:(_ SubgraphStatement)* {
      const result = [head];
      for (let i = 0; i < tail.length; i++) {
        if (tail[i][1]) {
          result.push(tail[i][1]);
        }
      }
      return result;
    }
  / _ { return []; }

SubgraphStatement
  = Comment
  / Element
  / Relationship

QuotedString
  = "\"" chars:(!("\"") .)* "\"" { return chars.map(function(c) { return c[1]; }).join(''); }

Element
  = id:Identifier _ "[" _ body:ElementBody _ "]" {
      if (body.length < 2) {
        const err = new Error("Elements must include label and type");
        err.location = location();
        throw err;
      }
      const label = body[0].trim();
      const type = body[1].trim();
      const tags = body.slice(2).map(function(l) { return l.trim(); }).filter(Boolean);
      return { type: 'element', id: id, label: label, elementType: type, tags: tags };
    }

ElementBody
  = head:ElementLine tail:(Break ElementLine)* {
      const lines = [head];
      for (let i = 0; i < tail.length; i++) {
        lines.push(tail[i][1]);
      }
      return lines;
    }

ElementLine
  = chars:(!("\n" / "[" / "]" / "<br/>") .)+ { return chars.map(function(c) { return c[1]; }).join('').trim(); }

Relationship
  = from:Identifier _ arrow:Arrow _ label:RelationshipLabel? _ to:Identifier {
      return { type: 'relationship', from: from, arrow: arrow, label: label != null ? label.trim() : '', to: to };
    }

RelationshipLabel
  = "|" chars:(!"|" .)* "|" { return chars.map(function(c) { return c[1]; }).join(''); }

Arrow
  = "-->" / "-.->" / "==>"

Identifier
  = $([a-zA-Z_][a-zA-Z0-9_\-]*)

Break
  = _ "<br/>" _

_
  = (Whitespace / Newline)*

__
  = (Whitespace / Newline)+

Whitespace
  = [ \t\r]+

Newline
  = "\n"
